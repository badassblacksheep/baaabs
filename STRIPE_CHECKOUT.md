# Patch checkout

Live payment link: https://buy.stripe.com/eVqbJ1bkE8Fm0Tt8NNcQU00

Both storefronts sell the BAAABS patch for $20 USD with US shipping included through Mad Dragon Fire LLC. Dispatch is within 3–5 business days; delivery time is additional. All sales are final. Order questions: maddragonfire@gmail.com.

## Integration

Stripe's native buy button is embedded on `baaabs.org/patch.html` and `maddragonfire.com/patch/`. The shared public configuration and renderer live in `site/assets/patch-config.js` and `site/assets/patch.js` in this repository. Both pages load Stripe's official `https://js.stripe.com/v3/buy-button.js` component.

The component uses buy-button ID `buy_btn_1UYFgkGwhPQmXQjfXd3yT7ws` and a **publishable** Stripe key, which is intentionally public. Secret/restricted keys must never be committed. The supplied payment link also appears as an ordinary HTML link so checkout remains available without JavaScript or when the embedded component is blocked. Update both static links if the payment link changes.

Orders carry `client_reference_id=baaabs_patch` or `mdf_patch` to identify the storefront. These labels are not order IDs or proof of payment. Stripe manages payment confirmation and the hosted confirmation page; neither storefront marks an order paid.

## Checkout settings and checks

The live link is active at $20, quantity one. Required shipping addresses are restricted to the United States; no extra shipping charge is added. Automatic tax is enabled in Stripe. This observation does not verify the business's tax registrations or filing status, which are managed in Stripe Tax.

Run `node --test tests/patch-checkout.test.cjs` for link validation, source attribution and test/live separation. Browser verification covers the button and the hosted checkout. No real payment was charged as part of setup.

For fulfillment, use successful paid transactions and their recorded shipping addresses in Stripe. Do not ship based only on a redirect or pending payment. Manage receipts, successful-payment notifications, refunds, stock limits and tax registrations in the Stripe Dashboard.

References: https://docs.stripe.com/payment-links/buy-button, https://docs.stripe.com/payment-links/url-parameters, https://docs.stripe.com/payment-links/post-payment.
