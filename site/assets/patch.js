(() => {
  const config = window.BAAABS_PATCH;
  const status = document.querySelector('#checkout-status');
  let url;
  try { url = new URL(config?.checkoutUrl); } catch { /* Closed until configured. */ }
  const ready = config?.provider === 'stripe' && config.liveVerified === true &&
    config.priceApproved === true && config.shippingApproved === true &&
    config.returnsApproved === true && config.taxSetupVerified === true &&
    typeof config.legalSeller === 'string' && config.legalSeller.trim() &&
    typeof config.fulfillmentSummary === 'string' && config.fulfillmentSummary.trim() &&
    Number.isFinite(config.priceUsd) && config.priceUsd > 0 &&
    url?.protocol === 'https:' && url.hostname === 'buy.stripe.com' &&
    url.pathname.length > 1 && !url.pathname.startsWith('/test_');
  if (ready) {
    const buy = document.createElement('a');buy.className = 'button';buy.href = url.href;buy.textContent = 'Buy the patch ↗';
    document.querySelector('#checkout-slot').replaceChildren(buy);
    const price = document.querySelector('.price');price.replaceChildren(document.createTextNode(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(config.priceUsd)+' '));
    const note = document.createElement('span');note.textContent='USD · shipping & tax at checkout';price.append(note);
    document.querySelector('#seller-detail').textContent = `Sold by ${config.legalSeller}.`;
    document.querySelector('#shipping-detail').textContent = config.fulfillmentSummary;
    status.textContent = 'Secure checkout through Stripe. No account required.';
  }
  document.querySelector('#share-patch').addEventListener('click', async () => {
    const shareStatus = document.querySelector('#share-status');
    const canonical = document.querySelector('link[rel="canonical"]').href;
    try {
      if (navigator.share) await navigator.share({title:'The BAAABS patch',text:'Wear a little sheep. Help build a big one.',url:canonical});
      else if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(canonical);shareStatus.textContent='Link copied.'; }
      else shareStatus.textContent=canonical;
    } catch (error) { if (error.name !== 'AbortError') shareStatus.textContent=canonical; }
  });
})();
