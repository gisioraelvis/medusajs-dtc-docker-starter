"use client"

import { isMpesa, isManual, isStripeLike } from "@lib/constants"
import { placeOrder } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { Button } from "@modules/common/components/ui"
import { useElements, useStripe } from "@stripe/react-stripe-js"
import React, { useState } from "react"
import ErrorMessage from "../error-message"

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  "data-testid": string
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  "data-testid": dataTestId,
}) => {
  const notReady =
    !cart ||
    !cart.shipping_address ||
    !cart.billing_address ||
    !cart.email ||
    (cart.shipping_methods?.length ?? 0) < 1

  const paymentSession = cart.payment_collection?.payment_sessions?.[0]

  switch (true) {
    case isStripeLike(paymentSession?.provider_id):
      return (
        <StripePaymentButton
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
        />
      )
    case isManual(paymentSession?.provider_id):
      return (
        <ManualTestPaymentButton notReady={notReady} data-testid={dataTestId} />
      )
    case isMpesa(paymentSession?.provider_id):
      return (
        <MpesaPaymentButton
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
        />
      )
    default:
      return <Button disabled>Select a payment method</Button>
  }
}

const StripePaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    await placeOrder()
      .catch((err) => {
        setErrorMessage(err.message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  const stripe = useStripe()
  const elements = useElements()
  const card = elements?.getElement("card")

  const session = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )

  const disabled = !stripe || !elements ? true : false

  const handlePayment = async () => {
    setSubmitting(true)

    if (!stripe || !elements || !card || !cart) {
      setSubmitting(false)
      return
    }

    await stripe
      .confirmCardPayment(session?.data.client_secret as string, {
        payment_method: {
          card: card,
          billing_details: {
            name:
              cart.billing_address?.first_name +
              " " +
              cart.billing_address?.last_name,
            address: {
              city: cart.billing_address?.city ?? undefined,
              country: cart.billing_address?.country_code ?? undefined,
              line1: cart.billing_address?.address_1 ?? undefined,
              line2: cart.billing_address?.address_2 ?? undefined,
              postal_code: cart.billing_address?.postal_code ?? undefined,
              state: cart.billing_address?.province ?? undefined,
            },
            email: cart.email,
            phone: cart.billing_address?.phone ?? undefined,
          },
        },
      })
      .then(({ error, paymentIntent }) => {
        if (error) {
          const pi = error.payment_intent

          if (
            (pi && pi.status === "requires_capture") ||
            (pi && pi.status === "succeeded")
          ) {
            onPaymentCompleted()
          }

          setErrorMessage(error.message || null)
          return
        }

        if (
          (paymentIntent && paymentIntent.status === "requires_capture") ||
          paymentIntent.status === "succeeded"
        ) {
          return onPaymentCompleted()
        }

        return
      })
  }

  return (
    <>
      <Button
        disabled={disabled || notReady}
        onClick={handlePayment}
        size="large"
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="stripe-payment-error-message"
      />
    </>
  )
}

const ManualTestPaymentButton = ({ notReady }: { notReady: boolean }) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    await placeOrder()
      .catch((err) => {
        setErrorMessage(err.message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  const handlePayment = () => {
    setSubmitting(true)

    onPaymentCompleted()
  }

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid="submit-order-button"
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="manual-payment-error-message"
      />
    </>
  )
}

export default PaymentButton

const MpesaPaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pollLabel, setPollLabel] = useState<string | null>(null)

  const session = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )
  const checkoutRequestId = (session?.data as Record<string, unknown>)
    ?.checkout_request_id as string | undefined

  const handlePayment = async () => {
    setSubmitting(true)
    setErrorMessage(null)
    setPollLabel(null)

    const backendUrl =
      process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

    if (checkoutRequestId) {
      // Poll every 3 s for up to 90 s, giving the customer real-time feedback
      // while they interact with the STK Push prompt on their phone.
      const MAX_ATTEMPTS = 30
      const INTERVAL_MS = 3000
      let finalStatus: string | null = null

      setPollLabel("Waiting for M-Pesa payment…")

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
        try {
          const resp = await fetch(
            `${backendUrl}/store/mpesa/status/${encodeURIComponent(
              checkoutRequestId
            )}`
          )
          const result: {
            status: "paid" | "pending" | "cancelled" | "error"
            result_desc: string | null
          } = await resp.json()

          if (result.status === "paid") {
            finalStatus = "paid"
            break
          }
          if (result.status === "cancelled" || result.status === "error") {
            setPollLabel(null)
            setErrorMessage(
              result.result_desc ||
                "Payment was cancelled or failed. Please go back and try again."
            )
            setSubmitting(false)
            return
          }
          // "pending" → update label with elapsed time and keep polling
          const elapsed = ((i + 1) * INTERVAL_MS) / 1000
          setPollLabel(
            `Waiting for M-Pesa payment… (${elapsed}s / ${
              MAX_ATTEMPTS * (INTERVAL_MS / 1000)
            }s)`
          )
        } catch {
          // Network hiccup — keep polling, don't abort
        }
      }

      setPollLabel(null)

      if (!finalStatus) {
        // Timed out — let authorizePayment do a final STK query on placeOrder
        // rather than blocking the customer entirely.
      }
    }

    await placeOrder()
      .catch((err) => {
        setErrorMessage(
          err.message ||
            "Payment could not be confirmed. Please check your phone and try again."
        )
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid={dataTestId ?? "mpesa-payment-button"}
      >
        {pollLabel ?? "Place order"}
      </Button>
      {errorMessage && (
        <ErrorMessage
          error={errorMessage}
          data-testid="mpesa-payment-error-message"
        />
      )}
    </>
  )
}
