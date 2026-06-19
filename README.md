# Digital Twin City — Traffic Control using AI

Minimal instructions to run the backend (FastAPI) and frontend (Vite + React), run tests, and configure environment variables.

Prerequisites

- Python 3.10+ (a virtualenv is recommended)
- Node.js 16+ / npm (for frontend development)

Backend (development)

1. Create and activate a virtual environment:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

2. Install Python dependencies:

```powershell
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

3. (Optional) Create a `backend/.env` file to override defaults. Supported env vars:

- `CORS_ORIGINS` — comma-separated origins (e.g. `http://localhost:5173`)
- `GRID_SIZE` — grid size used to generate the city (default: 8)
- `DEBUG` — set to `true` or `false`
 - `JSON_LOGGING` — set to `true` to enable JSON structured logs, `false` for plain text

4. Run backend dev server:

```powershell
uvicorn app.main:app --reload --app-dir backend/app --host 0.0.0.0 --port 8000
```

The FastAPI docs will be available at `http://localhost:8000/docs`.

Frontend (development)

1. Install frontend deps and start Vite:

```bash
cd frontend
npm ci
npm run dev
```

By default Vite serves on `http://localhost:5173`. The frontend expects the API at `/api` and the WebSocket at `/ws`.

Building for production

1. Build the frontend and then serve static files from the backend (optional):

```bash
cd frontend
npm run build

# After building, a `frontend/dist` folder will be created. The backend will serve
# these files automatically when present.
```

Testing

Run backend tests (pytest). Note: some tests depend on `numpy`; on Windows, installing `numpy` may require a compiler or prebuilt wheel.

```powershell
# from project root
python -m pip install -r backend/requirements.txt
pytest -q backend/tests
```

CI

A GitHub Actions workflow is included at `.github/workflows/ci.yml` which runs Python tests and frontend linting on push / pull requests.

Notes & Troubleshooting

- If `numpy` fails to install on Windows due to compilation issues, either install a prebuilt wheel for your Python version or run tests on Linux (CI) where wheels are available.
- Configure CORS for production by setting `CORS_ORIGINS` to your frontend origin(s) rather than `*`.

Docker Compose (development)

You can run both backend and frontend using Docker Compose for a reproducible dev environment:

```bash
docker-compose up --build
```

This will start the backend on `http://localhost:8000` and the frontend on `http://localhost:5173`.

Run CI locally

Two helper scripts are provided to run the CI steps locally:

- Unix/macOS: `scripts/run_ci_locally.sh`
- Windows PowerShell: `scripts/run_ci_locally.ps1`

They perform backend dependency install and tests, then frontend `npm ci` and `npm run lint`.

If you want, I can add a Docker Compose production setup next.

Production Docker Compose

A production compose file is available at `docker-compose.prod.yml`. It builds the frontend static bundle and serves it via Nginx, proxying API and WebSocket traffic to the backend.

To build and run the production stack:

```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

You can stop it with:

```bash
docker-compose -f docker-compose.prod.yml down
```

Makefile

A `Makefile` is included for convenience. Useful targets:

- `make build` — build dev compose images
- `make up` — run dev compose
- `make prod-build` — build production images
- `make prod-up` — run production compose in background
- `make test` — run backend pytest suite
- `make lint` — run frontend linter
