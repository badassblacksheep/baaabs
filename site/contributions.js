(() => {
  const section = document.querySelector('#contribute');
  if (!section) return;

  const checkout = section.querySelector('#contribution-checkout');
  const unavailable = section.querySelector('#contribution-unavailable');
  const status = section.querySelector('#contribution-status');
  const links = window.BAAABS_CONTRIBUTIONS || {};

  // Fail closed for missing, insecure, unexpected or test checkout destinations.
  // URL validation cannot verify a merchant or price: check those before setup.
  function checkoutUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
          !['buy.stripe.com', 'donate.stripe.com'].includes(url.hostname) ||
          !/^\/[a-zA-Z0-9]+$/.test(url.pathname) ||
          url.pathname.startsWith('/test_') || url.search || url.hash) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function updateCheckout() {
    const selected = section.querySelector('input[name="contribution"]:checked');
    const url = checkoutUrl(links[selected?.value]);
    checkout.hidden = !url;
    unavailable.hidden = Boolean(url);
    if (!url) {
      checkout.removeAttribute('href');
      status.textContent = 'Online contributions aren’t open for this amount yet. No payment will be taken here.';
      return;
    }
    checkout.href = url;
    status.textContent = selected.value === 'custom'
      ? 'Choose your one-time USD amount on Stripe’s secure checkout page. Card details are entered only on Stripe.'
      : `Your one-time $${selected.value} USD contribution continues on Stripe’s secure checkout page. Card details are entered only on Stripe.`;
  }

  section.querySelectorAll('input[name="contribution"]').forEach((input) => {
    input.addEventListener('change', updateCheckout);
  });
  updateCheckout();
})();
