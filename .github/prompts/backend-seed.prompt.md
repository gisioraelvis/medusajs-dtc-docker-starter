---
description: "Run backend database setup: migrate, seed, create admin user, and retrieve the publishable API key for the storefront."
name: "Backend Seed & Setup"
argument-hint: "e.g. admin email and password (optional)"
agent: "agent"
---

Run the full backend setup sequence for this Medusa project. Perform each step in order:

1. **Run database migrations** (from `apps/backend`):

   ```bash
   cd apps/backend && pnpm medusa db:migrate
   ```

2. **Seed the database:**

   ```bash
   pnpm seed
   ```

   If the seed script fails with "already seeded" or a unique-constraint error, that's fine — continue.

3. **Create an admin user** (use the email/password from the argument if provided, otherwise default to `admin@example.com` / `supersecret`):
   - **Docker:** `docker compose exec medusa sh -c "cd /server/apps/backend && pnpm medusa user -e <email> -p <password>"`
   - **Local:** `cd apps/backend && pnpm medusa user -e <email> -p <password>`

4. **Retrieve the publishable API key** — query the database and print it:
   - **Docker:** `docker compose exec postgres psql -U postgres -d medusa-store -c "SELECT value FROM api_key WHERE title ILIKE '%publishable%' LIMIT 1;"`
   - **Local:** `psql -U postgres -d medusa-store -c "SELECT value FROM api_key WHERE title ILIKE '%publishable%' LIMIT 1;"`

5. **Set the key in `apps/storefront/.env`:**

   ```env
   NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_...
   ```

6. **Restart the storefront** (Docker only):
   ```bash
   docker compose up storefront -d
   ```

After completing all steps, confirm what was done and print the publishable key so it can be verified.
