"""Export Nilearn's fsaverage5 mesh and Destrieux atlas without reordering vertices."""
import json
from pathlib import Path
import nibabel as nib
import numpy as np
from nilearn import datasets, surface

root = Path(__file__).resolve().parents[1]
mesh = datasets.fetch_surf_fsaverage('fsaverage5')
atlas = datasets.fetch_atlas_surf_destrieux(data_dir=root / 'data/atlas')
result = {'atlas': 'Destrieux 2009', 'mesh': 'fsaverage5', 'labels': list(atlas.labels)}
for hemi in ['left', 'right']:
    coords, faces = surface.load_surf_mesh(mesh['pial_' + hemi])
    result[hemi] = {'vertices': np.round(coords, 3).ravel().tolist(), 'faces': faces.ravel().tolist(),
                    'sulc': np.round(surface.load_surf_data(mesh['sulc_' + hemi]), 3).tolist(),
                    'labels': atlas['map_' + hemi].tolist()}
(root / 'public/brain/fsaverage5.json').write_text(json.dumps(result, separators=(',', ':')))
print('Exported two 10,242-vertex hemispheres with Destrieux labels.')
