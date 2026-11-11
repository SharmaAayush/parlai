# Deployment Guide

This document describes how to deploy, upgrade, roll back, and back up the ParlAI application.

## Requirements

- A Linux server with Docker and the Docker Compose plugin installed
- A domain name whose DNS points at the server
- Ports 80 and 443 open on the server firewall

## First Deploy

1. Copy the following files to `/opt/parl-ai/` on the server:
   - `docker-compose.prod.yml`
   - `docker/Caddyfile`
   - `.env.production.example`

2. Create the production environment file:
   ```bash
   cd /opt/parl-ai
   cp .env.production.example .env.production
   ```

3. Generate secrets and configure `.env.production`:
   ```bash
   # Generate database password
   openssl rand -base64 32
   
   # Set the following in .env.production:
   # POSTGRES_PASSWORD=<generated-password>
   # DOMAIN=your-domain.com
   # APP_URL=https://your-domain.com
   # TRUST_PROXY=true
   # PARLAI_IMAGE=ghcr.io/<owner>/parl-ai:<version>
   ```

4. Secure the environment file:
   ```bash
   chmod 600 .env.production
   ```

5. Start the stack:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml --profile proxy up -d --wait
   ```

6. Verify the deployment:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   curl -f https://<domain>/api/health
   docker compose -f docker-compose.prod.yml logs --tail=100 app
   ```

## Upgrade

1. Update the image tag in `.env.production`:
   ```bash
   # Edit .env.production and change PARLAI_IMAGE to the new tag
   PARLAI_IMAGE=ghcr.io/<owner>/parl-ai:<new-version>
   ```

2. Pull the new image and restart:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml pull
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --wait
   ```

3. Verify the upgrade:
   ```bash
   curl -f https://<domain>/api/health
   docker compose -f docker-compose.prod.yml logs --tail=100 app
   ```

The `migrate` service runs first and must succeed before the `app` service starts.

## Rollback

1. Change the image tag back to the previous version in `.env.production`:
   ```bash
   PARLAI_IMAGE=ghcr.io/<owner>/parl-ai:<previous-version>
   ```

2. Restart the stack:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --wait
   ```

3. Verify the rollback:
   ```bash
   curl -f https://<domain>/api/health
   docker compose -f docker-compose.prod.yml logs --tail=100 app
   ```

**Important:** Database changes are **not** undone by rolling back the application image. All migrations from this point forward must be written **backward compatible for one release** (add columns/tables first, remove old ones in a later release).

To explicitly revert the last migration (only when the old image needs it):
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate node dist/migrate.js --revert
```

## Backups

### Create a backup
```bash
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U parlai -Fc parlai > /backups/parlai-$(date +%F).dump
```

### Schedule daily backups with cron
Add to crontab (`crontab -e`):
```
0 2 * * * docker compose -f /opt/parl-ai/docker-compose.prod.yml exec -T db pg_dump -U parlai -Fc parlai > /backups/parlai-$(date +\%F).dump
```

Keep at least 7 days of backups and copy them off the server regularly.

### Restore a backup
```bash
# Stop the app first
docker compose -f docker-compose.prod.yml stop app

# Restore
docker compose -f docker-compose.prod.yml exec -T db pg_restore -U parlai -d parlai --clean --if-exists < /backups/parlai-2026-01-15.dump

# Start the app
docker compose -f docker-compose.prod.yml start app
```

**Test a restore at least once** to ensure your backup process works.

## Secrets

Secrets live in `.env.production` on the server (chmod 600). Only the deployment user and root can read them.

**Critical warning:** Losing `KEY_ENCRYPTION_KEYS` (when implemented in future steps) makes every stored user API key unrecoverable. Back them up separately from the database dump.

## Environment Variable Table

| Name | Required | Example | Description |
|------|----------|---------|-------------|
| POSTGRES_PASSWORD | Yes | `secure-password` | PostgreSQL password |
| DOMAIN | Yes (with proxy) | `example.com` | Domain for Caddy HTTPS |
| APP_URL | Yes | `https://example.com` | Application URL for CORS, redirects |
| NODE_ENV | Yes | `production` | Node environment |
| PARLAI_IMAGE | No | `ghcr.io/owner/parl-ai:v0.1.0` | Docker image to use (default: parl-ai:local) |
| TRUST_PROXY | Yes (with proxy) | `true` | Trust proxy headers for secure cookies |
| SUPPORTED_PROVIDERS | Yes | `openrouter,local` | Comma-separated list of supported provider ids |
| PROVIDER_OPENROUTER_LABEL | No | `OpenRouter` | Display label for the OpenRouter provider |
| PROVIDER_OPENROUTER_TYPE | No | `openai-compatible` | Provider type |
| PROVIDER_OPENROUTER_BASE_URL | Yes | `https://openrouter.ai/api/v1` | Base URL for OpenRouter API |
| PROVIDER_OPENROUTER_API_KEY | No | `sk-...` | Server API key for OpenRouter |
| PROVIDER_LOCAL_LABEL | No | `Local (Ollama)` | Display label for the local provider |
| PROVIDER_LOCAL_TYPE | No | `openai-compatible` | Provider type |
| PROVIDER_LOCAL_BASE_URL | Yes | `http://localhost:11434/v1` | Base URL for local provider API |
| PROVIDER_LOCAL_REQUIRES_KEY | No | `false` | Whether the local provider requires an API key |
| ALLOWED_MODELS | Yes | `openrouter:vendor/model-a,local:llama3.1:8b` | Comma-separated list of allowed providerId:modelId entries |
| DEFAULT_PROVIDER | Yes | `openrouter` | Default provider (must be in ALLOWED_MODELS) |
| DEFAULT_MODEL | Yes | `vendor/model-a` | Default model (must be in ALLOWED_MODELS) |

## Troubleshooting

### App restarting continuously
```bash
docker compose -f docker-compose.prod.yml logs app
```
Usually caused by a bad environment variable value. Check the logs for the specific error.

### Migration failed
```bash
docker compose -f docker-compose.prod.yml logs migrate
```
Fix the migration issue, then restart:
```bash
docker compose -f docker-compose.prod.yml up -d --wait
```

### Health check failing
```bash
curl -f https://<domain>/api/health
docker compose -f docker-compose.prod.yml logs app
```
Check that the database is reachable and the app can connect.

### 502 from Caddy
```bash
docker compose -f docker-compose.prod.yml logs caddy
docker compose -f docker-compose.prod.yml logs app
```
Usually means the app isn't healthy or isn't listening on port 3000.

### Streaming responses arrive all at once (proxy buffering)
Ensure `flush_interval -1` is set in the Caddyfile (already configured).

## Links

- [GitHub Repository](https://github.com/SharmaAayush/parlai)
- [Docker Images](https://github.com/SharmaAayush/parlai/pkgs/container/parl-ai)