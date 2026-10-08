# Run NeuroSim on a GPU

The web interface and the model server are separate. The interface can be hosted inexpensively; the API needs a CUDA-capable machine and downloads several models.

## 1. Choose a host

For initial testing, use a **RunPod Pod with one NVIDIA A100 80GB**, at least **64GB system RAM**, and **150GB persistent storage**. These are conservative starting allocations, **not measured minimums**. Benchmark before downsizing. RunPod’s current inventory and prices determine availability and cost; inspect them before renting. Stop the GPU when finished; retained storage may still incur charges.

Choose a PyTorch template, and use **Python 3.11**. Do not assume the template’s preinstalled Torch version matches TRIBE: the upstream source currently requires Torch >=2.5.1,<2.7. Use an isolated environment. Put the repository, virtual environment, model cache, and experiment data on your persistent volume, commonly `/workspace`.

For a notebook-only first trial, Meta provides an [official Colab notebook](https://github.com/facebookresearch/tribev2/blob/main/tribe_demo.ipynb). Colab sessions are not a persistent app server.

## 2. Get Hugging Face access

Create a Hugging Face account and request access to [`meta-llama/Llama-3.2-3B`](https://huggingface.co/meta-llama/Llama-3.2-3B), the gated language backbone in the published TRIBE config. Create a read token and put it in your GPU provider’s secret environment as `HF_TOKEN`, or authenticate with `hf auth login` in the server terminal. Never commit or paste this token into the browser app.

Review TRIBE’s noncommercial weights license and each backbone’s license. The upstream adapter uses the trusted official checkpoint/config; do not substitute untrusted model repositories.

## 3. Install on the Pod

From the Pod terminal (Ubuntu with Python 3.11 available):

```sh
cd /workspace
git clone https://github.com/aditi1421/Neuro-TRIBE.git
cd Neuro-TRIBE
apt-get update
apt-get install -y ffmpeg git build-essential
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e 'backend[inference,test]'
python -m pytest backend/tests -q
python -c "import torch; print(torch.__version__, torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
```

If the template lacks Python 3.11, create a Python 3.11 environment with the provider’s supported environment manager first. The official TRIBE package is installed from a pinned Git commit. Large PyTorch/backbone downloads can take time. Full dependency installation and inference must be smoke-tested on the host; the local CPU tests do not validate CUDA compatibility.

## 4. Configure the service

```sh
cd backend
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Edit `.env` on the server:

```dotenv
NEURO_API_KEY=<the random key you just generated>
NEURO_ENABLE_INFERENCE=true
NEURO_DEVICE=cuda
NEURO_ALLOWED_ORIGINS=["https://neurosim.ronsys11.chatgpt.site","http://127.0.0.1:5173","http://localhost:5173"]
NEURO_DATA_DIR=/workspace/neurosim-jobs
NEURO_CACHE_DIR=/workspace/neurosim-feature-cache
```

Set `HF_HOME=/workspace/huggingface` in the process environment so weights survive restarts. Set `HF_TOKEN` there as a secret if you are not using `hf auth login`.

Start one worker:

```sh
uvicorn neurosim.app:create_app --factory --host 0.0.0.0 --port 8000 --workers 1
```

One worker is intentional: a single model instance and a bounded queue serialize GPU work. Run in a persistent terminal or process supervisor. Do not use `--reload` for inference.

## 5. Connect the app

Expose HTTP port **8000** using the Pod’s HTTPS proxy. Copy its actual HTTPS service URL from the provider console. Do not guess the URL or use an unsecured public HTTP endpoint.

In NeuroSim, open **Model connection**, enter that URL and `NEURO_API_KEY`, then **Test connection**. The access key stays in browser memory; only the service URL is saved locally. CORS must include the exact origin where the interface is opened. A successful connection means the API and dependencies are available; weights load on the first experiment.

Select **Your stimuli**, upload two short clips with audio tracks, choose a 10-second matched window, and run. The first job downloads the checkpoint and backbones. Verify the resulting JSON has `source: "tribev2"`, the resolved model revision, input SHA-256 hashes, and finite arrays. Record time and peak GPU memory with `nvidia-smi` before choosing a cheaper GPU.

## Input behavior and limitations

- Video: MP4, MOV, AVI, MKV, WEBM. An audio track is required by the official preprocessing pipeline. For silent video, add a silent audio track before upload.
- Audio: WAV, MP3, FLAC, OGG.
- Text: up to 5,000 characters per condition; the upstream pipeline sends text to Google TTS, synthesizes speech, and transcribes it. It is not a pure reading condition. Different passages may yield different generated durations; only shared model timestamps are compared.
- Upload limit: 250 MB per file. Comparison window: 10–60 seconds. Videos are re-encoded with a maximum width of 1280 pixels and CRF 18; audio is preserved in the video pipeline as AAC. Control source quality consistently across conditions.
- Model errors remain errors; there is no synthetic fallback.
- Checkpoints and derived feature caches can consume significant disk. Source uploads and trimmed clips are deleted when a job finishes; result files are retained for 24 hours by default and cleaned on the next submission. Upstream feature/TTS caches can retain derived content and require separate cache management.
- This is a single-owner service. Everyone holding the service key can access its experiment IDs. Do not share it as a multi-user research service without per-user authorization and a durable external job queue.

## Troubleshooting

- **401:** the service access key is wrong; it is not your Hugging Face token.
- **503 disabled:** enable inference in the server environment and restart.
- **CORS/network error:** confirm the exact UI origin, HTTPS proxy, and exposed port.
- **Gated model error:** ensure the token’s account has accepted the Llama access terms.
- **CUDA/OOM:** confirm the CUDA-compatible Torch install, available memory, and one API worker. Test a 10-second input. Hardware recommendations are provisional until measured.
- **Preprocessing failure:** inspect server logs for the specific backbone or transcription dependency and verify the same clip in Meta’s official notebook.
- **Service restart:** in-flight jobs are marked failed; re-submit them.

Raw arrays are available at `GET /experiments/{id}/predictions` with the service Bearer key. Use `np.load(path, allow_pickle=False)`: keys are `a`, `b`, and `times`, aligned exactly as in the JSON result.
