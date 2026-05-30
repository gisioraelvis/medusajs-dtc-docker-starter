import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import { MpesaClient } from "../../../../../providers/mpesa/client";

/**
 * GET /store/mpesa/status/:checkoutRequestId
 *
 * Polls Daraja for the result of an STK Push.
 * The storefront calls this after the customer pays on their phone,
 * to confirm completion before placing the order.
 *
 * NOTE: This route is intentionally unauthenticated — it is called from the
 * storefront after the customer initiates payment and needs to know if their
 * phone prompt was completed. The checkoutRequestId is a UUID-like opaque value
 * issued by Safaricom and is not guessable in practice.
 */
export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> => {
  const { checkoutRequestId } = req.params as { checkoutRequestId: string };
  const logger = req.scope.resolve<Logger>("logger");

  // checkoutRequestId is always provided by the router since it's in the path,
  // but guard against empty strings just in case
  if (!checkoutRequestId?.trim()) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "checkoutRequestId path parameter is required",
    );
  }

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const businessShortCode = process.env.MPESA_BUSINESS_SHORT_CODE;
  const passKey = process.env.MPESA_PASS_KEY;
  const environment =
    (process.env.MPESA_ENVIRONMENT as "sandbox" | "production") || "sandbox";

  if (!consumerKey || !consumerSecret || !businessShortCode || !passKey) {
    logger.error(
      "[Mpesa] Status endpoint called but M-Pesa env vars are missing",
    );
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "M-Pesa is not configured on this server",
    );
  }

  try {
    // Re-use the payment module's registered provider options via process.env.
    // NOTE: A new MpesaClient is constructed here because the provider service
    // instance is not directly resolvable from the API route scope. The OAuth
    // token cache is local to this instance; for high-traffic deployments, consider
    // sharing the client via a module-scoped singleton.
    const client = new MpesaClient({
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      business_short_code: businessShortCode,
      pass_key: passKey,
      environment,
    });

    const result = await client.stkQuery(checkoutRequestId);

    let status: "paid" | "pending" | "cancelled" | "error";
    switch (result.ResultCode) {
      case "0":
        status = "paid";
        break;
      case "1032": // Cancelled by user
        status = "cancelled";
        break;
      case "1037": // Timeout waiting for user input
      case "2001": // Wrong PIN entered
      case "1019": // Transaction expired
        status = "error";
        break;
      default:
        status = "pending";
    }

    res.status(200).json({
      status,
      result_code: result.ResultCode,
      result_desc: result.ResultDesc,
    });
  } catch (err) {
    // Daraja returns an error body (not 200) when the STK transaction is not yet
    // settled. Treat as "pending" so the storefront can retry.
    logger.warn(
      `[Mpesa] STK status query inconclusive for ${checkoutRequestId}: ${(err as Error).message}`,
    );
    res.status(200).json({
      status: "pending",
      result_code: null,
      result_desc: "Payment status not yet available",
    });
  }
};
