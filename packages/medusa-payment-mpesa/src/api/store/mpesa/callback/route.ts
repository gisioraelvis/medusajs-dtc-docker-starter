import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import type { IPaymentModuleService } from "@medusajs/framework/types";
import type { Logger } from "@medusajs/framework/types";

/**
 * POST /store/mpesa/callback
 *
 * Receives STK Push callback from Safaricom Daraja API.
 * Daraja posts the payment result here after the customer
 * completes (or cancels) the STK Push prompt on their phone.
 *
 * This route must be publicly accessible (no auth middleware).
 */
export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> => {
  const logger = req.scope.resolve<Logger>("logger");

  const expectedSecret = process.env.MPESA_WEBHOOK_SECRET;

  // Daraja echoes the full callback URL — including any query parameters — in
  // the POST it sends.  We therefore check the `secret` query param (set when
  // the STK Push was initiated) rather than a custom header (which Daraja does
  // not support).  Header-based verification is kept as a fallback so that
  // direct test calls (e.g. from curl / Postman) can still pass a secret.
  const providedSecret =
    (req.query?.secret as string | undefined) ||
    (req.headers["x-mpesa-webhook-secret"] as string | undefined);

  if (expectedSecret && providedSecret !== expectedSecret) {
    logger.warn("[Mpesa] Callback rejected: invalid webhook secret");
    res.status(401).json({ ResultCode: 1, ResultDesc: "Unauthorized" });
    return;
  }

  try {
    const body = req.body as Record<string, unknown>;
    // Log only non-PII identifiers — never log the full body (contains phone, amount, receipt)
    const stkCallback = (body?.Body as Record<string, unknown> | undefined)
      ?.stkCallback as Record<string, unknown> | undefined;
    logger.info(
      `[Mpesa] Callback received — CheckoutRequestID: ${stkCallback?.CheckoutRequestID ?? "unknown"}, ResultCode: ${stkCallback?.ResultCode ?? "unknown"}`,
    );

    const paymentService = req.scope.resolve<IPaymentModuleService>(
      Modules.PAYMENT,
    );

    // Delegate to the Payment Module's webhook handler.
    // Internally this calls getWebhookActionAndData on the mpesa provider and
    // synchronously updates the payment session status (authorized / failed).
    await paymentService.getWebhookActionAndData({
      provider: "pp_mpesa_mpesa",
      payload: {
        data: body,
        rawData: JSON.stringify(body),
        headers: req.headers as Record<string, string>,
      },
    });

    // Persist result_code, result_desc, and (on success) the M-Pesa receipt
    // number into the payment session data.
    //
    // Storing result_code lets authorizePayment short-circuit without an extra
    // Daraja STK query on every order placement.  Storing mpesa_receipt_number
    // lets refundPayment issue a B2B reversal later.
    //
    // This block runs AFTER getWebhookActionAndData because that call updates
    // the session status (authorized / failed) first.
    const resultCode = String(stkCallback?.ResultCode ?? "");
    const resultDesc = String(stkCallback?.ResultDesc ?? "");
    const checkoutRequestId = stkCallback?.CheckoutRequestID as
      | string
      | undefined;

    if (checkoutRequestId) {
      const metadata = (
        stkCallback?.CallbackMetadata as Record<string, unknown> | undefined
      )?.Item as Array<{ Name: string; Value: unknown }> | undefined;

      const getMetaValue = (name: string): unknown =>
        metadata?.find((item) => item.Name === name)?.Value;

      const mpesaReceiptNumber =
        resultCode === "0"
          ? (getMetaValue("MpesaReceiptNumber") as string | undefined)
          : undefined;
      const transactionDate =
        resultCode === "0" ? getMetaValue("TransactionDate") : undefined;

      try {
        const [session] = await paymentService.listPaymentSessions(
          // `data` is not in FilterablePaymentSessionProps typings but the
          // underlying MikroORM-based repository does filter on JSON data
          // fields at runtime.  Cast to `any` to bypass the type gap.
          {
            provider_id: "pp_mpesa_mpesa",
            data: { checkout_request_id: checkoutRequestId },
          } as any,
          { take: 1 },
        );
        if (session) {
          await paymentService.updatePaymentSession({
            id: session.id,
            amount: session.amount,
            currency_code: session.currency_code,
            data: {
              ...(session.data as Record<string, unknown>),
              result_code: resultCode,
              result_desc: resultDesc,
              ...(mpesaReceiptNumber && {
                mpesa_receipt_number: mpesaReceiptNumber,
                transaction_date: String(transactionDate ?? ""),
              }),
            },
          });
        } else {
          logger.warn(
            `[Mpesa] Session not found for CheckoutRequestID: ${checkoutRequestId} — callback data not stored`,
          );
        }
      } catch (updateErr) {
        logger.error(
          `[Mpesa] Failed to persist callback data: ${(updateErr as Error).message}`,
        );
      }
    }

    // Safaricom expects a 200 with this acknowledgement
    res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  } catch (err) {
    logger.error(
      `[Mpesa] Callback processing error: ${(err as Error).message}`,
    );
    // Still return 200 to prevent Daraja from retrying
    res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  }
};
