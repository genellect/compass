#!/usr/bin/env bash
# Linux / Dev Container / Codespaces equivalent of scripts/library-docker-dev.ps1.
# Both wrappers drive the same Compose project, ownership labels, isolated
# network and volume, and owned host ports. Keep the two in sync: an action
# added here must exist there, with the same isolation assertions.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/compose.library-dev.yaml"
project_name='compass-library-registration-dev'
resource_label='future-strategy-library-registration'
network_name='fsl-registration-dev-network'
volume_name='fsl-registration-dev-postgres-data'
terraform_image='hashicorp/terraform:1.9.8'
terraform_directory="$repo_root/infra/library-registration/terraform"
terraform_cache_directory="$repo_root/.terraform-plugin-cache"
owned_ports=(55432 58000)
interactive_ports=(54321 54322 54323 54324 54327)

action="${1:-Validate}"

die() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

compose() {
  docker compose --project-name "$project_name" --file "$compose_file" "$@"
}

# A listening socket on the loopback or wildcard address, without depending on
# ss or lsof being present in the container image.
port_has_listener() {
  local port="$1"
  local hex_port
  hex_port="$(printf '%04X' "$port")"
  local table
  for table in /proc/net/tcp /proc/net/tcp6; do
    [[ -r "$table" ]] || continue
    # Field 2 is local_address as HEX_ADDR:HEX_PORT, field 4 is the state.
    # State 0A is TCP_LISTEN.
    if awk -v p=":$hex_port" 'NR > 1 && $4 == "0A" && index($2, p) > 0 { found = 1 }
      END { exit found ? 0 : 1 }' "$table"; then
      return 0
    fi
  done
  return 1
}

resource_owner_label() {
  local kind="$1" name="$2"
  if ! docker "$kind" ls --format '{{.Name}}' | grep -Fqx "$name"; then
    return 0
  fi
  docker "$kind" inspect "$name" --format '{{index .Labels "com.compass.project"}}' 2>/dev/null || true
}

assert_isolation() {
  [[ -f "$compose_file" ]] || die "Compose file is missing: $compose_file"

  if [[ "$project_name" == *compass-interactive* ]]; then
    die 'The registration Compose project name overlaps COMPASS Interactive.'
  fi

  if grep -Eqi 'compass[[:space:]_-]*interactive' "$compose_file"; then
    die 'The registration Compose file references COMPASS Interactive.'
  fi

  local port
  for port in "${interactive_ports[@]}"; do
    if grep -Eq "^[[:space:]]*-[[:space:]]*['\"]?(127\.0\.0\.1:)?${port}:" "$compose_file"; then
      die "The registration Compose file attempts to bind protected port $port."
    fi
  done

  local container_id label
  while read -r container_id; do
    [[ -n "$container_id" ]] || continue
    label="$(docker inspect "$container_id" \
      --format '{{index .Config.Labels "com.compass.project"}}' 2>/dev/null || true)"
    if [[ "$label" != "$resource_label" ]]; then
      die "Container '$container_id' is not owned by the registration project."
    fi
  done < <(docker ps -a --quiet --filter "label=com.docker.compose.project=$project_name")

  local kind name
  for kind in network volume; do
    if [[ "$kind" == network ]]; then name="$network_name"; else name="$volume_name"; fi
    label="$(resource_owner_label "$kind" "$name")"
    if [[ -n "$label" && "$label" != "$resource_label" ]]; then
      die "$kind '$name' exists without the expected ownership label."
    fi
  done

  compose config --quiet
}

assert_owned_ports_available() {
  local published port
  published="$(docker ps --filter "label=com.docker.compose.project=$project_name" \
    --format '{{.Ports}}' | tr '\n' ' ')"

  for port in "${owned_ports[@]}"; do
    port_has_listener "$port" || continue
    if ! grep -Eq "(127\.0\.0\.1|0\.0\.0\.0|\[::\]):$port->" <<<"$published"; then
      die "Local port $port is already in use outside the registration project."
    fi
  done
}

