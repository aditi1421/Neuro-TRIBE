"""Thin adapter around the official TRIBE API. No synthetic fallback."""
from pathlib import Path
import numpy as np
from .config import Settings

TRIBE_COMMIT = 'af58661791a351a448a489042a28f6c37e1c14b7'

class TribePredictor:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.model = None
        self.revision = ''

    def load(self):
        if self.model is not None:
            return
        from huggingface_hub import HfApi, snapshot_download
        from tribev2 import TribeModel
        import torch
        if self.settings.device == 'cuda' and not torch.cuda.is_available():
            raise RuntimeError('CUDA is unavailable. Start the service on a CUDA-enabled GPU host.')
        # Resolve once to an immutable revision and export it with every experiment.
        self.revision = HfApi().model_info(self.settings.model_id, revision=self.settings.model_revision).sha
        snapshot = snapshot_download(self.settings.model_id, revision=self.revision, allow_patterns=['config.yaml', 'best.ckpt'])
        self.model = TribeModel.from_pretrained(snapshot, cache_folder=str(self.settings.cache_dir), device=self.settings.device)

    def predict(self, path: Path, modality: str, duration: int) -> tuple[np.ndarray, np.ndarray]:
        self.load()
        events = self.model.get_events_dataframe(**{modality + '_path': str(path)})
        # Bound the model window while retaining the upstream text/audio processing.
        events = events[events['start'] < duration].copy()
        if 'duration' in events.columns:
            events['duration'] = np.minimum(events['duration'], duration - events['start'])
        predictions, segments = self.model.predict(events=events)
        return np.asarray(predictions, dtype=np.float32), np.array([float(s.start) for s in segments])

    def provenance(self) -> dict:
        return {'model': self.settings.model_id, 'model_revision': self.revision,
                'tribev2_commit': TRIBE_COMMIT, 'mesh': 'fsaverage5', 'atlas': 'Destrieux 2009',
                'hemisphere_order': 'left, right', 'units': 'native model output',
                'sample_interval_seconds': float(self.model.data.TR),
                'timing': 'Returned segment.start timestamps; upstream 5s hemodynamic offset retained; no additional shift.',
                'aggregation': 'Unweighted vertex means; anatomical ROIs pooled across hemispheres.'}
