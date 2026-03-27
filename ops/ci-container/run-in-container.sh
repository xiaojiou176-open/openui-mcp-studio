#!/usr/bin/env bash
set -euo pipefail

CI_IMAGE_LOCK_PATH="${OPENUI_CI_IMAGE_LOCK_PATH:-.github/ci-image.lock.json}"

print_help() {
  cat <<'EOF'
Run a command inside the repository CI container image.

Usage:
  run-in-container.sh --command "<command>" [options]

Options:
  --image <ref>                  Container image reference (default: immutable digest from lock file)
  --command <cmd>                Command to execute inside container (required)
  --workspace <path>             Workspace path to mount (default: current directory)
  --container-workdir <path>     Workdir inside container (default: /workspace)
  --env-allowlist <csv>          Extra env var names to pass through
  --registry <host>              Registry hostname for docker login (default: ghcr.io)
  --registry-username <value>    Registry username (default: \$GITHUB_ACTOR)
  --registry-password <value>    Registry password/token (default: \$GITHUB_TOKEN)
  --help                         Print help
EOF
}

IMAGE="${OPENUI_CI_IMAGE:-}"
COMMAND=""
WORKSPACE="${OPENUI_CI_WORKSPACE:-$PWD}"
CONTAINER_WORKDIR="/workspace"
EXTRA_ALLOWLIST=""
REGISTRY="ghcr.io"
REGISTRY_USERNAME="${GITHUB_ACTOR:-}"
REGISTRY_PASSWORD="${GITHUB_TOKEN:-}"
AUTO_BOOTSTRAP_NPM_CI="${OPENUI_CI_AUTO_NPM_CI:-1}"
ALLOW_LOCAL_BOOTSTRAP="${OPENUI_CI_ALLOW_LOCAL_BOOTSTRAP:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      IMAGE="${2:-}"
      shift 2
      ;;
    --command)
      COMMAND="${2:-}"
      shift 2
      ;;
    --workspace)
      WORKSPACE="${2:-}"
      shift 2
      ;;
    --container-workdir)
      CONTAINER_WORKDIR="${2:-}"
      shift 2
      ;;
    --env-allowlist)
      EXTRA_ALLOWLIST="${2:-}"
      shift 2
      ;;
    --registry)
      REGISTRY="${2:-}"
      shift 2
      ;;
    --registry-username)
      REGISTRY_USERNAME="${2:-}"
      shift 2
      ;;
    --registry-password)
      REGISTRY_PASSWORD="${2:-}"
      shift 2
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "[ci-container] unknown option: $1" >&2
      print_help >&2
      exit 2
      ;;
  esac
done

if [[ -z "${COMMAND}" ]]; then
  echo "[ci-container] --command is required." >&2
  print_help >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[ci-container] docker is required but not found in PATH." >&2
  exit 1
fi

WORKSPACE="$(cd "${WORKSPACE}" && pwd)"

