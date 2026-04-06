# syntax=docker/dockerfile:1.7
FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    TZ=UTC \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    OPENUI_NODE_VERSION=22.22.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    python3 \
    python3-pip \
    python3-venv \
    ripgrep \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

COPY services/gemini-sidecar/requirements.txt /tmp/python-requirements.txt
COPY services/gemini-sidecar/constraints.txt /tmp/constraints.txt
COPY package-lock.json /tmp/package-lock.json

RUN python3 -m pip install --no-cache-dir --break-system-packages -r /tmp/python-requirements.txt \
  && rm -f /tmp/python-requirements.txt /tmp/constraints.txt

RUN PLAYWRIGHT_VERSION="$(node -e "const fs=require('node:fs'); const lock=JSON.parse(fs.readFileSync('/tmp/package-lock.json','utf8')); const version=lock?.packages?.['node_modules/playwright-core']?.version || lock?.packages?.['node_modules/playwright']?.version || lock?.dependencies?.['playwright-core']?.version || lock?.dependencies?.playwright?.version; if(!version){throw new Error('playwright version not found in package-lock.json');} process.stdout.write(version);")" \
  && echo "[ci-image] installing Playwright browsers for version ${PLAYWRIGHT_VERSION}" \
  && npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium firefox webkit \
  && mkdir -p /ms-playwright \
  && printf '%s\n' "${PLAYWRIGHT_VERSION}" > /ms-playwright/.openui-playwright-version \
  && rm -f /tmp/package-lock.json

RUN test "$(node --version)" = "v22.22.0"

WORKDIR /workspace
