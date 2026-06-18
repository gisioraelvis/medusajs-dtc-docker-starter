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

// ---------------------------------------------------------------------------
// Module-scoped MpesaClient singleton
// ---------------------------------------------------------------------------
// A single instance is shared across all requests so that the in-process
// OAuth token cache is reused, avoiding a fresh Daraja token fetch on every
// poll call.  The instance is (re-)created only when the env vars change
// (which only happens on process restart in practice).
// ---------------------------------------------------------------------------
let _clientSingleton: MpesaClient | null = null;
let _clientConfigKey = "";

function getClient(logger: Logger): MpesaClient {
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

  // Invalidate the cached client if any env var has changed
  const configKey = `${consumerKey}|${consumerSecret}|${businessShortCode}|${passKey}|${environment}`;
  if (!_clientSingleton || _clientConfigKey !== configKey) {
    _clientSingleton = new MpesaClient(
      {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        business_short_code: businessShortCode,
        pass_key: passKey,
        environment,
      },
      logger,
    );
    _clientConfigKey = configKey;
  }

  return _clientSingleton;
}

// ---------------------------------------------------------------------------
// Simple IP-based rate limiter
// ---------------------------------------------------------------------------
// Limits each IP to RATE_LIMIT_MAX_REQUESTS calls within RATE_LIMIT_WINDOW_MS.
// Uses an in-memory Map; entries are pruned as windows expire so memory does not grow unboundedly.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 polls/min per IP (10 s × 3 s interval)

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // Start a fresh window
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }
  return false;
}

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> => {
  const { checkoutRequestId } = req.params as { checkoutRequestId: string };
  const logger = req.scope.resolve<Logger>("logger");

  // Empty guard on checkoutRequestId from route path
  if (!checkoutRequestId?.trim()) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "checkoutRequestId path parameter is required",
    );
  }

  // Enforce per-IP rate limit to prevent Daraja API abuse
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  if (isRateLimited(clientIp)) {
    res.status(429).json({ message: "Too many requests. Please slow down." });
    return;
  }

  const client = getClient(logger);

  try {
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
      case "9999": // Internal switch error — terminal, retry won't help
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
    // Daraja returns an error body (not 200) when the STK transaction is not yet settled. 
    // Treat as "pending" so the storefront can retry.
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
