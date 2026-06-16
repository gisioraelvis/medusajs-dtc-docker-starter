import axios, { AxiosInstance, AxiosError } from "axios";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/** Minimal logger interface so MpesaClient can log without a hard framework dependency */
interface ClientLogger {
  error(message: string): void;
  warn(message: string): void;
}

export interface MpesaConfig {
  consumer_key: string;
  consumer_secret: string;
  business_short_code: string;
  pass_key: string;
  environment: "sandbox" | "production";
  initiator_name?: string;
  initiator_password?: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: string;
}

export interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface STKQueryResponse {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
}

export interface ReversalResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

export class MpesaClient {
  private config: MpesaConfig;
  private baseUrl: string;
  private httpClient: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private logger?: ClientLogger;

  constructor(config: MpesaConfig, logger?: ClientLogger) {
    this.config = config;
    this.logger = logger;
    this.baseUrl =
      config.environment === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: { "Content-Type": "application/json" },
    });

    this.httpClient.interceptors.request.use(
      async (reqConfig: import("axios").InternalAxiosRequestConfig) => {
        if (!reqConfig.url?.includes("/oauth/")) {
          await this.ensureToken();
          reqConfig.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return reqConfig;
      },
    );
  }

  private generateBasicAuth(): string {
    const credentials = `${this.config.consumer_key}:${this.config.consumer_secret}`;
    return Buffer.from(credentials).toString("base64");
  }

  private generateTimestamp(): string {
    return new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .slice(0, 14);
  }

  private generatePassword(timestamp: string): string {
    const data =
      this.config.business_short_code + this.config.pass_key + timestamp;
    return Buffer.from(data).toString("base64");
  }

  private generateSecurityCredential(): string {
    if (!this.config.initiator_password) {
      throw new Error(
        "initiator_password is required for B2C/reversal operations",
      );
    }

    // Sandbox: Safaricom accepts base64-encoded password
    if (this.config.environment === "sandbox") {
      return Buffer.from(this.config.initiator_password).toString("base64");
    }

    // Production: RSA PKCS#1 v1.5 (RSAES-PKCS1-v1_5) encryption with Safaricom's public certificate.
    // This scheme is mandated by the Daraja API for the SecurityCredential field.
    const certPath = path.join(process.cwd(), "ProductionCertificate.cer");
    if (!fs.existsSync(certPath)) {
      throw new Error(
        `[Mpesa] ProductionCertificate.cer not found at "${certPath}". ` +
          "Download it from https://developer.safaricom.co.ke and place it in the current working directory (process.cwd()) or mount it there in your deployment.",
      );
    }
    const cert = fs.readFileSync(certPath);
    const encrypted = crypto.publicEncrypt(
      { key: cert, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(this.config.initiator_password),
    );
    return encrypted.toString("base64");
  }

  private async ensureToken(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return;
    }
    try {
      const response = await this.httpClient.get<TokenResponse>(
        "/oauth/v1/generate?grant_type=client_credentials",
        {
          headers: {
            Authorization: `Basic ${this.generateBasicAuth()}`,
          },
        },
      );
      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(
        Date.now() + parseInt(response.data.expires_in) * 1000,
      );
    } catch (error) {
      const err = error as AxiosError;
      // Log raw details so network-level failures (ETIMEDOUT, ECONNREFUSED etc.) are visible
      this.logger?.error(
        `[Mpesa] OAuth raw error — code: ${err.code ?? "none"}, ` +
          `status: ${err.response?.status ?? "no response"}, ` +
          `message: ${err.message ?? "empty"}, ` +
          `data: ${JSON.stringify(err.response?.data ?? null)}`,
      );
      this.handleError(err, "generate OAuth token");
    }
  }

  private handleError(error: AxiosError, operation: string): never {
    const responseData = error.response?.data as
      | Record<string, unknown>
      | undefined;

    // Daraja returns errors in two formats:
    // 1. { errorCode, errorMessage } — most API / credential errors
    // 2. { fault: { faultstring, detail: { errorcode } } } — gateway / OAuth token errors
    const faultData = responseData?.fault as
      | Record<string, unknown>
      | undefined;

    // Network-level error code (ETIMEDOUT, ECONNREFUSED, ECONNABORTED, etc.)
    const networkCode = error.code;

    const message =
      (responseData?.errorMessage as string) ||
      (faultData?.faultstring as string) ||
      error.message ||
      (networkCode
        ? `${networkCode}: network error reaching Daraja API`
        : `Mpesa API error during ${operation}`);

    // Include HTTP status and network error code for easy log scanning
    const statusPart = error.response?.status
      ? ` [HTTP ${error.response.status}]`
      : "";
    const codePart = networkCode ? ` [${networkCode}]` : "";

    // Append raw Daraja response so it appears in backend logs
    const detail = responseData
      ? ` — Daraja response: ${JSON.stringify(responseData)}`
      : "";

    throw new Error(
      `[Mpesa] ${operation} failed:${statusPart}${codePart} ${message}${detail}`,
    );
  }

  /**
   * Initiate STK Push (M-Pesa Express) to customer phone
   */
  async stkPush(options: {
    amount: number;
    phone_number: string;
    callback_url: string;
    account_reference: string;
    transaction_desc: string;
  }): Promise<STKPushResponse> {
    const timestamp = this.generateTimestamp();
    const password = this.generatePassword(timestamp);

    try {
      const response = await this.httpClient.post<STKPushResponse>(
        "/mpesa/stkpush/v1/processrequest",
        {
          BusinessShortCode: this.config.business_short_code,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.ceil(options.amount),
          PartyA: options.phone_number,
          PartyB: this.config.business_short_code,
          PhoneNumber: options.phone_number,
          CallBackURL: options.callback_url,
          AccountReference: options.account_reference,
          TransactionDesc: options.transaction_desc,
        },
      );
      return response.data;
    } catch (error) {
      // Re-throw errors already formatted by handleError (e.g. from ensureToken interceptor)
      // to prevent double-wrapping that obscures the original Daraja response.
      if (error instanceof Error && error.message.startsWith("[Mpesa]"))
        throw error;
      return this.handleError(error as AxiosError, "STK push");
    }
  }

  /**
   * Query STK Push transaction status
   */
  async stkQuery(checkoutRequestId: string): Promise<STKQueryResponse> {
    const timestamp = this.generateTimestamp();
    const password = this.generatePassword(timestamp);

    try {
      const response = await this.httpClient.post<STKQueryResponse>(
        "/mpesa/stkpushquery/v1/query",
        {
          BusinessShortCode: this.config.business_short_code,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId,
        },
      );
      return response.data;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("[Mpesa]"))
        throw error;
      return this.handleError(error as AxiosError, "STK query");
    }
  }

  /**
   * Initiate payment reversal (refund equivalent for M-Pesa)
   */
  async reversal(options: {
    transaction_id: string;
    amount: number;
    result_url: string;
    queue_timeout_url: string;
    remarks?: string;
    occasion?: string;
  }): Promise<ReversalResponse> {
    if (!this.config.initiator_name || !this.config.initiator_password) {
      throw new Error(
        "initiator_name and initiator_password are required for reversals",
      );
    }
    const securityCredential = this.generateSecurityCredential();

    try {
      const response = await this.httpClient.post<ReversalResponse>(
        "/mpesa/reversal/v1/request",
        {
          InitiatorName: this.config.initiator_name,
          SecurityCredential: securityCredential,
          CommandID: "TransactionReversal",
          TransactionID: options.transaction_id,
          Amount: Math.ceil(options.amount),
          ReceiverParty: this.config.business_short_code,
          ReceiverIdentifierType: "4",
          ResultURL: options.result_url,
          QueueTimeOutURL: options.queue_timeout_url,
          Remarks: options.remarks || "Refund",
          Occasion: options.occasion || "",
        },
      );
      return response.data;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("[Mpesa]"))
        throw error;
      return this.handleError(error as AxiosError, "reversal");
    }
  }
}
