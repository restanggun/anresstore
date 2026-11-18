#!/usr/bin/env bash
set -euo pipefail

# Serialize GitHub Actions and manual deploys on this VPS.
exec 9>/run/lock/anresstore-deploy.lock
flock -w 600 9

release=
if [[ -n "${SSH_ORIGINAL_COMMAND:-}" ]]; then
  if [[ "$SSH_ORIGINAL_COMMAND" =~ ^deploy[[:space:]]([a-f0-9]{40})$ ]]; then
    release=${BASH_REMATCH[1]}
  else
    echo "Perintah deploy tidak valid." >&2
    exit 2
  fi
fi

cd /opt/anresstore
if [[ "$(git branch --show-current)" != main || -n "$(git status --porcelain)" ]]; then
  echo "Deploy memerlukan branch main dengan checkout bersih." >&2
  exit 1
fi
git fetch --no-tags origin main
latest=$(git rev-parse FETCH_HEAD)
if [[ -n "$release" && "$release" != "$latest" ]]; then
  echo "Commit dari workflow bukan lagi tip main. Jalankan workflow untuk commit terbaru." >&2
  exit 1
fi
git merge --ff-only "$latest"
if [[ "$(git rev-parse HEAD)" != "$latest" ]]; then
  echo "Checkout VPS tidak cocok dengan commit GitHub." >&2
  exit 1
fi
echo "Men-deploy $latest"

compose=(docker compose
  --env-file /opt/anresstore-deploy/.env
  -f infra/compose.production.yaml
  -f /opt/anresstore-deploy/compose.cloudflare.yaml)

"${compose[@]}" build web admin api
"${compose[@]}" up -d --no-deps web admin api

for container in anres-production-web-1 anres-production-admin-1 anres-production-api-1; do
  ready=false
  for _ in $(seq 1 180); do
    state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)
    if [[ "$state" == healthy ]]; then
      ready=true
      break
    fi
    if [[ "$state" == unhealthy || "$state" == exited || "$state" == dead ]]; then
      echo "Container $container gagal health check ($state)." >&2
      exit 1
    fi
    sleep 1
  done
  if [[ "$ready" != true ]]; then
    echo "Timeout menunggu health check $container (status: ${state:-tidak tersedia})." >&2
    exit 1
  fi
done

"${compose[@]}" ps
