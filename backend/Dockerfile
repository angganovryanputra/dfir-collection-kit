FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TZ=UTC

WORKDIR /app

# ---------------------------------------------------------------------------
# System dependencies + .NET 8 runtime
# .NET is required to execute EZTools DLLs when manually installed.
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    wget \
    unzip \
    libicu-dev \
    libyara-dev \
    && rm -rf /var/lib/apt/lists/*

# Install .NET 8 runtime for EZTools
RUN wget -q https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel 8.0 --runtime dotnet --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
    && rm /tmp/dotnet-install.sh

ENV DOTNET_ROOT=/usr/share/dotnet
# Allow .NET 8 runtime to execute net6.0 DLLs (EZTools target net6)
ENV DOTNET_ROLL_FORWARD=Major

# ---------------------------------------------------------------------------
# Forensics tools (EZTools, Hayabusa, Chainsaw, Sigma/YARA rules) are NOT
# bundled in this image. Install them on the host and mount via Docker volumes,
# then configure their paths in Settings → Forensics Pipeline.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Python dependencies
# ---------------------------------------------------------------------------
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
COPY app ./app
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic

ENV PYTHONPATH=/app

# Run as non-root user for reduced attack surface
RUN useradd --system --uid 1000 --gid 1000 --no-create-home --shell /usr/sbin/nologin dfir \
    && mkdir -p /vault/evidence \
    && chown -R dfir:dfir /app /vault/evidence

USER dfir

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/status/health || exit 1

CMD ["/bin/sh", "-c", "alembic upgrade head && python app/seed_run.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
