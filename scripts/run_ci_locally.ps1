#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
Write-Output "Running local CI steps: backend tests + frontend lint"

# Backend
python -m venv .venv
. .venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
pytest -q backend/tests

# Frontend
Push-Location frontend
npm ci
npm run lint
Pop-Location

Write-Output "Local CI completed successfully"
