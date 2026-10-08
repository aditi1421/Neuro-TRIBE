from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import shutil
from threading import BoundedSemaphore
import time
from typing import Protocol
import numpy as np
from .analysis import Analyzer
from .config import ExperimentConfig, Settings
from .media import Media

class Predictor(Protocol):
    def predict(self, path: Path, modality: str, duration: int) -> tuple[np.ndarray, np.ndarray]: ...
    def provenance(self) -> dict: ...

class Jobs:
    def __init__(self, settings: Settings, predictor: Predictor):
        self.settings, self.predictor = settings, predictor
        self.analyzer = Analyzer(settings.brain_asset)
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='tribev2')
        self.slots = BoundedSemaphore(settings.max_pending_jobs)
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        for state in settings.data_dir.glob('*/status.json'):
            info = json.loads(state.read_text())
            if info['status'] in ('queued', 'running'):
                self.write(state.parent, dict(id=state.parent.name, status='failed', message='Service restarted. Submit the experiment again.'))

    @staticmethod
    def write(folder: Path, state: dict):
        temporary = folder / 'status.tmp'
        temporary.write_text(json.dumps(state))
        temporary.replace(folder / 'status.json')

    def clean_expired(self):
        cutoff = time.time() - self.settings.retention_hours * 3600
        for path in self.settings.data_dir.glob('*/status.json'):
            if path.stat().st_mtime < cutoff and json.loads(path.read_text())['status'] in ('completed', 'failed'):
                shutil.rmtree(path.parent)

    def execute(self, folder: Path, a: Path, b: Path, config: ExperimentConfig):
        def state(message: str, status: str = 'running'):
            self.write(folder, dict(id=folder.name, status=status, message=message))
        prepared: list[Path] = []
        try:
            state('Validating matched stimulus windows…')
            checksums = {f'stimulus_{k}_sha256': hashlib.sha256(p.read_bytes()).hexdigest() for k, p in [('a', a), ('b', b)]}
            for path, start in [(a, config.start_a), (b, config.start_b)]:
                prepared.append(Media.prepare(path, config.modality, start, config.duration))
            state('Loading models and predicting stimulus A. First-run downloads may take several minutes…')
            pa, ta = self.predictor.predict(prepared[0], config.modality, config.duration)
            state('Predicting stimulus B…')
            pb, tb = self.predictor.predict(prepared[1], config.modality, config.duration)
            state('Aligning timestamps and comparing anatomical regions…')
            summary, pa, pb = self.analyzer.compare(pa, ta, pb, tb, config.duration)
            result = dict(schema_version=1, id=folder.name, source='tribev2', created_at=datetime.now(timezone.utc).isoformat(),
                          config=config.model_dump(), provenance={**self.predictor.provenance(), **checksums}, **summary,
                          warnings=['Model predictions are exploratory and are not measurements of an individual or evidence of a causal effect.',
                                    'Only overlapping returned timestamps within the requested window are compared; the number of samples can differ from duration.',
                                    'ROI functional associations are approximate. A single stimulus pair does not support population inference.'])
            if config.modality == 'text':
                result['warnings'].append('Text uses the upstream gTTS speech synthesis and transcription pipeline; text is sent to that external service.')
            (folder / 'result.json').write_text(json.dumps(result, allow_nan=False))
            np.savez_compressed(folder / 'predictions.npz', a=pa, b=pb, times=np.asarray(summary['times']))
            state('Comparison ready.', 'completed')
        except ValueError as error:
            state(str(error), 'failed')
        except Exception:
            logging.exception('TRIBE job %s failed', folder.name)
            state('TRIBE inference failed. Check server logs for missing dependencies, gated model access, media decoding, or GPU memory.', 'failed')
        finally:
            for path in set([a, b, *prepared]):
                path.unlink(missing_ok=True)
            self.slots.release()