resolve_image_configuration() {
  local workspace="$1"
  local explicit_image="$2"

  node --input-type=module - "$workspace" "$explicit_image" "$CI_IMAGE_LOCK_PATH" "$ALLOW_LOCAL_BOOTSTRAP" <<'EOF'
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const workspace = process.argv[2];
const explicitImage = process.argv[3];
const lockPathInput = process.argv[4];
const allowLocalBootstrap = /^(1|true|yes|on)$/i.test(process.argv[5] ?? "");

if (explicitImage) {
  process.stdout.write(
    JSON.stringify({ mode: "explicit", imageRef: explicitImage }),
  );
  process.exit(0);
}

const lockPath = path.resolve(workspace, lockPathInput);
if (!fs.existsSync(lockPath)) {
  throw new Error(`missing required CI image lock file: ${lockPath}`);
}

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const imageRepo = String(lock.imageRepo ?? "").trim();
const digest = String(lock.digest ?? "").trim();
const dockerfile = String(lock.bootstrap?.dockerfile ?? ".devcontainer/Dockerfile").trim();
const buildContext = String(lock.bootstrap?.context ?? ".").trim();

if (imageRepo && digest) {
  process.stdout.write(
    JSON.stringify({
      mode: "digest-lock",
      lockPath,
      imageRef: `${imageRepo}@${digest}`,
      imageRepo,
      digest,
      dockerfile,
      buildContext,
      localBootstrapImage: `openui-local-ci:${crypto
        .createHash("sha256")
        .update(fs.readFileSync(lockPath, "utf8"))
        .update(fs.readFileSync(path.resolve(workspace, dockerfile), "utf8"))
        .digest("hex")
        .slice(0, 16)}`,
    }),
  );
  process.exit(0);
}

if (allowLocalBootstrap) {
  const dockerfilePath = path.resolve(workspace, dockerfile);
  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`missing dockerfile for local bootstrap: ${dockerfilePath}`);
  }
  const lockHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(lockPath, "utf8"))
    .update(fs.readFileSync(dockerfilePath, "utf8"))
    .digest("hex")
    .slice(0, 16);
  process.stdout.write(
    JSON.stringify({
      mode: "local-bootstrap",
      lockPath,
      imageRef: `openui-local-ci:${lockHash}`,
      dockerfile,
      buildContext,
    }),
  );
  process.exit(0);
}

throw new Error(`CI image lock must declare immutable digest: ${lockPath}`);
EOF
}

image_config_json="$(resolve_image_configuration "${WORKSPACE}" "${IMAGE}")"
image_mode="$(printf '%s' "${image_config_json}" | node --input-type=module -e 'let raw=""; process.stdin.on("data",(chunk)=>{raw+=chunk;}); process.stdin.on("end",()=>{const parsed=JSON.parse(raw); process.stdout.write(parsed.mode);});')"

IMAGE="$(printf '%s' "${image_config_json}" | node --input-type=module -e 'let raw=""; process.stdin.on("data",(chunk)=>{raw+=chunk;}); process.stdin.on("end",()=>{const parsed=JSON.parse(raw); process.stdout.write(parsed.imageRef);});')"

if [[ "${image_mode}" == "local-bootstrap" ]]; then
  bootstrap_dockerfile="$(printf '%s' "${image_config_json}" | node --input-type=module -e 'let raw=""; process.stdin.on("data",(chunk)=>{raw+=chunk;}); process.stdin.on("end",()=>{const parsed=JSON.parse(raw); process.stdout.write(parsed.dockerfile);});')"
  bootstrap_context="$(printf '%s' "${image_config_json}" | node --input-type=module -e 'let raw=""; process.stdin.on("data",(chunk)=>{raw+=chunk;}); process.stdin.on("end",()=>{const parsed=JSON.parse(raw); process.stdout.write(parsed.buildContext);});')"
  if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
    echo "[ci-container] immutable digest missing; building local bootstrap image ${IMAGE} from ${bootstrap_dockerfile}" >&2
    docker build \
      --file "${WORKSPACE}/${bootstrap_dockerfile}" \
      --tag "${IMAGE}" \
      "${WORKSPACE}/${bootstrap_context}"
  fi
fi

