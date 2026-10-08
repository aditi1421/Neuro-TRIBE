import shutil
import subprocess
import pytest
from neurosim.media import Media

@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg unavailable')
def test_video_window_and_duration_check(tmp_path):
    source=tmp_path/'source.mp4'
    subprocess.run(['ffmpeg','-nostdin','-loglevel','error','-f','lavfi','-i','color=c=blue:s=32x32:r=5','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','11','-c:v','libx264','-c:a','aac',str(source)],check=True)
    prepared=Media.prepare(source,'video',1,10)
    assert prepared.is_file() and prepared.stat().st_size>0
    with pytest.raises(ValueError, match='requested window ends'):
        Media.prepare(source,'video',5,10)
