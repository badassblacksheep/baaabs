# Patch checkout

Both storefronts use Stripe Payment Links under Mad Dragon Fire LLC. No server or API key is needed in either GitHub Pages site.

The agreed offer is $20 USD per embroidered iron-on patch with US shipping included. Dispatch is within 3–5 business days; delivery time is additional. All sales are final. Order problems go to maddragonfire@gmail.com. Taxes, if applicable, are added by Stripe. Product sales support the privately owned BAAABS project.

## Shared configuration

`site/assets/patch-config.js` is the public source for both `baaabs.org/patch.html` and `maddragonfire.com/patch/`. The latter loads the configuration and renderer from baaabs.org. A configuration load failure leaves checkout closed. Photos are also shared from baaabs.org and retain their original aspect ratios.

A checkout link includes `client_reference_id=baaabs_patch` or `mdf_patch` to identify its storefront. These are attribution labels, not order IDs or authorization tokens. Stripe owns payment confirmation. Neither page trusts URL parameters as proof of payment.

## Complete Stripe setup

1. Complete the live account activation in the Stripe Dashboard, including business verification, payout details and any required agreements.
2. Create a one-time BAAABS embroidered patch product at $20 USD. Use the real product photograph. Set the appropriate product tax code and exclusive tax behavior.
3. Verify the business's applicable tax registrations in Stripe Tax and enable automatic tax on the link. Do not infer registrations from the business address or enable collection for unverified registrations.
4. Create a Payment Link collecting email and a required US shipping address, with shipping included. Confirm the fulfillment/dispatch commitment and returns policy before enabling live checkout.
5. Choose a quantity and inventory policy before launch. A Payment Link payment-count limit counts completed checkouts, not units; adjustable quantities need separate inventory accounting. Reuse the same link on both sites so limits are shared.
6. Keep Stripe's hosted confirmation page. Configure customer receipts and seller successful-payment notifications in the Dashboard. Fulfill only confirmed successful payments, using the shipping address recorded in Stripe. Refunds are managed in Stripe.
7. Create an equivalent sandbox link and save it in `testCheckoutUrl`. Open either patch page with `?checkout=test` for an explicitly labeled sandbox checkout; ordinary visitors never receive that link. Verify successful and declined test payments and US-only shipping; check tax using the configured test registrations.
8. Save the verified live Payment Link in `checkoutUrl`, update the fulfillment text, and set `liveVerified`, `returnsApproved`, and `taxSetupVerified` to true only after those checks are complete. Deploy the BAAABS configuration once; both storefronts then use it.

Current state: offer, fulfillment terms and storefront integration are prepared; activation, payment links, tax configuration and payment-flow testing remain unfinished. Do not interpret the unit tests as a completed Stripe payment test.

## Checks

Run `node --test tests/patch-checkout.test.cjs`. The tests verify correct storefront attribution, closed checkout with missing configuration, separation of live and test modes, and rejection of non-Stripe or malformed checkout URLs.

References: https://docs.stripe.com/payment-links, https://docs.stripe.com/payment-links/customize, https://docs.stripe.com/payment-links/url-parameters, https://docs.stripe.com/payment-links/post-payment.
