# Changelog

All notable changes to `medusa-payment-mpesa` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-07-01

### Added
- Initial release as a standalone Medusa v2 plugin
- `AbstractPaymentProvider` implementation (`MpesaPaymentProviderService`)
- Daraja STK Push via `initiatePayment`
- STK Push status polling via `authorizePayment` and `getPaymentStatus`
- M-Pesa reversal (refund) support via `refundPayment`
- Phone number normalization: accepts `07XX`, `+254XX`, `254XX`, `7XX` formats
- Terminal failure code detection: `1032`, `1037`, `2001`, `1019`, `9999`
- Webhook handler via `getWebhookActionAndData` for Daraja STK callbacks
- Built-in API routes: `/store/mpesa/callback`, `/store/mpesa/status/:id`, `/store/mpesa/reversal-result`, `/store/mpesa/reversal-timeout`
- RSA PKCS1v15 security credential encryption for production reversals
- `sandbox` and `production` environment support
- Full TypeScript types exported (`MpesaOptions`)
