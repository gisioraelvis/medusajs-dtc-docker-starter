import {
  AbstractPaymentProvider,
  BigNumber,
  MedusaError,
} from "@medusajs/framework/utils";
import { Logger } from "@medusajs/framework/types";
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import { MpesaClient } from "./client";

export type MpesaOptions = {
  consumer_key: string;
  consumer_secret: string;
  business_short_code: string;
  pass_key: string;
  environment: "sandbox" | "production";
  /** Base URL of this Medusa backend, used to build the STK Push callback URL */
  callback_base_url: string;
  initiator_name?: string;
  initiator_password?: string;
  /**
   * Optional shared secret appended as `?secret=<value>` to the Daraja
   * callback URL.  Daraja echoes the full URL back in its POST, so the
   * callback route can verify it.  Set MPESA_WEBHOOK_SECRET in your env.
   */
  webhook_secret?: string;
};

type InjectedDependencies = {
  logger: Logger;
};

/**
 * Stored in PaymentSession.data after initiatePayment
 */
type MpesaSessionData = {
  checkout_request_id: string;
  merchant_request_id: string;
  phone_number: string;
  amount: number;
  /** Populated by callback webhook */
  mpesa_receipt_number?: string;
  /** "0" = success, non-zero = failure */
  result_code?: string;
  result_desc?: string;
  transaction_date?: string;
};

class MpesaPaymentProviderService extends AbstractPaymentProvider<MpesaOptions> {
  static identifier = "mpesa";

  protected logger_: Logger;
  protected options_: MpesaOptions;
  protected client_: MpesaClient;

  constructor(container: InjectedDependencies, options: MpesaOptions) {
    super(container, options);
    this.logger_ = container.logger;
    this.options_ = options;
    this.client_ = new MpesaClient(
      {
        consumer_key: options.consumer_key,
        consumer_secret: options.consumer_secret,
        business_short_code: options.business_short_code,
        pass_key: options.pass_key,
        environment: options.environment,
        initiator_name: options.initiator_name,
        initiator_password: options.initiator_password,
      },
      this.logger_,
    );
  }

  /**
   * Normalizes a Kenyan phone number to the 254XXXXXXXXX format expected by Daraja.
   * Returns null if the number is unrecognizable.
   */
  static normalizePhone(phone: string): string | null {
    const stripped = phone.replace(/\D/g, ""); // remove all non-digits
    if (/^254[0-9]{9}$/.test(stripped)) return stripped; // already correct
    if (/^0[0-9]{9}$/.test(stripped)) return "254" + stripped.slice(1); // 07XX → 254XX
    if (/^7[0-9]{8}$/.test(stripped)) return "254" + stripped; // 7XX → 2547XX (no leading 0)
    if (/^01[0-9]{8}$/.test(stripped)) return "254" + stripped.slice(1); // 011X → 25411X
    return null;
  }

