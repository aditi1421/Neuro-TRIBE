from pathlib import Path
import numpy as np
import pytest
from neurosim.analysis import Analyzer, correlation

ASSET = Path(__file__).resolve().parents[2] / 'public/brain/fsaverage5.json'

def test_bilateral_roi_means_and_constant_signals():
    analyzer = Analyzer(ASSET)
    result, a, b = analyzer.compare(np.ones((4, 20484)), np.arange(4), np.zeros((4, 20484)), np.arange(4), 10)
    assert len(result['regions']) == 12
    assert all(r['delta'] == 1 and r['correlation'] is None for r in result['regions'])
    assert result['spatial_correlation'] is None
    assert a.shape == b.shape == (4, 20484)
    assert all(0 < r['vertices'] < 20484 for r in result['regions'])

def test_alignment_uses_timestamps_not_row_numbers():
    analyzer = Analyzer(ASSET)
    a = np.arange(5)[:, None] * np.ones((1, 20484))
    b = np.arange(6)[:, None] * np.ones((1, 20484))
    result, aa, bb = analyzer.compare(a, np.array([-1, 0, 2, 4, 12]), b, np.array([0, 1, 2, 3, 4, 12]), 10)
    assert result['times'] == [0, 2, 4]
    np.testing.assert_array_equal(aa[:, 0], [1, 2, 3])
    np.testing.assert_array_equal(bb[:, 0], [0, 2, 4])

def test_invalid_predictions_are_rejected():
    analyzer = Analyzer(ASSET)
    good = np.zeros((3, 20484))
    for data, times in [(np.full_like(good, np.nan), np.arange(3)), (good, np.array([0, 0, 1])), (np.zeros((3, 100)), np.arange(3))]:
        with pytest.raises(ValueError):
            analyzer.compare(data, times, good, np.arange(3), 10)

def test_correlations():
    assert correlation(np.ones(10), np.arange(10)) is None
    assert correlation(np.arange(10), -np.arange(10)) == pytest.approx(-1)
