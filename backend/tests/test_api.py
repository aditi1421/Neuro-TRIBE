import json
import time
import numpy as np
import pytest
from fastapi.testclient import TestClient
from neurosim.app import create_app
from neurosim.config import Settings

class StubPredictor:
    def predict(self, path, modality, duration):
        return np.full((10, 20484), 1 if path.name.startswith('a') else .25), np.arange(10)
    def provenance(self):
        return dict(model='test-double', units='test', sample_interval_seconds=1)

@pytest.fixture
def setup(tmp_path):
    settings = Settings(api_key='unit-test-key', data_dir=tmp_path/'jobs', cache_dir=tmp_path/'cache', enable_inference=True, max_upload_mb=1)
    with TestClient(create_app(settings, StubPredictor())) as client:
        yield client, settings

AUTH = {'Authorization': 'Bearer unit-test-key'}
CONFIG = json.dumps({'modality': 'text', 'duration': 10})
FILES = {'stimulus_a': ('a.txt', b'A short example passage.'), 'stimulus_b': ('b.txt', b'Another example passage.')}

def wait_for(client, identifier):
    for _ in range(100):
        state = client.get('/experiments/'+identifier, headers=AUTH).json()
        if state['status'] in ['completed','failed']:
            return state
        time.sleep(.02)
    pytest.fail('Job did not complete')

def test_auth_and_bad_identifier(setup):
    client, _ = setup
    assert client.get('/health').status_code == 401
    assert client.get('/health', headers=AUTH).status_code == 200
    assert client.get('/experiments/not-a-uuid', headers=AUTH).status_code == 404

def test_validation_and_file_limits(setup):
    client, _ = setup
    assert client.post('/experiments', data={'config':'{bad'}, files=FILES, headers=AUTH).status_code == 422
    files = {**FILES, 'stimulus_a':('a.exe',b'hello')}
    assert client.post('/experiments', data={'config':CONFIG}, files=files, headers=AUTH).status_code == 415
    files = {**FILES, 'stimulus_a':('a.txt',b'x'*(1024*1024+1))}
    assert client.post('/experiments', data={'config':CONFIG}, files=files, headers=AUTH).status_code == 413

def test_disabled_inference_has_no_demo_fallback(setup):
    client, settings = setup
    settings.enable_inference = False
    response=client.post('/experiments', data={'config':CONFIG}, files=FILES, headers=AUTH)
    assert response.status_code == 503
    assert 'disabled' in response.json()['detail']

def test_completed_job_and_exports(setup):
    client, settings = setup
    response=client.post('/experiments', data={'config':CONFIG}, files=FILES, headers=AUTH)
    assert response.status_code == 202
    identifier=response.json()['id']
    assert wait_for(client,identifier)['status']=='completed'
    result=client.get(f'/experiments/{identifier}/result', headers=AUTH).json()
    assert result['source']=='tribev2'
    assert all(r['delta']==.75 for r in result['regions'])
    assert len(result['provenance']['stimulus_a_sha256'])==64
    assert client.get(f'/experiments/{identifier}/predictions', headers=AUTH).status_code==200
    assert not list((settings.data_dir/identifier).glob('*.txt'))

def test_failure_has_no_results(setup):
    client, _ = setup
    files={**FILES,'stimulus_a':('a.txt',b' ')}
    identifier=client.post('/experiments',data={'config':CONFIG},files=files,headers=AUTH).json()['id']
    assert wait_for(client,identifier)['status']=='failed'
    assert client.get(f'/experiments/{identifier}/result',headers=AUTH).status_code==409
