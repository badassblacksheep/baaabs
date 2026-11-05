# BAAABS Stripe → Fulfillment Ledger integration

Worker deployed at `https://baaabs-stripe-fulfillment.maddragonfire.workers.dev/stripe/webhook`. Verify Stripe delivery and the ledger before retiring Gmail monitoring. The live BAAABS ledger is:
https://docs.google.com/spreadsheets/d/1WTzo6wRm4YWE5p0yUoUo3GgoDcI8kljbQF684JBVIFA/edit

## Invariants

- Stripe is authoritative for payment status and paid quantity.
- The owner's explicit mailing confirmation is authoritative for fulfillment.
- Never infer a shipment from a successful payment.
- Never treat a webhook alone as proof of delivery.
- Preserve the two manually confirmed shipments (Thilo: 1; Ashley: 5) as unmatched until linked to Stripe.
- Idempotency key: Stripe Checkout Session ID; additionally persist event IDs for auditing.
- Reconciliation must retrieve paid Checkout Sessions from Stripe and identify missed events.

## Recommended implementation

Deploy a Cloudflare Worker (or equivalent server-side endpoint) under a dedicated endpoint. The static GitHub Pages site must never hold Stripe or Google credentials.

1. Receive Stripe `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
2. Verify the `Stripe-Signature` header against the exact raw request body using the endpoint signing secret and enforce timestamp tolerance.
3. Require `payment_status === "paid"`; optionally fetch the Checkout Session and line items using a restricted server-side Stripe key to determine actual patch quantities. Do not assume quantity 1 for multi-item purchases.
4. Extract customer/shipping information from Checkout Session fields, respecting which fields are present. Avoid exposing private shipping addresses in logs.
5. Upsert the matching row in the BAAABS Google Sheet by Checkout Session ID, never blindly append on retries.
6. Preserve existing `Mailed` statuses and owner-confirmed fulfillment dates during payment reconciliation.
7. On success return HTTP 2xx. On transient Google Sheets errors return non-2xx so Stripe retries.
8. Notify the owner only for newly paid, deduplicated orders. Avoid duplicate notifications.
9. Run periodic reconciliation against Stripe to catch missed webhook deliveries and refund/chargeback updates.

## Credentials / deployment prerequisites

- Cloudflare Worker deployment access (or another server runtime).
- Stripe webhook endpoint registration and its `whsec_...` signing secret.
- Restricted Stripe API key scoped to Checkout Sessions / line items (and relevant payment/refund reads for reconciliation).
- A Google service account with edit access to the ledger, or a securely authorized Google OAuth connection.
- Store all secrets in the runtime's secret manager, not in this repository, commits, or chat.

## Worker configuration

Deploy from this directory using Wrangler. Set the encrypted Worker secrets
`GOOGLE_SERVICE_ACCOUNT_JSON`, `STRIPE_RESTRICTED_KEY` (Checkout Sessions Read),
and `STRIPE_WEBHOOK_SECRET`. The Worker rejects deliveries until all are configured.

The Worker checks the headers and existing Checkout Session IDs, then adds a unique
named range for the session and appends its row in one atomic Sheets request. Keep
the `baaabs_` named ranges. Further events leave owner-edited rows intact. Missing
addresses are flagged in Notes. Only quantities for the configured patch price count.

For sandbox verification use a separate Worker, sandbox payment link and price,
signing secret, restricted test key, and a test ledger with matching headers.
Set `STRIPE_MODE=test`, `LEDGER_ID`, `ORDERS_SHEET_ID`, `PATCH_LINK_ID`, and
`PATCH_PRICE_ID` for that deployment. Test mode rejects the production ledger.
Run `node --test tests/stripe-fulfillment.test.mjs` from the repository root.
Gmail handles notifications. Scheduled reconciliation and refund review are
separate cutover tasks.

## Ledger schema

`Orders & Fulfillment`: Order ID | Customer | Quantity | Amount USD | Payment Status | Fulfillment Status | Date Mailed | Carrier | Tracking | Shipping Address | Stripe Payment ID | Source | Notes

`Operating Rules` documents the source-of-truth policy.

## Cutover checklist

- [ ] Configure secure runtime and Google Sheets credentials.
- [ ] Implement/test webhook signature verification, paid-only processing and idempotent upsert.
- [ ] Test duplicate, out-of-order and delayed payment events.
- [ ] Test quantity > 1, missing shipping details, failed payments and refunds.
- [ ] Verify one real/test Stripe payment creates exactly one ledger row.
- [ ] Verify mailing confirmation updates fulfillment only.
- [ ] Enable notification and reconciliation.
- [ ] Retire Gmail polling only after production webhook delivery is verified.