maybe_fallback_to_local_bootstrap() {
  if [[ "${ALLOW_LOCAL_BOOTSTRAP}" != "1" && "${ALLOW_LOCAL_BOOTSTRAP}" != "true" && "${ALLOW_LOCAL_BOOTSTRAP}" != "yes" && "${ALLOW_LOCAL_BOOTSTRAP}" != "on" ]]; then
    return 1
  fi

  local fallback_image
  local fallback_dockerfile
  local fallback_context
  fallback_image="$(printf '%s' "${image_config_json}" | node --input-type=module -e 'let raw=""; process.stdin.on("data",(chunk)=>{raw+=chunk;}); process.stdin.on("end",()=>{const parsed=JSON.parse(raw); process.stdout.write(String(parsed.localBootstrapImage ?? ""));});')"
  fallback_dockerfile="$(printf '%s' "${image_config_json}" | node --input-type=module -e 'let raw=""; process.stdin.on("data",(chunk)=>{raw+=chunk;}); process.stdin.on("end",()=>{const parsed=JSON.parse(raw); process.stdout.write(String(parsed.dockerfile ?? ""));});')"
  fallback_context="$(printf '%s' "${image_config_json}" | node --input-type=module -e 'let raw=""; process.stdin.on("data",(chunk)=>{raw+=chunk;}); process.stdin.on("end",()=>{const parsed=JSON.parse(raw); process.stdout.write(String(parsed.buildContext ?? ""));});')"

  if [[ -z "${fallback_image}" || -z "${fallback_dockerfile}" || -z "${fallback_context}" ]]; then
    return 1
  fi

  echo "[ci-container] immutable digest pull failed; falling back to local bootstrap image ${fallback_image} from ${fallback_dockerfile}" >&2
  if ! docker image inspect "${fallback_image}" >/dev/null 2>&1; then
    docker build \
      --file "${WORKSPACE}/${fallback_dockerfile}" \
      --tag "${fallback_image}" \
      "${WORKSPACE}/${fallback_context}"
  fi
  IMAGE="${fallback_image}"
  image_mode="local-bootstrap"
  return 0
}

mkdir -p "${WORKSPACE}/.runtime-cache"
HOST_RUNTIME_ROOT="${OPENUI_HOST_RUNTIME_ROOT:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/openui-ci-runtime}"
PLAYWRIGHT_CACHE_HOST_PATH="${HOST_RUNTIME_ROOT}/ms-playwright"
HOST_OPENUI_HOME="${HOST_RUNTIME_ROOT}/openui-home"
HOST_TMPDIR="${HOST_RUNTIME_ROOT}/tmp"
HOST_NODE_MODULES="${HOST_RUNTIME_ROOT}/node_modules"
mkdir -p "${PLAYWRIGHT_CACHE_HOST_PATH}"
mkdir -p "${HOST_OPENUI_HOME}"
mkdir -p "${HOST_TMPDIR}"
mkdir -p "${HOST_NODE_MODULES}"

cleanup_workspace_mount_residue() {
  local workspace_node_modules="${WORKSPACE}/node_modules"
  if [[ -d "${workspace_node_modules}" ]]; then
    for _ in 1 2 3 4 5; do
      if rmdir "${workspace_node_modules}" 2>/dev/null; then
        break
      fi
      sleep 1
    done
  fi
}

PLAYWRIGHT_BROWSERS_PATH="${OPENUI_CONTAINER_PLAYWRIGHT_BROWSERS_PATH:-/tmp/openui-ms-playwright}"
export PLAYWRIGHT_BROWSERS_PATH
CONTAINER_HOME="${OPENUI_CONTAINER_HOME:-/tmp/openui-home}"
CONTAINER_TMPDIR="${OPENUI_CONTAINER_TMPDIR:-/tmp/openui-tmp}"

