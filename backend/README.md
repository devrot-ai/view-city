# Redis cache (optional)

This project includes an optional Redis-backed cache used by `app.cache` to
share precomputed routing results across processes. If `REDIS_URL` is set in
the environment (for example `redis://127.0.0.1:6379/0`) the code will attempt
to use Redis; otherwise it falls back to a process-local in-memory TTL cache.

Quick start (Docker):

```powershell
cd ..\docker
docker compose -f redis-compose.yml up -d
setx REDIS_URL "redis://127.0.0.1:6379/0"
```

Install dependencies in your backend virtualenv:

```powershell
python -m pip install -r requirements.txt
```
