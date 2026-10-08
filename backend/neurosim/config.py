from pathlib import Path
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='NEURO_', env_file='.env', extra='ignore')
    api_key: SecretStr = SecretStr('')
    enable_inference: bool = False
    allowed_origins: list[str] = ['http://127.0.0.1:5173', 'http://localhost:5173']
    data_dir: Path = Path('./jobs')
    cache_dir: Path = Path('./cache')
    brain_asset: Path = Path(__file__).resolve().parents[2] / 'public/brain/fsaverage5.json'
    model_id: str = 'facebook/tribev2'
    model_revision: str = 'main'
    device: str = 'cuda'
    max_upload_mb: int = Field(default=250, ge=1, le=1000)
    max_pending_jobs: int = Field(default=2, ge=1, le=10)
    retention_hours: int = Field(default=24, ge=1, le=720)

class ExperimentConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(default='Stimulus comparison', min_length=1, max_length=200)
    hypothesis: str = Field(default='', max_length=2000)
    duration: int = Field(default=30, ge=10, le=60)
    start_a: float = Field(default=0, ge=0, le=3600, allow_inf_nan=False)
    start_b: float = Field(default=0, ge=0, le=3600, allow_inf_nan=False)
    modality: Literal['video', 'audio', 'text'] = 'video'
