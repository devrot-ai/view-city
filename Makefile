.PHONY: build up down logs prod-build prod-up prod-down test lint

build:
	docker-compose build

up:
	docker-compose up --build

down:
	docker-compose down

logs:
	docker-compose logs -f

prod-build:
	docker-compose -f docker-compose.prod.yml build

prod-up:
	docker-compose -f docker-compose.prod.yml up --build -d

prod-down:
	docker-compose -f docker-compose.prod.yml down

test:
	@echo "Running backend tests"
	python -m venv .venv || true
	.venv\Scripts\Activate.ps1 2>nul || . .venv/bin/activate
	pip install -r backend/requirements.txt
	pytest -q backend/tests

lint:
	@echo "Running frontend lint"
	cd frontend && npm ci && npm run lint
