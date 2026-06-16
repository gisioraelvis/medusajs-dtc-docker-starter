import MpesaPaymentProviderService from "./service";
import { ModuleProvider, Modules } from "@medusajs/framework/utils";

/**
 * M-Pesa Payment Module Provider for Medusa v2.
 *
 * Register in medusa-config.ts:
 *
 * ```typescript
 * import type { MpesaOptions } from "medusa-payment-mpesa"
 *
 * modules: [{
 *   resolve: "@medusajs/medusa/payment",
 *   options: {
 *     providers: [{
 *       resolve: "medusa-payment-mpesa/providers/mpesa",
 *       id: "mpesa",
 *       options: {
 *         consumer_key: process.env.MPESA_CONSUMER_KEY,
 *         consumer_secret: process.env.MPESA_CONSUMER_SECRET,
 *         business_short_code: process.env.MPESA_BUSINESS_SHORT_CODE,
 *         pass_key: process.env.MPESA_PASS_KEY,
 *         environment: process.env.MPESA_ENVIRONMENT || "sandbox",
 *         callback_base_url: process.env.MPESA_CALLBACK_BASE_URL || process.env.BACKEND_URL,
 *         // Only for refunds:
 *         initiator_name: process.env.MPESA_INITIATOR_NAME,
 *         initiator_password: process.env.MPESA_INITIATOR_PASSWORD,
 *       } satisfies MpesaOptions,
 *     }],
 *   },
 * }]
 * ```
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [MpesaPaymentProviderService],
});
