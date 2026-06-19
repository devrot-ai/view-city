#!/usr/bin/env bash
set -euo pipefail

echo "Running local CI steps: backend tests + frontend lint"

# Backend
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
pytest -q backend/tests

deactivate || true

# Frontend
cd frontend
npm ci
npm run lint

echo "Local CI completed successfully"
