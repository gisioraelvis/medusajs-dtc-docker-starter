---
description: "Use when creating or modifying Medusa backend API routes, custom modules, workflows, subscribers, or jobs. Covers file-based routing, handler patterns, service injection, and module conventions."
applyTo: "apps/backend/src/**"
---

# Backend API & Module Conventions

See [API Routes README](../../apps/backend/src/api/README.md) and [Medusa Docs](https://docs.medusajs.com/learn/fundamentals/api-routes.md) for full reference.

## API Routes

- Route files must be named `route.ts` — file path determines the URL.
- `src/api/store/` → `/store/…` endpoints; `src/api/admin/` → `/admin/…` endpoints.
- Export named HTTP verb functions — not a default export:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ message: "ok" });
}
```

- Resolve services via the Medusa container: `const myService = req.scope.resolve("myModuleService")`
- Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`

## Modules

Custom modules live in `src/modules/<name>/`. Each module needs three pieces:

1. **Data model** — `src/modules/<name>/models/<model>.ts`:
   ```ts
   import { model } from "@medusajs/framework/utils";
   const Post = model.define("post", {
     id: model.id().primaryKey(),
     title: model.text(),
   });
   export default Post;
   ```
2. **Service** — `src/modules/<name>/service.ts`:
   ```ts
   import { MedusaService } from "@medusajs/framework/utils";
   import Post from "./models/post";
   class BlogModuleService extends MedusaService({ Post }) {}
   export default BlogModuleService;
   ```
3. **Index** — `src/modules/<name>/index.ts` exports the `Module` object and registers it in `medusa-config.ts` under `modules`.

See [Modules README](../../apps/backend/src/modules/README.md).

## Module Links

Link data models across modules in `src/links/` using `defineLink` from `@medusajs/framework/utils`:

```ts
import { defineLink } from "@medusajs/framework/utils";
import ProductModule from "@medusajs/medusa/product";
import BlogModule from "../modules/blog";

export default defineLink(
  ProductModule.linkable.product,
  BlogModule.linkable.post,
);
```

Run `pnpm medusa db:migrate` after adding or modifying links. See [Links README](../../apps/backend/src/links/README.md).

## Workflows

Workflows live in `src/workflows/`. Import from `@medusajs/framework/workflows-sdk`:

```ts
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
```

Use compensation functions for rollback and `WorkflowResponse` to return output. See [Workflows README](../../apps/backend/src/workflows/README.md).

## Subscribers

Subscribers live in `src/subscribers/`. Each file exports a default async handler and a named `config`:

```ts
import { type SubscriberConfig } from "@medusajs/framework";

export default async function handler({ event, container }) {
  // container.resolve("myModuleService")
}

export const config: SubscriberConfig = { event: "product.created" };
```

See [Subscribers README](../../apps/backend/src/subscribers/README.md) and [Events Reference](https://docs.medusajs.com/resources/references/events).

## Scheduled Jobs

Jobs live in `src/jobs/`. Each file exports a default async handler and a named `config`:

```ts
import { MedusaContainer } from "@medusajs/framework/types";

export default async function myJob(container: MedusaContainer) {
  const productService = container.resolve("product");
}

export const config = {
  name: "my-job",
  schedule: "0 0 * * *", // cron expression
  // numberOfExecutions?: number   (optional cap)
};
```

See [Jobs README](../../apps/backend/src/jobs/README.md).

## Admin Widgets & Pages

Admin customizations live in `src/admin/widgets/` and `src/admin/routes/`. They are React components. Use `defineWidgetConfig` from `@medusajs/admin-sdk` and an `injection zone` to attach to existing admin pages:

```tsx
import { defineWidgetConfig } from "@medusajs/admin-sdk";

const MyWidget = () => <div>Custom widget</div>;

export const config = defineWidgetConfig({ zone: "product.details.after" });
export default MyWidget;
```

See [Admin Injection Zones](https://docs.medusajs.com/resources/admin-widget-injection-zones) and [Admin README](../../apps/backend/src/admin/README.md).

## TypeScript Notes

- `moduleResolution: Node16`, `module: Node16` — use `.js` extensions in relative imports if needed.
- Verify types with `pnpm exec tsc --noEmit` (must exit 0).
