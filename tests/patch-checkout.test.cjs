const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkoutLink } = require('../site/assets/patch.js');
const ready = { provider: 'stripe', priceUsd: 20, priceApproved: true, shippingApproved: true,
  legalSeller: 'Mad Dragon Fire LLC', fulfillmentSummary: 'US shipping included.',
  liveVerified: true, returnsApproved: true, taxSetupVerified: true,
  checkoutUrl: 'https://buy.stripe.com/abc123', testCheckoutUrl: 'https://buy.stripe.com/test_abc123' };
test('same Stripe checkout attributes orders to either storefront', () => {
  assert.equal(checkoutLink(ready, false, 'baaabs'), ready.checkoutUrl + '?client_reference_id=baaabs_patch');
  assert.equal(checkoutLink(ready, false, 'maddragonfire'), ready.checkoutUrl + '?client_reference_id=mdf_patch');
});
test('missing settings leave checkout unavailable', () => {
  assert.equal(checkoutLink(undefined, false), null);
  for (const key of ['liveVerified','priceApproved','shippingApproved','returnsApproved','taxSetupVerified'])
    assert.equal(checkoutLink({...ready,[key]:false},false),null,key);
  for (const priceUsd of [0,-20,NaN,Infinity,'20']) assert.equal(checkoutLink({...ready,priceUsd},false),null);
});
test('live page cannot send a buyer to a sandbox; test page cannot charge real money', () => {
  assert.equal(checkoutLink({...ready,checkoutUrl:ready.testCheckoutUrl},false),null);
  assert.equal(checkoutLink({...ready,testCheckoutUrl:ready.checkoutUrl},true),null);
  assert.match(checkoutLink({...ready,liveVerified:false,taxSetupVerified:false},true),/^https:\/\/buy.stripe.com\/test_/);
});
test('rejects malformed, credential-bearing and deceptive destinations', () => {
  for (const checkoutUrl of ['', 'javascript:alert(1)', 'http://buy.stripe.com/abc123',
    'https://buy.stripe.com.evil.example/abc123','https://evil.example/abc123',
    'https://user:secret@buy.stripe.com/abc123','https://buy.stripe.com:444/abc123',
    'https://buy.stripe.com/','https://buy.stripe.com/abc/123','https://buy.stripe.com/%74est_abc123',
    'https://buy.stripe.com/abc123#test']) assert.equal(checkoutLink({...ready,checkoutUrl},false),null,checkoutUrl);
});
test('does not forward arbitrary parameters or customer information', () => {
  assert.equal(checkoutLink({...ready,checkoutUrl:ready.checkoutUrl+'?prefilled_email=private@example.com'},false,'unknown'),ready.checkoutUrl+'?client_reference_id=baaabs_patch');
});
