FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/data/huggingface
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend /app/backend
COPY public/brain /app/public/brain
RUN pip install --upgrade pip && pip install -e '/app/backend[inference]'
WORKDIR /app/backend
ENV NEURO_DATA_DIR=/data/jobs NEURO_CACHE_DIR=/data/features
EXPOSE 8000
CMD ["uvicorn", "neurosim.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
