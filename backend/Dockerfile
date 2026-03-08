FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TZ=UTC

WORKDIR /app

# ---------------------------------------------------------------------------
# System dependencies + .NET 8 runtime (for EZTools)
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    wget \
    unzip \
    libicu-dev \
    && rm -rf /var/lib/apt/lists/*

# Install .NET 8 runtime for EZTools
RUN wget -q https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel 8.0 --runtime dotnet --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
    && rm /tmp/dotnet-install.sh

ENV DOTNET_ROOT=/usr/share/dotnet

# ---------------------------------------------------------------------------
# Eric Zimmerman Tools (EZTools)
# ---------------------------------------------------------------------------
ENV EZTOOLS_DIR=/opt/eztools

RUN mkdir -p ${EZTOOLS_DIR} \
    && wget -q https://f001.backblazeb2.com/file/EricZimmermanTools/net6/All_6.zip -O /tmp/eztools.zip \
    && unzip -q /tmp/eztools.zip -d ${EZTOOLS_DIR} \
    && rm /tmp/eztools.zip \
    && chmod -R +x ${EZTOOLS_DIR}

# ---------------------------------------------------------------------------
# Hayabusa — Windows Event Log Fast Forensics Analyzer
# ---------------------------------------------------------------------------
ENV HAYABUSA_PATH=/opt/hayabusa/hayabusa

RUN mkdir -p /opt/hayabusa \
    && HAYABUSA_VERSION=$(curl -s https://api.github.com/repos/Yamato-Security/hayabusa/releases/latest | grep -oP '"tag_name":\s*"\K[^"]+') \
    && wget -q "https://github.com/Yamato-Security/hayabusa/releases/download/${HAYABUSA_VERSION}/hayabusa-${HAYABUSA_VERSION#v}-linux-x64.zip" -O /tmp/hayabusa.zip \
    && unzip -q /tmp/hayabusa.zip -d /opt/hayabusa \
    && chmod +x /opt/hayabusa/hayabusa* \
    && rm /tmp/hayabusa.zip

# ---------------------------------------------------------------------------
# Chainsaw — Rapid Windows Forensic Triage Tool
# ---------------------------------------------------------------------------
ENV CHAINSAW_PATH=/opt/chainsaw/chainsaw

RUN mkdir -p /opt/chainsaw \
    && CHAINSAW_VERSION=$(curl -s https://api.github.com/repos/WithSecureLabs/chainsaw/releases/latest | grep -oP '"tag_name":\s*"\K[^"]+') \
    && wget -q "https://github.com/WithSecureLabs/chainsaw/releases/download/${CHAINSAW_VERSION}/chainsaw_x86_64-unknown-linux-gnu.tar.gz" -O /tmp/chainsaw.tar.gz \
    && tar -xzf /tmp/chainsaw.tar.gz -C /opt/chainsaw --strip-components=1 \
    && chmod +x /opt/chainsaw/chainsaw \
    && rm /tmp/chainsaw.tar.gz

ENV SIGMA_RULES_DIR=/opt/chainsaw/rules/

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

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/status/diagnostics || exit 1

CMD ["/bin/sh", "-c", "alembic upgrade head && python app/seed_run.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