  static validateOptions(options: Record<string, unknown>): void {
    const required = [
      "consumer_key",
      "consumer_secret",
      "business_short_code",
      "pass_key",
      "callback_base_url",
    ];
    for (const key of required) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `[MpesaPaymentProvider] Missing required option: ${key}`,
        );
      }
    }
    const env = options.environment as string | undefined;
    if (env && !["sandbox", "production"].includes(env)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `[MpesaPaymentProvider] environment must be "sandbox" or "production"`,
      );
    }
  }

  /**
   * Called when a customer selects M-Pesa at checkout.
   * Reads `phone_number` from extra context, then fires STK Push.
   */
  async initiatePayment(
    input: InitiatePaymentInput,
  ): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context } = input;

    // phone_number should be passed via input.data from the storefront
    // e.g.: sdk.store.payment.initiatePaymentSession(cart, { provider_id: "pp_mpesa_mpesa", data: { phone_number: "254712345678" } })
    const rawPhone =
      (input.data?.phone_number as string | undefined) ??
      context?.customer?.phone ??
      undefined;

    if (!rawPhone) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "phone_number is required in payment data to initiate M-Pesa STK Push",
      );
    }

    const phoneNumber = MpesaPaymentProviderService.normalizePhone(rawPhone);
    if (!phoneNumber) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid phone number "${rawPhone}". Expected format: 254XXXXXXXXX, 07XXXXXXXXX, or +254XXXXXXXXX`,
      );
    }

    const amountNumber = Number(amount);
    const baseCallbackUrl = `${this.options_.callback_base_url}/store/mpesa/callback`;
    const callbackUrl = this.options_.webhook_secret
      ? `${baseCallbackUrl}?secret=${encodeURIComponent(this.options_.webhook_secret)}`
      : baseCallbackUrl;
    const accountRef =
      (input.data?.order_id as string | undefined) || "MedusaOrder";

    this.logger_.info(
      `[Mpesa] Initiating STK Push for ${phoneNumber.slice(0, 6)}******, amount=${amountNumber} ${currency_code}`,
    );

    try {
      const result = await this.client_.stkPush({
        amount: amountNumber,
        phone_number: phoneNumber,
        callback_url: callbackUrl,
        account_reference: accountRef.slice(0, 12),
        transaction_desc: "Payment",
      });

      const sessionData: MpesaSessionData = {
        checkout_request_id: result.CheckoutRequestID,
        merchant_request_id: result.MerchantRequestID,
        phone_number: phoneNumber,
        amount: amountNumber,
      };

      return {
        id: result.CheckoutRequestID,
        data: sessionData as unknown as Record<string, unknown>,
      };
    } catch (err) {
      this.logger_.error(
        `[Mpesa] initiatePayment error: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Called when the customer completes checkout.
   * Queries Daraja to verify the STK Push was paid.
   */
  async authorizePayment(
    input: AuthorizePaymentInput,
  ): Promise<AuthorizePaymentOutput> {
    const data = input.data as unknown as MpesaSessionData;

    // If the callback already populated result_code, use it
    if (data?.result_code !== undefined) {
      if (data.result_code === "0") {
        return {
          data: data as unknown as Record<string, unknown>,
          status: "authorized",
        };
      }
      return {
        data: data as unknown as Record<string, unknown>,
        status: "error",
      };
    }

    // Otherwise, poll Daraja for status
    const checkoutRequestId = data?.checkout_request_id;
    if (!checkoutRequestId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "[Mpesa] Missing checkout_request_id in payment session data",
      );
    }

    try {
      const result = await this.client_.stkQuery(checkoutRequestId);
      const updatedData = {
        ...data,
        result_code: result.ResultCode,
        result_desc: result.ResultDesc,
      } as unknown as Record<string, unknown>;

      if (result.ResultCode === "0") {
        return { data: updatedData, status: "authorized" };
      }

      this.logger_.warn(
        `[Mpesa] STK Query result: ${result.ResultCode} - ${result.ResultDesc}`,
      );

      // User explicitly cancelled the STK prompt
      if (result.ResultCode === "1032") {
        return { data: updatedData, status: "canceled" };
      }

      // Terminal failure codes that will never succeed on retry
      const terminalCodes = [
        "1037", // Timeout waiting for customer input
        "2001", // Wrong PIN entered
        "1019", // Transaction expired
        "9999", // Internal switch error
      ];

      if (terminalCodes.includes(result.ResultCode)) {
        return { data: updatedData, status: "error" };
      }

      return { data: updatedData, status: "pending" };
    } catch (err) {
      this.logger_.error(
        `[Mpesa] authorizePayment error: ${(err as Error).message}`,
      );
      return {
        data: data as unknown as Record<string, unknown>,
        status: "pending",
      };
    }
  }

  /**
   * M-Pesa payments are instant — once authorized, capture is a no-op.
   */
  async capturePayment(
    input: CapturePaymentInput,
  ): Promise<CapturePaymentOutput> {
    return { data: input.data };
  }

  /**
   * Cancel: STK Push cannot be cancelled after initiation.
   * We record the cancellation locally.
   */
  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: { ...(input.data ?? {}), cancelled: true } };
  }

  /**
   * Refund via M-Pesa reversal (requires initiator credentials).
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = input.data as unknown as MpesaSessionData;
    const transactionId = data?.mpesa_receipt_number;

    if (!transactionId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "[Mpesa] Cannot refund: mpesa_receipt_number not found in payment data. Ensure the payment was completed.",
      );
    }

    const resultUrl = `${this.options_.callback_base_url}/store/mpesa/reversal-result`;
    const timeoutUrl = `${this.options_.callback_base_url}/store/mpesa/reversal-timeout`;

    try {
      const result = await this.client_.reversal({
        transaction_id: transactionId,
        amount: Number(input.amount),
        result_url: resultUrl,
        queue_timeout_url: timeoutUrl,
        remarks: "Medusa refund",
      });

      return {
        data: {
          ...data,
          reversal_conversation_id: result.ConversationID,
        } as unknown as Record<string, unknown>,
      };
    } catch (err) {
      this.logger_.error(
        `[Mpesa] refundPayment error: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data };
  }

  async retrievePayment(
    input: RetrievePaymentInput,
  ): Promise<RetrievePaymentOutput> {
    return { data: input.data };
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput,
  ): Promise<GetPaymentStatusOutput> {
    const data = input.data as unknown as MpesaSessionData;

    if (!data?.checkout_request_id) {
      return { status: "pending" };
    }

    // If callback already resolved it
    if (data.result_code !== undefined) {
      if (data.result_code === "0") {
        return { status: "authorized" };
      }
      return { status: "error" };
    }

    try {
      const result = await this.client_.stkQuery(data.checkout_request_id);
      if (result.ResultCode === "0") return { status: "authorized" };
      if (result.ResultCode === "1032") return { status: "canceled" }; // User cancelled

      // Terminal error codes — consistent with authorizePayment
      const terminalCodes = ["1037", "2001", "1019", "9999"];
      if (terminalCodes.includes(result.ResultCode)) return { status: "error" };

      return { status: "pending" };
    } catch {
      return { status: "pending" };
    }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // M-Pesa STK Push sessions cannot be updated after initiation.
    // The storefront should cancel and re-initiate if the amount changes.
    return { data: input.data ?? {} };
  }

  /**
   * Handle M-Pesa STK Push callback from Daraja.
   * Daraja POSTs to /store/mpesa/callback with ResultCode and receipt info.
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    const body = payload.data as Record<string, unknown>;

    try {
      // STK Push callback structure:
      // { Body: { stkCallback: { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } } }
      const stkCallback = (body?.Body as Record<string, unknown> | undefined)
        ?.stkCallback as Record<string, unknown> | undefined;

      if (!stkCallback) {
        this.logger_.warn("[Mpesa] Webhook: missing stkCallback in payload");
        return { action: "not_supported" };
      }

      const checkoutRequestId = stkCallback.CheckoutRequestID as string;
      const resultCode = String(stkCallback.ResultCode ?? "");

      if (resultCode !== "0") {
        this.logger_.warn(
          `[Mpesa] STK callback failure: ${resultCode} - ${stkCallback.ResultDesc}`,
        );
        return {
          action: "failed",
          data: {
            session_id: checkoutRequestId,
            amount: new BigNumber(0),
          },
        };
      }

      // Extract metadata items
      const metadata = (
        stkCallback.CallbackMetadata as Record<string, unknown> | undefined
      )?.Item as Array<{ Name: string; Value: unknown }> | undefined;

      const getMetaValue = (name: string): unknown =>
        metadata?.find((item) => item.Name === name)?.Value;

      const amount = Number(getMetaValue("Amount") ?? 0);

      // The M-Pesa receipt number, transaction date, and phone are persisted
      // by the callback route (route.ts) after this call resolves, because
      // WebhookActionResult only accepts session_id and amount.
      return {
        action: "authorized",
        data: {
          session_id: checkoutRequestId,
          amount: new BigNumber(amount),
        },
      };
    } catch (err) {
      this.logger_.error(
        `[Mpesa] getWebhookActionAndData error: ${(err as Error).message}`,
      );
      return { action: "not_supported" };
    }
  }
}

export default MpesaPaymentProviderService;
