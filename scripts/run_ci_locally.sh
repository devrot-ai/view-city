#!/usr/bin/env bash
set -euo pipefail

echo "Running local CI steps: backend tests + frontend lint"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Backend
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt

# Ensure tests can import the backend package
export PYTHONPATH=${PYTHONPATH:-}:"$(pwd)/backend"
pytest -q backend/tests

deactivate || true

# Frontend
cd frontend
npm install --legacy-peer-deps
npm run lint

echo "Local CI completed successfully"
