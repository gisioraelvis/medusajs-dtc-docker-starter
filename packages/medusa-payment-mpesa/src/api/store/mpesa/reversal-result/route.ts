import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Logger } from "@medusajs/framework/types";

/**
 * POST /store/mpesa/reversal-result
 *
 * Receives and logs the result of a B2B/reversal request from Daraja.
 * Further processing (e.g., marking the refund complete) can be added here as needed.
 */
export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> => {
  const logger = req.scope.resolve<Logger>("logger");
  try {
    const body = req.body as Record<string, unknown>;
    // Log only the conversation IDs, not any customer data
    const result = body?.Result as Record<string, unknown> | undefined;
    logger.info(
      `[Mpesa] Reversal result — ConversationID: ${result?.ConversationID ?? "unknown"}, ResultCode: ${result?.ResultCode ?? "unknown"}`,
    );
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    req.scope
      .resolve<Logger>("logger")
      .error(`[Mpesa] Reversal result error: ${(err as Error).message}`);
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
};
