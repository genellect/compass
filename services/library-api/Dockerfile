# syntax=docker/dockerfile:1.7

FROM python:3.14-slim-bookworm@sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30 AS dependency-base

ARG UV_VERSION=0.11.28

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /workspace/services/library-api

RUN python -m pip install --no-cache-dir "uv==${UV_VERSION}"

COPY services/library-api/pyproject.toml services/library-api/uv.lock ./

FROM dependency-base AS development

RUN apt-get update && \
    apt-get install --yes --no-install-recommends postgresql-client && \
    rm -rf /var/lib/apt/lists/*

RUN uv sync --frozen

COPY services/library-api/alembic.ini ./
COPY services/library-api/Dockerfile ./Dockerfile
COPY services/library-api/app ./app
COPY services/library-api/migrations ./migrations
COPY services/library-api/scripts ./scripts
COPY services/library-api/tests ./tests
COPY contracts /workspace/contracts
COPY infra /workspace/infra
COPY scripts /workspace/scripts
COPY compose.library-dev.yaml /workspace/compose.library-dev.yaml

RUN groupadd --system app && \
    useradd --system --gid app --home-dir /workspace app && \
    chown -R app:app /workspace

ENV PATH="/workspace/services/library-api/.venv/bin:${PATH}"

USER app

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM dependency-base AS production

RUN uv sync --frozen --no-dev

COPY services/library-api/app ./app

RUN groupadd --system app && \
    useradd --system --gid app --home-dir /workspace app && \
    chown -R app:app /workspace

ENV PATH="/workspace/services/library-api/.venv/bin:${PATH}"

USER app

# The production image is intentionally not a runnable composite service.
# Cloud Run must select one of the explicit least-capability targets below.
CMD ["python", "-c", "raise SystemExit('select public, admin, worker, or migration image target')"]

FROM production AS public

ENV SERVICE_SURFACE=public

CMD ["python", "-m", "uvicorn", "app.public_main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--no-server-header"]

FROM production AS admin

ENV SERVICE_SURFACE=admin

CMD ["python", "-m", "uvicorn", "app.admin_main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--no-server-header"]

FROM production AS worker

ENV SERVICE_SURFACE=worker

CMD ["python", "-m", "uvicorn", "app.worker_main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--no-server-header"]

FROM production AS migration

COPY --chown=app:app services/library-api/alembic.ini ./
COPY --chown=app:app services/library-api/migrations ./migrations
COPY --chown=app:app services/library-api/scripts/run_migrations.py ./scripts/run_migrations.py
COPY --chown=app:app services/library-api/scripts/provision_public_rpc_key.py ./scripts/provision_public_rpc_key.py

ENV SERVICE_SURFACE=migration

CMD ["python", "-m", "scripts.run_migrations"]
