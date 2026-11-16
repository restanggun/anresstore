#!/usr/bin/env bash
set -euo pipefail

cd /opt/anresstore
git pull --ff-only origin main

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