wait_compose_service_healthy() {
  local service="$1" timeout_seconds="${2:-90}"
  local deadline=$((SECONDS + timeout_seconds))
  local container_id state

  while ((SECONDS < deadline)); do
    container_id="$(compose ps --quiet "$service" | tr -d '[:space:]')"
    if [[ -n "$container_id" ]]; then
      state="$(docker inspect --format \
        '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' \
        "$container_id" | tr -d '[:space:]')"
      if [[ "$state" == 'running|healthy' ]]; then
        return 0
      fi
      if [[ "$state" == dead\|* || "$state" == exited\|* ]]; then
        die "The isolated $service container stopped before becoming healthy."
      fi
    fi
    sleep 2
  done

  die "The isolated $service container did not become healthy."
}

terraform_run() {
  docker run --rm \
    --volume "$repo_root:/workspace" \
    --workdir /workspace/infra/library-registration/terraform \
    --env TF_PLUGIN_CACHE_DIR=/workspace/.terraform-plugin-cache \
    "$terraform_image" "$@"
}

command -v docker >/dev/null 2>&1 || die 'Docker CLI was not found. Start the Docker daemon and retry.'
docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 \
  || die 'The Docker engine is unavailable. In a Dev Container, confirm the docker-in-docker feature started.'

assert_isolation

case "$action" in
  Validate)
    echo 'PASS: registration Docker configuration is isolated.'
    ;;
  Build)
    compose build
    ;;
  BuildProductionImages)
    for target in public admin worker migration; do
      docker build \
        --file "$repo_root/services/library-api/Dockerfile" \
        --target "$target" \
        --label "com.compass.project=$resource_label" \
        --label 'com.compass.environment=local-synthetic-only' \
        --tag "compass-library-registration-${target}:local-gate" \
        "$repo_root"
    done
    echo 'PASS: isolated public, admin, worker, and migration images built locally.'
    ;;
  TerraformValidate)
    [[ -d "$terraform_directory" ]] || die "Terraform directory is missing: $terraform_directory"
    mkdir -p "$terraform_cache_directory"
    terraform_run fmt -check -recursive
    terraform_run init -backend=false -input=false
    terraform_run validate -no-color
    terraform_run test -no-color
    echo 'PASS: Terraform format, offline-backend init, validation, and activation-contract tests completed.'
    ;;
  Up)
    assert_owned_ports_available
    compose up --build --detach
    compose ps
    ;;
  Test)
    assert_owned_ports_available
    compose up --build --detach
    # An internal Docker network intentionally has no host-published route.
    # Poll the container health state rather than weakening that isolation.
    wait_compose_service_healthy api
    compose run --rm --no-deps --env 'PHASE5_LOCAL_API_ENABLED=false' api python -m pytest
    echo 'PASS: Docker health and Python regression tests completed.'
    ;;
  Phase9Phase10Test)
    assert_owned_ports_available
    compose up --build --detach
    compose run --rm --no-deps \
      --env 'FSL_DATA_CLASSIFICATION=synthetic-only' \
      --env 'FSL_PHASE9_10A_LOCAL_EVIDENCE=confirmed' \
      --env 'FSL_PHASE9_10A_CLEANUP_ONLY=confirmed' \
      api python -m scripts.verify_phase9_phase10a_postgres
    compose run --rm --no-deps migrate python -m alembic downgrade f8b0a1c2d3e4
    compose run --rm --no-deps migrate python -m alembic upgrade head
    compose run --rm --no-deps migrate python -m alembic check
    compose run --rm --no-deps roles-finalize
    compose run --rm --no-deps \
      --env 'FSL_DATA_CLASSIFICATION=synthetic-only' \
      --env 'FSL_PHASE9_10A_LOCAL_EVIDENCE=confirmed' \
      api python -m scripts.verify_phase9_phase10a_postgres
    compose run --rm --no-deps \
      --env 'FSL_DATA_CLASSIFICATION=synthetic-only' \
      --env 'FSL_PHASE9_10A_LOCAL_EVIDENCE=confirmed' \
      api python -m scripts.verify_phase10a_api_races_postgres
    echo 'PASS: Phase 9/10A PostgreSQL migration and integration evidence completed.'
    ;;
  Ps)
    compose ps
    ;;
  Logs)
    compose logs --tail 200
    ;;
  Down)
    compose down
    echo 'Registration containers stopped. The registration data volume was preserved.'
    ;;
  *)
    echo "Usage: $0 {Validate|Build|BuildProductionImages|TerraformValidate|Up|Test|Phase9Phase10Test|Ps|Logs|Down}" >&2
    exit 2
    ;;
esac