if [[ -n "${REGISTRY_PASSWORD}" && -n "${REGISTRY_USERNAME}" && "${IMAGE}" == ghcr.io/* ]]; then
  printf '%s' "${REGISTRY_PASSWORD}" | docker login "${REGISTRY}" --username "${REGISTRY_USERNAME}" --password-stdin >/dev/null
fi

if [[ "${image_mode}" != "local-bootstrap" ]] && ! docker pull "${IMAGE}" >/dev/null 2>&1; then
  if ! maybe_fallback_to_local_bootstrap; then
    echo "[ci-container] docker pull failed for immutable image ref: ${IMAGE}" >&2
    exit 1
  fi
fi

declare -A ALLOW_MAP=()
BASE_ALLOWLIST=(
  GEMINI_API_KEY
  PLAYWRIGHT_BROWSERS_PATH
  CI
  GITHUB_ACTIONS
  GITHUB_ACTOR
  GITHUB_REPOSITORY
  GITHUB_REPOSITORY_OWNER
  GITHUB_REF
  GITHUB_REF_NAME
  GITHUB_SHA
  GITHUB_RUN_ID
  GITHUB_RUN_ATTEMPT
  GITHUB_WORKFLOW
  GITHUB_EVENT_NAME
  GITHUB_SERVER_URL
  GITHUB_API_URL
  GITHUB_GRAPHQL_URL
  RUNNER_OS
  RUNNER_ARCH
  HTTP_PROXY
  HTTPS_PROXY
  ALL_PROXY
  NO_PROXY
  http_proxy
  https_proxy
  all_proxy
  no_proxy
)

for name in "${BASE_ALLOWLIST[@]}"; do
  ALLOW_MAP["${name}"]=1
done

if [[ -n "${EXTRA_ALLOWLIST}" ]]; then
  IFS=',' read -r -a EXTRA_NAMES <<< "${EXTRA_ALLOWLIST}"
  for name in "${EXTRA_NAMES[@]}"; do
    trimmed="${name//[[:space:]]/}"
    if [[ -n "${trimmed}" ]]; then
      ALLOW_MAP["${trimmed}"]=1
    fi
  done
fi

while IFS='=' read -r env_name _; do
  case "${env_name}" in
    OPENUI_*|CI_GATE_*|LIVE_TEST_*)
      ALLOW_MAP["${env_name}"]=1
      ;;
    RUN_EXTERNAL_E2E)
      ALLOW_MAP["${env_name}"]=1
      ;;
  esac
done < <(env)

docker_env_args=()
while IFS= read -r key; do
  if [[ -n "${!key+x}" ]]; then
    docker_env_args+=(-e "${key}")
  fi
done < <(printf '%s\n' "${!ALLOW_MAP[@]}" | sort)

uid_gid="$(id -u):$(id -g)"

if [[ "${AUTO_BOOTSTRAP_NPM_CI}" == "1" ]]; then
  bootstrap_script="$(mktemp)"
  cat > "${bootstrap_script}" <<'EOF'
set -euo pipefail
if [[ ! -f package.json || ! -f package-lock.json ]]; then
  echo "[ci-container] package.json or package-lock.json missing; skip dependency bootstrap"
  exit 0
fi

os_name="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch_name="$(uname -m)"
node_version="$(node --version)"
lock_hash="$(sha256sum package-lock.json | awk '{print $1}')"
desired_marker="${os_name}-${arch_name}-${node_version}-${lock_hash}"
marker_path="node_modules/.openui-platform"
current_marker=""
if [[ -f "${marker_path}" ]]; then
  current_marker="$(cat "${marker_path}" 2>/dev/null || true)"
fi

if [[ ! -d node_modules || "${current_marker}" != "${desired_marker}" ]]; then
  echo "[ci-container] preparing Linux-native dependencies in external runtime volume (npm ci)"
  mkdir -p node_modules
  find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  npm ci --no-audit --no-fund
  mkdir -p node_modules
  printf '%s\n' "${desired_marker}" > "${marker_path}"
  echo "[ci-container] dependency marker updated: ${desired_marker}"
else
  echo "[ci-container] reusing external runtime node_modules for marker: ${desired_marker}"
fi

playwright_version="$(node -p "require('playwright/package.json').version" 2>/dev/null || true)"
if [[ -z "${playwright_version}" ]]; then
  echo "[ci-container] unable to resolve playwright package version after npm ci" >&2
  exit 1
fi

asset_marker_path="${PLAYWRIGHT_BROWSERS_PATH}/.openui-playwright-version"
asset_marker_value=""
if [[ -f "${asset_marker_path}" ]]; then
  asset_marker_value="$(cat "${asset_marker_path}" 2>/dev/null || true)"
fi

required_browser_path="$(node -e "const { chromium } = require('playwright'); process.stdout.write(chromium.executablePath());" 2>/dev/null || true)"
if [[ -z "${required_browser_path}" || ! -x "${required_browser_path}" || "${asset_marker_value}" != "${playwright_version}" ]]; then
  echo "[ci-container] playwright browser asset drift detected (pkg=${playwright_version}, asset=${asset_marker_value:-none}); installing chromium/firefox/webkit"
  npx --yes "playwright@${playwright_version}" install chromium firefox webkit
  mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}"
  printf '%s\n' "${playwright_version}" > "${asset_marker_path}"
fi

default_cache_path="${HOME}/.cache/ms-playwright"
if [[ "${default_cache_path}" != "${PLAYWRIGHT_BROWSERS_PATH}" ]]; then
  mkdir -p "${HOME}/.cache"
  if [[ -L "${default_cache_path}" ]]; then
    current_target="$(readlink "${default_cache_path}" 2>/dev/null || true)"
    if [[ "${current_target}" != "${PLAYWRIGHT_BROWSERS_PATH}" ]]; then
      rm -f "${default_cache_path}"
      ln -s "${PLAYWRIGHT_BROWSERS_PATH}" "${default_cache_path}"
    fi
  else
    rm -rf "${default_cache_path}"
    ln -s "${PLAYWRIGHT_BROWSERS_PATH}" "${default_cache_path}"
  fi
fi
EOF

  bootstrap_status=0
  if docker run --rm \
    --user "${uid_gid}" \
    --workdir "${CONTAINER_WORKDIR}" \
    -e HOME="${CONTAINER_HOME}" \
    -e TMPDIR="${CONTAINER_TMPDIR}" \
    -e TMP="${CONTAINER_TMPDIR}" \
    -e TEMP="${CONTAINER_TMPDIR}" \
    -e XDG_CACHE_HOME="${CONTAINER_HOME}/.cache" \
    -e NPM_CONFIG_CACHE="${CONTAINER_HOME}/.npm" \
    -v "${WORKSPACE}:${CONTAINER_WORKDIR}" \
    -v "${HOST_NODE_MODULES}:${CONTAINER_WORKDIR}/node_modules" \
    -v "${PLAYWRIGHT_CACHE_HOST_PATH}:${PLAYWRIGHT_BROWSERS_PATH}" \
    -v "${HOST_OPENUI_HOME}:${CONTAINER_HOME}" \
    -v "${HOST_TMPDIR}:${CONTAINER_TMPDIR}" \
    "${docker_env_args[@]}" \
    "${IMAGE}" \
    bash -lc "$(cat "${bootstrap_script}")"; then
    bootstrap_status=0
  else
    bootstrap_status=$?
  fi
  rm -f "${bootstrap_script}"
  cleanup_workspace_mount_residue
  if [[ "${bootstrap_status}" -ne 0 ]]; then
    exit "${bootstrap_status}"
  fi
fi

final_status=0
if docker run --rm \
  --user "${uid_gid}" \
  --workdir "${CONTAINER_WORKDIR}" \
  -e HOME="${CONTAINER_HOME}" \
  -e TMPDIR="${CONTAINER_TMPDIR}" \
  -e TMP="${CONTAINER_TMPDIR}" \
  -e TEMP="${CONTAINER_TMPDIR}" \
  -e XDG_CACHE_HOME="${CONTAINER_HOME}/.cache" \
  -e NPM_CONFIG_CACHE="${CONTAINER_HOME}/.npm" \
  -v "${WORKSPACE}:${CONTAINER_WORKDIR}" \
  -v "${HOST_NODE_MODULES}:${CONTAINER_WORKDIR}/node_modules" \
  -v "${PLAYWRIGHT_CACHE_HOST_PATH}:${PLAYWRIGHT_BROWSERS_PATH}" \
  -v "${HOST_OPENUI_HOME}:${CONTAINER_HOME}" \
  -v "${HOST_TMPDIR}:${CONTAINER_TMPDIR}" \
  "${docker_env_args[@]}" \
  "${IMAGE}" \
  bash -lc "${COMMAND}"; then
  final_status=0
else
  final_status=$?
fi
cleanup_workspace_mount_residue
exit "${final_status}"
