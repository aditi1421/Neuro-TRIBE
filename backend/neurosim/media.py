import json
from pathlib import Path
import subprocess

SUFFIXES = {'video': {'.mp4', '.avi', '.mkv', '.mov', '.webm'}, 'audio': {'.wav', '.mp3', '.flac', '.ogg'}, 'text': {'.txt'}}

class Media:
    @staticmethod
    def prepare(source: Path, modality: str, start: float, duration: int) -> Path:
        if modality == 'text':
            text = source.read_text(encoding='utf-8')
            if not text.strip() or len(text) > 5000:
                raise ValueError('Text must contain 1–5,000 characters.')
            if start != 0:
                raise ValueError('Text comparisons require start times of zero.')
            return source
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(source)], capture_output=True, text=True, timeout=30, check=True)
        metadata = json.loads(probe.stdout)
        actual_duration = float(metadata.get('format', {}).get('duration', 0))
        if actual_duration + .05 < start + duration:
            raise ValueError(f'Stimulus is {actual_duration:.1f}s long; requested window ends at {start + duration:.1f}s.')
        streams = {s['codec_type'] for s in metadata['streams']}
        if 'audio' not in streams:
            raise ValueError('The official multimodal pipeline needs an audio track. Add a silent audio track to silent video before uploading.')
        if modality == 'video' and 'video' not in streams:
            raise ValueError('The uploaded file has no video stream.')
        target = source.with_name(source.stem + '-window' + ('.mp4' if modality == 'video' else '.wav'))
        command = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source), '-ss', str(start), '-t', str(duration)]
        if modality == 'video':
            command += ['-map', '0:v:0', '-map', '0:a:0', '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'aac']
        else:
            command += ['-vn', '-c:a', 'pcm_s16le']
        subprocess.run(command + [str(target)], capture_output=True, text=True, timeout=180, check=True)
        return target
