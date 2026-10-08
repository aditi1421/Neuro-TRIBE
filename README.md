# NeuroSim — Stimulus Lab

An exploratory neuroscience workspace for comparing how two sensory stimuli change **TRIBE v2 model predictions**. Built with React/Vinext, Three.js, and a separate FastAPI inference service.

## What works

- Interactive, rotatable **fsaverage5** cortical mesh with 20,484 vertices, contrast/A/B views, signed color scale, and region highlighting.
- Two video, audio, or text inputs; equal-duration windows and independent clip start times.
- Hypothesis notes, 12 bilateral anatomical ROI comparisons, time courses, and descriptive correlations.
- Clearly labeled synthetic example, available without a GPU. **Uploaded stimuli never use synthetic fallback predictions.**
- Authenticated GPU job queue; JSON/CSV exports and raw aligned prediction arrays (`.npz`).
- Input hashes, immutable resolved model revision, source-code revision, atlas, timing, and units in exports.

**Status:** interface, API lifecycle, and analysis tests are verified locally. Full TRIBE inference has **not yet been run on a GPU**. Model availability, backbone access, transitive dependency compatibility, runtime, and peak GPU memory must be checked on the chosen host. This is a single-researcher prototype, not a validated scientific instrument or multi-tenant service.

## Run the interface

Node.js 22.13+ (Node 22 LTS recommended):

```sh
npm ci
npm run dev
```

Open the local URL printed by the server. The illustrative experiment works immediately. `npm run build` creates the Sites/Cloudflare web build; the Python GPU service is deployed separately. No paid GPU is provisioned automatically.

## Run the API without downloading models

Python 3.11, from this repository:

```sh
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e 'backend[test]'
cd backend
cp .env.example .env
# Set NEURO_API_KEY in .env to your own random value.
uvicorn neurosim.app:create_app --factory --host 127.0.0.1 --port 8000
```

Inference is disabled by default and returns an explicit error. To enable real predictions, follow **[GPU setup](docs/GPU_SETUP.md)**. The UI’s “Model connection” expects this API, not a Hugging Face model-page URL.

## Test

```sh
npx tsc --noEmit
npm test
python -m pytest backend/tests -q
```

Backend tests use a deliberate test double and do not claim to exercise pretrained weights. They cover timestamp alignment, bilateral region masks, invalid/constant output handling, auth, upload validation, disabled inference, job failure, exports, and upload cleanup. See [methodology](docs/METHODOLOGY.md) for scientific assumptions.

## Layout

- `app/` — experiment workspace and methodology interface
- `components/brain-viewer.tsx` — anatomically grounded Three.js viewer
- `lib/neurosim.ts` — validated data contracts, illustrative fixture, and exports
- `public/brain/fsaverage5.json` — cortical geometry, sulcal shading, and Destrieux labels
- `backend/neurosim/` — media preparation, official TRIBE adapter, jobs, and descriptive analysis
- `scripts/prepare-brain.py` — regenerate the cortical asset from Nilearn

## Model and data attribution

NeuroSim calls [`facebookresearch/tribev2`](https://github.com/facebookresearch/tribev2), pinned to commit `af58661791a351a448a489042a28f6c37e1c14b7`. [Model weights](https://huggingface.co/facebook/tribev2) are licensed **CC BY-NC 4.0**. Backbone licenses and gated access apply separately. Text preprocessing uses upstream Google text-to-speech and sends text to that service.

The cortical asset comes from Nilearn’s packaged fsaverage5 mesh and its Destrieux surface atlas fetcher. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for provenance. Do not infer that model predictions measure an individual’s cognition, emotions, health, or assistive-technology needs.
