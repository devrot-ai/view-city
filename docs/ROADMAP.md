# Project Roadmap & Architecture (Summary)

## Current State

- Backend: FastAPI app in `backend/app` with a tick-based `SimulationEngine` coordinating traffic, pollution, noise, and accidents. WebSocket `/ws` for delta broadcasts.
- Frontend: Vite + React 19 SPA in `frontend/` with a `CityMap` canvas overlay and control panels (RouteOptimizer, Policy selector).
- Tests: Basic backend unit tests (CityGraph, PolicyEngine) and frontend Vitest smoke tests. CI runs Python tests and frontend lint/tests.
- CI/CD: GitHub Actions configured to run tests and lint; Dockerfiles and `docker-compose` assets available but image publish step not yet added.

## Short-Term Priorities (High)

1. Increase automated test coverage:
   - Add unit tests for `SimulationEngine`, `PolicyEngine`, and frontend map interactions.
   - Mock `window.google.maps` for headless tests.
2. Add E2E tests (Playwright/Cypress) covering: app boot, REST `/api` health, WebSocket delta flow, applying a policy and observing simulation changes.
3. Add CI job to build and publish Docker images (GHCR) and tag releases.
4. Add health & metrics endpoints (`/api/health`, `/api/metrics`) and integrate a Prometheus client for observability.

## Mid-Term Priorities (Medium)

- Harden CORS and production config (use explicit origins, secrets via GitHub Secrets).
- Add request/structured JSON logging and log rotation.
- Add lightweight auth for control endpoints (API key or OAuth) for safety in staging.
- Implement feature flags for heavy simulation options.

## Long-Term (Lower)

- Integrate real map tiles (vector tiles) and offline routing fallback.
- Add persistent snapshotting (optional DB) to replay simulations.
- Add a release pipeline: build images, run integration tests, tag and publish.

## Immediate Next Action (what I'll do next)

- Create lightweight architecture doc and a `Makefile` target for running tests and building images locally.
