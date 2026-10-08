from contextlib import asynccontextmanager
from importlib.util import find_spec
import json
from pathlib import Path
import secrets
import shutil
from uuid import UUID, uuid4
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError
from .config import ExperimentConfig, Settings
from .inference import TribePredictor
from .jobs import Jobs, Predictor
from .media import SUFFIXES

class BodyTooLarge(Exception):
    pass

class UploadLimit:
    def __init__(self, app, limit: int):
        self.app, self.limit = app, limit
    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] != 'POST':
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        try:
            declared = int(headers.get(b'content-length', b'0'))
        except ValueError:
            declared = self.limit + 1
        if declared > self.limit:
            return await JSONResponse({'detail': 'Upload is too large.'}, status_code=413)(scope, receive, send)
        count, started = 0, False
        async def bounded_receive():
            nonlocal count
            message = await receive()
            count += len(message.get('body', b''))
            if count > self.limit:
                raise BodyTooLarge()
            return message
        async def track_send(message):
            nonlocal started
            if message['type'] == 'http.response.start':
                started = True
            await send(message)
        try:
            await self.app(scope, bounded_receive, track_send)
        except BodyTooLarge:
            if not started:
                await JSONResponse({'detail': 'Upload is too large.'}, status_code=413)(scope, receive, send)

def create_app(settings: Settings | None = None, predictor: Predictor | None = None) -> FastAPI:
    settings = settings or Settings()
    jobs = Jobs(settings, predictor or TribePredictor(settings))
    @asynccontextmanager
    async def lifespan(app):
        yield
        jobs.pool.shutdown(wait=False, cancel_futures=True)
    app = FastAPI(title='NeuroSim — TRIBE v2 research API', version='0.1.0', lifespan=lifespan)
    app.state.jobs = jobs
    app.add_middleware(UploadLimit, limit=(2 * settings.max_upload_mb * 1024 * 1024) + 1024 * 1024)
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_methods=['GET', 'POST'], allow_headers=['Authorization', 'Content-Type'])
    def authorize(authorization: str = Header(default='')):
        key = settings.api_key.get_secret_value()
        if not key:
            raise HTTPException(503, 'Configure NEURO_API_KEY on the server first.')
        if not secrets.compare_digest(authorization, f'Bearer {key}'):
            raise HTTPException(401, 'Invalid service access key.')
    def folder_for(identifier: str) -> Path:
        try:
            canonical = str(UUID(identifier))
        except ValueError:
            raise HTTPException(404, 'Experiment not found.')
        path = settings.data_dir / canonical
        if not (path / 'status.json').is_file():
            raise HTTPException(404, 'Experiment not found.')
        return path
    @app.get('/health', dependencies=[Depends(authorize)])
    def health():
        ready = find_spec('tribev2') is not None and bool(shutil.which('ffmpeg')) and bool(shutil.which('ffprobe'))
        return dict(status='ok', inference_enabled=settings.enable_inference, dependencies_ready=ready, model=settings.model_id)
    @app.post('/experiments', status_code=202, dependencies=[Depends(authorize)])
    async def create_experiment(config: str = Form(...), stimulus_a: UploadFile = File(...), stimulus_b: UploadFile = File(...)):
        if not settings.enable_inference:
            raise HTTPException(503, 'Real inference is disabled. Enable NEURO_ENABLE_INFERENCE on your GPU server.')
        try:
            cfg = ExperimentConfig.model_validate_json(config)
        except ValidationError:
            raise HTTPException(422, 'Invalid experiment settings: use 10–60 seconds, valid start times, and video/audio/text modality.')
        if cfg.modality == 'text' and (cfg.start_a != 0 or cfg.start_b != 0):
            raise HTTPException(422, 'Text stimuli require start times of zero.')
        jobs.clean_expired()
        if not jobs.slots.acquire(blocking=False):
            raise HTTPException(429, 'The GPU queue is full. Retry after the current experiments finish.')
        identifier = str(uuid4())
        folder = settings.data_dir / identifier
        folder.mkdir()
        paths = []
        try:
            for name, upload in [('a', stimulus_a), ('b', stimulus_b)]:
                suffix = Path(upload.filename or '').suffix.lower()
                if suffix not in SUFFIXES[cfg.modality]:
                    raise HTTPException(415, f'Unsupported {cfg.modality} file extension.')
                path = folder / (name + suffix)
                total = 0
                with path.open('wb') as output:
                    while chunk := await upload.read(1024 * 1024):
                        total += len(chunk)
                        if total > settings.max_upload_mb * 1024 * 1024:
                            raise HTTPException(413, f'Each stimulus must be under {settings.max_upload_mb} MB.')
                        output.write(chunk)
                if total == 0:
                    raise HTTPException(422, 'Stimulus files cannot be empty.')
                paths.append(path)
            jobs.write(folder, dict(id=identifier, status='queued', message='Waiting for the GPU…'))
            jobs.pool.submit(jobs.execute, folder, paths[0], paths[1], cfg)
        except Exception:
            shutil.rmtree(folder)
            jobs.slots.release()
            raise
        finally:
            await stimulus_a.close()
            await stimulus_b.close()
        return dict(id=identifier, status='queued')
    @app.get('/experiments/{identifier}', dependencies=[Depends(authorize)])
    def status(identifier: str):
        return json.loads((folder_for(identifier) / 'status.json').read_text())
    @app.get('/experiments/{identifier}/result', dependencies=[Depends(authorize)])
    def result(identifier: str):
        path = folder_for(identifier) / 'result.json'
        if not path.exists():
            raise HTTPException(409, 'Results are not ready.')
        return FileResponse(path, media_type='application/json')
    @app.get('/experiments/{identifier}/predictions', dependencies=[Depends(authorize)])
    def predictions(identifier: str):
        path = folder_for(identifier) / 'predictions.npz'
        if not path.exists():
            raise HTTPException(409, 'Predictions are not ready.')
        return FileResponse(path, filename=f'neurosim-{identifier}.npz', media_type='application/octet-stream')
    return app
