#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Write-Output "Running local CI steps: backend tests + frontend lint"

# Backend
python -m venv .venv
. .venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt

# Ensure pytest can import the backend package
# Prepend project backend directory to PYTHONPATH so tests can import the `app` package
$existing = $env:PYTHONPATH
if ([string]::IsNullOrEmpty($existing)) {
	$env:PYTHONPATH = (Join-Path (Get-Location) 'backend')
} else {
	$env:PYTHONPATH = (Join-Path (Get-Location) 'backend') + ";" + $existing
}
pytest -q backend/tests

# Frontend
Push-Location frontend
npm ci
npm run lint
Pop-Location

Write-Output "Local CI completed successfully"
