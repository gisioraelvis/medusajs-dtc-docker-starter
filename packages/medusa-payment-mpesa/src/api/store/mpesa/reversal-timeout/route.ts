import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Logger } from "@medusajs/framework/types";

/**
 * POST /store/mpesa/reversal-timeout
 *
 * Receives timeout notification for a reversal request from Daraja.
 */
export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> => {
  const logger = req.scope.resolve<Logger>("logger");
  logger.warn(`[Mpesa] Reversal request timed out`);
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
};
