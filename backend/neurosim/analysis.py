"""Descriptive comparisons; samples are never treated as independent subjects."""
import json
from pathlib import Path
import numpy as np

# Atlas names are verified at load time; indices are never guessed from coordinates.
ROI_NAMES = {
    'S_calcarine': 'Calcarine sulcus', 'Pole_occipital': 'Occipital pole',
    'G_occipital_middle': 'Middle occipital gyrus',
    'G_temp_sup-G_T_transv': 'Transverse temporal gyrus',
    'G_temp_sup-Lateral': 'Superior temporal gyrus',
    'S_intrapariet_and_P_trans': 'Intraparietal sulcus',
    'G_parietal_sup': 'Superior parietal lobule',
    'G_front_middle': 'Middle frontal gyrus',
    'G_and_S_cingul-Ant': 'Anterior cingulate', 'G_precuneus': 'Precuneus',
    'G_oc-temp_med-Parahip': 'Parahippocampal gyrus', 'G_precentral': 'Precentral gyrus',
}

def correlation(a: np.ndarray, b: np.ndarray) -> float | None:
    a, b = a - a.mean(), b - b.mean()
    denominator = np.linalg.norm(a) * np.linalg.norm(b)
    if denominator < 1e-12:
        return None
    return float(np.clip(np.dot(a, b) / denominator, -1, 1))

class Analyzer:
    def __init__(self, asset: Path):
        self.asset = json.loads(asset.read_text())
        self.labels = np.array(self.asset['left']['labels'] + self.asset['right']['labels'])
        if len(self.labels) != 20484 or self.asset['mesh'] != 'fsaverage5':
            raise ValueError('Expected left-then-right fsaverage5 vertex order.')
        self.names = self.asset['labels']
        self.valid = ~np.isin(self.labels, [self.names.index('Unknown'), self.names.index('Medial_wall')])
        self.rois = [(self.names.index(name), name, title) for name, title in ROI_NAMES.items()]

    def compare(self, a: np.ndarray, times_a: np.ndarray, b: np.ndarray, times_b: np.ndarray, duration: int) -> tuple[dict, np.ndarray, np.ndarray]:
        for data, times in [(a, times_a), (b, times_b)]:
            if data.ndim != 2 or data.shape != (len(times), 20484):
                raise ValueError('TRIBE output must be time × 20,484 fsaverage5 vertices.')
            if not np.isfinite(data).all() or not np.isfinite(times).all():
                raise ValueError('Model output contains non-finite values.')
            if len(np.unique(np.round(times, 6))) != len(times):
                raise ValueError('Duplicate model timestamps cannot be aligned unambiguously.')
        times, ia, ib = np.intersect1d(np.round(times_a, 6), np.round(times_b, 6), return_indices=True)
        keep = (times >= 0) & (times < duration)
        times, a, b = times[keep], a[ia[keep]], b[ib[keep]]
        if len(times) < 3:
            raise ValueError('Fewer than three matched prediction timestamps. Try longer stimuli.')
        surface_a, surface_b = a.mean(axis=0), b.mean(axis=0)
        regions = []
        for index, name, title in self.rois:
            mask = self.labels == index
            if not mask.any():
                raise ValueError(f'Atlas region is missing: {name}')
            series_a, series_b = a[:, mask].mean(axis=1), b[:, mask].mean(axis=1)
            ma, mb = float(series_a.mean()), float(series_b.mean())
            regions.append(dict(id=index, name=title, atlas_label=name, a=ma, b=mb,
                                delta=ma-mb, correlation=correlation(series_a, series_b),
                                series_a=series_a.tolist(), series_b=series_b.tolist(), vertices=int(mask.sum())))
        return dict(times=times.tolist(), regions=regions, surface_a=surface_a.tolist(),
                    surface_b=surface_b.tolist(), spatial_correlation=correlation(surface_a[self.valid], surface_b[self.valid])), a, b
