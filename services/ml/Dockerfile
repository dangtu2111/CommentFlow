FROM python:3.12.16-slim-trixie

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/models \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

RUN pip install --no-cache-dir uv==0.13.6

WORKDIR /app
COPY pyproject.toml uv.lock ./
# `--extra embed`: sentence-transformers + torch bản CPU (bge-m3). Model tải ở lần gọi đầu vào /models (volume).
RUN uv sync --frozen --no-dev --no-install-project --extra embed

COPY app ./app

RUN useradd --system --uid 10001 --no-create-home app \
    && mkdir -p /models && chown -R app:app /app /models
USER app

EXPOSE 8000
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
