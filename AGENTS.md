# Agent Instructions — Medusa v2 + Next.js Docker Monorepo

Monorepo: `apps/backend` (Medusa v2) + `apps/storefront` (Next.js 15). See [README.md](README.md) for full setup and Docker workflow.

## Package Manager

Always use **pnpm** (v10.11.1). Never `npm install` or `yarn`.

```bash
pnpm dev            # run backend + storefront concurrently
pnpm build          # build all apps (via turbo)
pnpm backend:seed   # seed backend database
pnpm docker:up      # docker compose up --build -d
pnpm docker:down    # docker compose down
```

## Project Structure

```
apps/backend/    Medusa v2 API + admin UI  →  port 9000  (admin: /app,  HMR: 5173)
apps/storefront/ Next.js 15 storefront    →  port 8000
Dockerfile       single image for both services
docker-compose.yml  postgres · redis · medusa · storefront
```

Detailed conventions for each app are in auto-applied instruction files:

- Backend (`apps/backend/src/**`): [backend-api.instructions.md](.github/instructions/backend-api.instructions.md)
- Storefront (`apps/storefront/src/**`): [storefront.instructions.md](.github/instructions/storefront.instructions.md)

## Docker

| Container           | Port(s)    | Notes                       |
| ------------------- | ---------- | --------------------------- |
| `medusa_postgres`   | 5432       | DB: `medusa-store`          |
| `medusa_redis`      | 6379       | shared by all Redis modules |
| `medusa_backend`    | 9000, 5173 | API + admin                 |
| `medusa_storefront` | 8000       |                             |

- **WORKDIR inside containers is `/server`** (not `/app`) — use `/server/apps/backend` in `exec` commands.
- **`NEXT_PUBLIC_MEDUSA_BACKEND_URL`** must be `http://medusa:9000` (Docker hostname) inside compose — never `localhost`.
- **Shell scripts (`start.sh`, `start-storefront.sh`) must use LF line endings** — enforced via `.gitattributes`. If a script isn't found at container start, check line endings.

## Environment Files

`apps/backend/.env` and `apps/storefront/.env` are git-ignored. `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in `apps/storefront/.env` is **required** — the storefront crashes at startup if missing.

## Critical Constraints

- **Do not set `ssl: true`** in `databaseDriverOptions` without also removing `sslmode: "disable"` — current config is development-only.
- **`.npmrc` sets `auto-install-peers=true`**; do not add peer deps manually.
- **`pnpm-workspace.yaml` excludes `apps/backend/.medusa/**`\*\* (generated build output) — do not modify this exclusion.
