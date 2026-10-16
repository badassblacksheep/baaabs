# BAAABS contributions

The contribution section is at `/#contribute`. It offers one-time USD choices
of $25, $50, $100, $250, and a custom amount entered at hosted checkout.
It deliberately starts unavailable: no provider account or real checkout URLs
were supplied. There are no card fields, payment API keys, payment requests,
success claims, or fundraising totals on this site.

## Connect Stripe Payment Links

1. In the owner's Stripe account, confirm that the account is eligible and
   activated for contributions to this privately owned project.
2. Create four one-time USD Payment Links for $25, $50, $100 and $250, with
   quantity fixed at one and no optional items or recurring prices.
3. Create a fifth Payment Link using **Customers choose what to pay**. Visitors
   enter their custom amount on Stripe. Do not append an invented `amount`
   parameter to a Payment Link; the website does not set Stripe prices.
4. Identify BAAABS clearly on each checkout. Include the private ownership and
   non-tax-deductibility disclosure in the product description. Confirm the
   account's public support information and any applicable refund policy with
   the owner before opening contributions; this site invents no refund policy.
5. Check each live link's recipient, currency, one-time mode, amount and quantity
   directly on hosted checkout. Check the custom amount's permitted range.
6. Put the five verified public URLs in `site/contributions-config.js`.
   Only HTTPS `buy.stripe.com` and `donate.stripe.com` links are accepted.
   Missing, test, malformed, or other destinations leave that option unavailable.
   If using another provider or Stripe custom domain, review it and update the
   allowlist deliberately; do not relax the HTTPS requirement.
7. Test every option on desktop and mobile, keyboard selection, and returning
   from checkout without paying. Separately verify payment completion in the
   provider's test environment. A live charge requires the owner's authorization.

The site's URL validation is not payment verification. An active checkout link
does not prove a completed payment. Use Stripe's payment records for receipts
and confirmation; never infer payment from a redirect or query parameter.

## Updating transparency information

The use-of-funds text describes planned categories consistent with the existing
build plan. There are no invented budgets, allocation percentages, amounts raised,
nonprofit status, or promises of rewards. Update the project status and planned
uses as facts change. Publish totals only from reconciled records, clearly
distinguishing gross contributions, fees, spending and remaining funds.

## References

- [Stripe: Create a payment link](https://docs.stripe.com/payment-links/create)
- [Stripe: Customize checkout](https://docs.stripe.com/payment-links/customize)
- [Stripe: Requirements for accepting tips or donations](https://support.stripe.com/questions/requirements-for-accepting-tips-or-donations)

## Verification status

Provider links are not configured. Payment processing and payment completion
remain unverified until account access or checkout URLs are supplied.
