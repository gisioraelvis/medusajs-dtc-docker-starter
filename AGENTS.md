# Agent Instructions — Medusa v2 + Next.js Monorepo

Monorepo: `apps/backend` (Medusa v2, :9000) + `apps/storefront` (Next.js 15, :8000).

## Core Rules

- Use `pnpm` only (never npm/yarn).
- Default scripts: `pnpm dev`, `pnpm build`, `pnpm docker:up`, `pnpm docker:down`.
- Do not change `.npmrc` peer behavior or `pnpm-workspace.yaml` exclusions.

## Docker + Env

- Containers: `medusa_postgres:5432`, `medusa_redis:6379`, `medusa_backend:9000/5173`, `medusa_storefront:8000`.
- Container workdir is `/server`; backend exec path is `/server/apps/backend`.
- In Docker, storefront backend URL is `http://medusa:9000` (never localhost).
- `apps/storefront/.env` must include `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`.
- Keep `start.sh` and `start-storefront.sh` on LF line endings.
- Do not set `ssl: true` unless `sslmode: "disable"` is handled correctly.

## Backend Rules (`apps/backend/src/**`)

- API route file must be `route.ts`; folder path defines URL.
- Use named method exports (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`), no default export.
- Resolve services via container scope (`req.scope.resolve(...)`).
- Modules in `src/modules/<name>/` include model + service + index registration.
- Cross-module links in `src/links/` via `defineLink`; run migrations after link/schema changes.
- Workflows in `src/workflows/` use step/workflow primitives + compensation.
- Subscribers/jobs export default handler + named `config`.
- Admin customizations go in `src/admin/widgets/` or `src/admin/routes/`.
- Keep Node16-compatible TypeScript import style.

## Storefront Rules (`apps/storefront/src/**`)

- App Router paths are country-scoped under `src/app/[countryCode]/`.
- Locale/region routing is controlled by `src/middleware.ts`.
- Reuse singleton SDK in `src/lib/config.ts`.
- Prefer server data functions in `src/lib/data/` with auth headers + cache options.
- Use `HttpTypes` for Medusa response typing where possible.
- Respect path aliases (`@lib/*`, `@modules/*`, `@pages/*`) and module boundaries.
- Follow existing Tailwind/design-token patterns.

## Skill Loading Map

- `building-with-medusa`: backend modules/routes/workflows/models/links.
- `building-admin-dashboard-customizations`: admin widgets/pages/forms/tables/data loading.
- `building-storefronts`: storefront API integration + SDK + React Query patterns.
- `storefront-best-practices`: all ecommerce storefront components/flows (cart/checkout/product/nav).
- `db-generate`: generate migrations for schema/module changes.
- `db-migrate`: apply migrations safely.

## Merged Agentic Workflow

- Use when building/fixing backend features, storefront integration, or migration-related changes.
- Inputs: goal, target area (backend/storefront/full-stack), schema impact (yes/no), delivery mode.
- Default mode: safety-first full workflow; prioritize correctness over speed.
- Scope rule: backend first for full-stack work, then storefront/admin wiring.
- Schema rule: if data model/link changes, run migration generation then migration; otherwise skip.
- Runtime rule: honor Docker/local env differences before coding.
- Risk rule: high-risk domains (`checkout`, `payment`, `auth`, `order`) require stronger edge-case checks.
- Validation rule: targeted checks first, broader checks as needed; always with `pnpm`.
- Completion gates: acceptance criteria met, backend/storefront contract consistent, migrations handled, no obvious regressions.
- Reporting: summarize changed files, behavior impact, assumptions, and follow-up tasks.
