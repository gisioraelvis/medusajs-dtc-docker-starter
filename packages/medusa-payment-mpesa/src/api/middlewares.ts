import { defineMiddlewares } from "@medusajs/framework/http";

/**
 * Global API middleware configuration.
 *
 * M-Pesa webhook routes (/store/mpesa/callback, /store/mpesa/reversal-*)
 * must remain publicly accessible — Safaricom Daraja calls them directly
 * and cannot provide a customer session or bearer token.
 *
 * The status polling route (/store/mpesa/status/:id) is also public by design:
 * it is called from the storefront during checkout and only returns
 * non-sensitive payment status information.
 *
 * Add body/query validation middleware here as the integration matures.
 */
export default defineMiddlewares({
  routes: [],
});
