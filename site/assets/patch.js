(() => {
  // Stripe enforces prices, shipping and taxes. This code never marks an order paid.
  function checkoutLink(config, testMode, source) {
    if (config?.provider !== 'stripe' || config.priceApproved !== true ||
        config.shippingApproved !== true || !Number.isFinite(config.priceUsd) ||
        config.priceUsd <= 0 || typeof config.legalSeller !== 'string' || !config.legalSeller.trim() ||
        typeof config.fulfillmentSummary !== 'string' || !config.fulfillmentSummary.trim()) return null;
    if (!testMode && (config.liveVerified !== true ||
        config.returnsApproved !== true || config.automaticTaxEnabled !== true)) return null;
    let url;
    try { url = new URL(testMode ? config.testCheckoutUrl : config.checkoutUrl); }
    catch { return null; }
    if (url.protocol !== 'https:' || url.hostname !== 'buy.stripe.com' ||
        url.port || url.username || url.password || url.hash ||
        !/^\/(?:test_)?[a-zA-Z0-9]+$/.test(url.pathname) ||
        url.pathname.startsWith('/test_') !== testMode) return null;
    url.search = '';
    url.searchParams.set('client_reference_id', source === 'maddragonfire' ? 'mdf_patch' : 'baaabs_patch');
    return url.href;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { checkoutLink };
  if (typeof document === 'undefined') return;
  const config = window.BAAABS_PATCH;
  const slot = document.querySelector('#checkout-slot');
  const status = document.querySelector('#checkout-status');
  const testMode = new URLSearchParams(window.location.search).get('checkout') === 'test';
  const link = checkoutLink(config, testMode, document.body.dataset.storefront);
  if (Number.isFinite(config?.priceUsd) && config.priceUsd > 0) {
    const price = document.querySelector('.price');
    if (price) {
      price.replaceChildren(document.createTextNode(new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD', maximumFractionDigits: 2,
      }).format(config.priceUsd) + ' '));
      const note = document.createElement('span');
      note.textContent = 'USD · US shipping included';
      price.append(note);
    }
  }
  if (config?.fulfillmentSummary) document.querySelector('#shipping-detail')?.replaceChildren(config.fulfillmentSummary);
  if (testMode && status) {
    status.textContent = link ? 'TEST MODE — no real payment or order. Use a Stripe test card only.' : 'Test checkout is not available yet. No orders are being taken.';
    status.setAttribute('role', 'alert');
  }
  if (link && slot) {
    const buy = document.createElement('a');
    buy.className = document.body.dataset.checkoutClass || 'button';
    buy.href = link;
    buy.textContent = testMode ? 'Try test checkout ↗' : 'Buy the patch ↗';
    buy.referrerPolicy = 'strict-origin-when-cross-origin';
    if (!testMode && /^buy_btn_[a-zA-Z0-9]+$/.test(config.buyButtonId) &&
        /^pk_live_[a-zA-Z0-9]+$/.test(config.publishableKey)) {
      const embedded = document.createElement('stripe-buy-button');
      embedded.setAttribute('buy-button-id', config.buyButtonId);
      embedded.setAttribute('publishable-key', config.publishableKey);
      embedded.setAttribute('client-reference-id', document.body.dataset.storefront === 'maddragonfire' ? 'mdf_patch' : 'baaabs_patch');
      // Keep a normal link available if Stripe's component is blocked or slow.
      const fallback = document.createElement('p');
      fallback.className = 'micro patch-small';
      buy.className = '';
      buy.textContent = 'Open secure checkout ↗';
      fallback.append(buy);
      slot.replaceChildren(embedded, fallback);
    } else slot.replaceChildren(buy);
    if (!testMode && status) status.textContent = 'Secure payment through Stripe. Applicable tax calculated at checkout.';
  }
  document.querySelector('#share-patch')?.addEventListener('click', async () => {
    const shareStatus = document.querySelector('#share-status');
    const canonical = document.querySelector('link[rel="canonical"]').href;
    try {
      if (navigator.share) await navigator.share({ title: 'The BAAABS patch', text: 'Wear a little sheep. Help build a big one.', url: canonical });
      else if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(canonical);
        shareStatus.textContent = 'Link copied.';
      } else shareStatus.textContent = canonical;
    } catch (error) { if (error.name !== 'AbortError') shareStatus.textContent = canonical; }
  });
})();
