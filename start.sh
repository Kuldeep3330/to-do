#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  cp .env.example .env
fi

API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"

# Start API in background
npm run start:dev -w apps/api &
API_PID=$!

# Frontend is the exposed port (same-origin /api rewrite to Nest)
npm run dev -w apps/web

trap "kill $API_PID" EXIT
