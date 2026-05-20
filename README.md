<p align="center">
  <a href="https://www.medusajs.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    </picture>
  </a>
</p>
<h1 align="center">
  Medusa Containerized DTC Starter
</h1>

<h4 align="center">
  <a href="https://docs.medusajs.com">Documentation</a> |
  <a href="https://www.medusajs.com">Website</a>
</h4>

<p align="center">
  Building blocks for digital commerce
</p>
<p align="center">
  <a href="https://github.com/medusajs/medusa/blob/develop/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="Medusa is released under the MIT license." />
  </a>
  <a href="https://circleci.com/gh/medusajs/medusa">
    <img src="https://circleci.com/gh/medusajs/medusa.svg?style=shield" alt="Current CircleCI build status." />
  </a>
  <a href="https://github.com/medusajs/medusa/blob/develop/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
    <a href="https://www.producthunt.com/posts/medusa"><img src="https://img.shields.io/badge/Product%20Hunt-%231%20Product%20of%20the%20Day-%23DA552E" alt="Product Hunt"></a>
  <a href="https://discord.gg/xpCwq3Kfn8">
    <img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Discord Chat" />
  </a>
  <a href="https://twitter.com/intent/follow?screen_name=medusajs">
    <img src="https://img.shields.io/twitter/follow/medusajs.svg?label=Follow%20@medusajs" alt="Follow @medusajs" />
  </a>
</p>

A production-ready docker containerized monorepo starter for direct-to-consumer ecommerce store powered by Medusa and Next.js. Includes a fully featured storefront with product browsing, cart, checkout, customer accounts, and order management.

## Features

- All of [Medusa's commerce features](https://docs.medusajs.com/resources/commerce-modules)
- Multi-region support with automatic country detection
- Product catalog with variant selection
- Cart with promotion codes
- Multi-step checkout with shipping and payment
- Customer accounts with order history and address management
- Order transfer between accounts

## Quick Commands

| Task                    | Command                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Start all services      | `docker compose up --build -d`                                                                                       |
| Stop all services       | `docker compose down`                                                                                                |
| Restart storefront only | `docker compose up -d --force-recreate storefront`                                                                   |
| Show container status   | `docker compose ps`                                                                                                  |
| Tail all logs           | `docker compose logs -f`                                                                                             |
| Tail backend logs       | `docker compose logs -f medusa`                                                                                      |
| Tail storefront logs    | `docker compose logs -f storefront`                                                                                  |
| Create admin user       | `docker compose exec medusa sh -c "cd /server/apps/backend && pnpm medusa user -e admin@example.com -p supersecret"` |
| Start with root script  | `pnpm docker:up`                                                                                                     |
| Stop with root script   | `pnpm docker:down`                                                                                                   |

## Getting Started

### Docker Containerized Installation

> **Prerequisites:**
>
> - [Docker](https://docs.docker.com/get-docker/)
> - [Docker Compose](https://docs.docker.com/compose/install/)
> - [Git](https://git-scm.com/downloads)

1. Clone this repository:

```bash
git clone https://github.com/gisioraelvis/medusajs-containerized-starter.git
cd medusajs-containerized-starter
```

2. Create environment files:

```bash
cp apps/backend/.env.template apps/backend/.env
cp apps/storefront/.env.template apps/storefront/.env
```

3. Start all services (Postgres, Redis, Medusa backend/admin, storefront):

```bash
docker compose up --build -d
```

Or use the root script:

```bash
pnpm docker:up
```

4. Open the applications:

- Backend API: `http://localhost:9000`
- Admin: `http://localhost:9000/app`
- Storefront: `http://localhost:8000`

#### Configure Admin User and Storefront Key

1. Create an admin user (if you do not already have one):

```bash
docker compose exec medusa sh -c "cd /server/apps/backend && pnpm medusa user -e admin@example.com -p supersecret"
```

2. In Admin, go to **Settings** > **Publishable API Keys** and create or copy a key.

3. Set the key in `apps/storefront/.env`:

```env
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_...
```

4. Restart storefront:

```bash
docker compose up storefront -d
```

#### Container Management

- Start or rebuild containers:

```bash
docker compose up --build -d
```

- Stop and remove containers:

```bash
docker compose down
```

- View all logs:

```bash
docker compose logs -f
```

- View backend logs only:

```bash
docker compose logs -f medusa
```

- View storefront logs only:

```bash
docker compose logs -f storefront
```

- Check container status:

```bash
docker compose ps
```

#### Troubleshooting

- If `start.sh` or `start-storefront.sh` is not found, make sure these files use LF line endings (not CRLF).
- If the storefront exits with missing environment variable errors, set `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in `apps/storefront/.env` and restart `storefront`.
- If you run multiple Medusa Docker projects, use unique container names, ports, volume names, and network names.

## Resources

- [Medusa Docker Install](https://docs.medusajs.com/learn/installation/docker)