---
description: "Use when creating or modifying storefront pages, components, data-fetching, or SDK calls. Covers Next.js App Router conventions, Medusa JS SDK usage, route structure, and design system tokens."
applyTo: "apps/storefront/src/**"
---

# Storefront Conventions

Framework: **Next.js 15** (App Router) + **Turbopack** + **React 19**. Design system: `@medusajs/ui-preset` (Tailwind preset).

## Route Structure

- All customer-facing pages are nested under `src/app/[countryCode]/` for multi-region support.
- The `[countryCode]` dynamic segment is handled by `src/middleware.ts` (locale/region detection).

## Medusa SDK & Data Fetching

The singleton SDK client is at [`src/lib/config.ts`](../../apps/storefront/src/lib/config.ts). Import it everywhere — do not instantiate a new `Medusa` client.

All server-side data fetching lives in `src/lib/data/`. These files use `"use server"` and call the SDK via `sdk.client.fetch()`. Include auth headers and cache options:

```ts
"use server";
import { sdk } from "@lib/config";
import { HttpTypes } from "@medusajs/types";
import { getAuthHeaders, getCacheOptions } from "./cookies";

export async function getProducts(): Promise<HttpTypes.StoreProduct[]> {
  const headers = { ...(await getAuthHeaders()) };
  const next = { ...(await getCacheOptions("products")) };
  const { products } = await sdk.store.product.list(
    { limit: 12 },
    { headers, next, cache: "force-cache" },
  );
  return products;
}
```

The SDK client is wrapped to automatically attach `x-medusa-locale` on every request. Use `HttpTypes` from `@medusajs/types` for response type annotations.

## Path Aliases

Defined in `tsconfig.json` with `baseUrl: "./src"`:

| Alias        | Resolves to     |
| ------------ | --------------- |
| `@lib/*`     | `src/lib/*`     |
| `@modules/*` | `src/modules/*` |
| `@pages/*`   | `src/pages/*`   |

## Environment Variables

| Variable                             | Required | Notes                               |
| ------------------------------------ | -------- | ----------------------------------- |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | **yes**  | App crashes at startup if missing   |
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL`     | no       | Defaults to `http://localhost:9000` |
| `NEXT_PUBLIC_DEFAULT_REGION`         | no       | Fallback region code                |

## Styling

- Use Tailwind utility classes and tokens from `@medusajs/ui-preset` (custom greys, radii, screens).
- Dark mode is class-based (`dark:`).
- Global styles: `src/styles/globals.css`.

## Client-Side Data

- Client components use hooks from `src/lib/hooks/` (wrap the server action functions from `src/lib/data/`).

## Bundle Analysis

```bash
cd apps/storefront
pnpm analyze   # ANALYZE=true next build
```
