// BAAABS paid Checkout Session → Google Sheets fulfillment ledger.
// Deploy as a Cloudflare Worker with secrets documented in README.
// Never expose credentials in GitHub Pages.
const LEDGER = "1WTzo6wRm4YWE5p0yUoUo3GgoDcI8kljbQF684JBVIFA";
const TAB = "Orders & Fulfillment";
const HEADERS = ["Order ID", "Customer", "Quantity", "Amount USD", "Payment Status",
  "Fulfillment Status", "Date Mailed", "Carrier", "Tracking", "Shipping Address",
  "Stripe Payment ID", "Source", "Notes"];
const encoder = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
async function hmac(secret,data) {
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(data)))].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function safeEqual(a,b) {
  if(a.length!==b.length)return false;
  let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;
}
async function verify(raw,header,secret) {
  const t=/\bt=(\d+)/.exec(header||"")?.[1], signatures=[...(header||"").matchAll(/\bv1=([a-f0-9]+)/g)].map(x=>x[1]);
  if(!t||!signatures.length||Math.abs(Date.now()/1000-Number(t))>300)return false;
  const digest=await hmac(secret,t+"."+raw);
  return signatures.some(s=>safeEqual(s,digest));
}
async function stripe(path,key) {
  const r=await fetch("https://api.stripe.com/v1/"+path,{headers:{authorization:"Bearer "+key}});
  if(!r.ok)throw new Error("Stripe read failed: "+r.status);
  return r.json();
}
async function googleToken(env) {
  const account=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now=Math.floor(Date.now()/1000);
  const header=b64url(encoder.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
  const claims=b64url(encoder.encode(JSON.stringify({iss:account.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})));
  const pem=account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  const bytes=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey("pkcs8",bytes,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature=b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(header+"."+claims)));
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:header+"."+claims+"."+signature})});
  if(!r.ok)throw new Error("Google token failed: "+r.status);
  return (await r.json()).access_token;
}
async function googleReadOrWrite(url, token, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {authorization: "Bearer " + token, "content-type": "application/json"},
    body: body && JSON.stringify(body)
  });
  if (!response.ok) throw new Error("Sheets request failed: " + response.status);
  return response.json();
}

async function sync(session, env) {
  const path = "checkout/sessions/" + encodeURIComponent(session.id) + "/line_items?limit=100";
  const items = await stripe(path, env.STRIPE_RESTRICTED_KEY);
  if (items.has_more) throw new Error("Line items require review");
  const patches = items.data.filter(item => item.price?.id === env.PATCH_PRICE_ID);
  if (!patches.length || patches.some(item => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
    throw new Error("Patch quantity requires review");
  }
  const quantity = patches.reduce((total, item) => total + item.quantity, 0);
  if (session.currency !== "usd" || !Number.isSafeInteger(session.amount_total) || session.amount_total < 0) {
    throw new Error("Amount requires review");
  }
  const shipping = session.collected_information?.shipping_details ?? session.shipping_details;
  const address = shipping?.address;
  const formatted = address ? [address.line1, address.line2, address.city, address.state,
    address.postal_code, address.country].filter(Boolean).join(", ") : "";
  const row = [session.id, shipping?.name || session.customer_details?.name || "", quantity,
    session.amount_total / 100, "Paid", "Awaiting fulfillment", "", "", "", formatted,
    session.payment_intent || "", "Stripe API", formatted ? "" : "Shipping address missing; review before mailing."];

  const token = await googleToken(env);
  const base = "https://sheets.googleapis.com/v4/spreadsheets/" + env.LEDGER_ID;
  const prefix = "'" + TAB + "'!";
  const query = new URLSearchParams();
  for (const range of ["A1:M1", "A2:A"]) query.append("ranges", prefix + range);
  const lookup = await googleReadOrWrite(base + "/values:batchGet?" + query, token);
  const [header, orders] = lookup.valueRanges;
  if (JSON.stringify(header.values?.[0]) !== JSON.stringify(HEADERS)) throw new Error("Ledger schema mismatch");
  if (orders.values?.some(([id]) => id === session.id)) return "already recorded";

  // Commit a unique session marker and append together. Even an ambiguous timeout
  // followed by a retry cannot commit a second append. The marker covers the header
  // so sorting orders or inserting rows does not affect its identity.
  const sheetId = Number(env.ORDERS_SHEET_ID);
  const marker = "baaabs_" + Array.from(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", encoder.encode(session.id))), b => b.toString(16).padStart(2, "0")).join("");
  const values = row.map(value => ({userEnteredValue: typeof value === "number"
    ? {numberValue: value} : {stringValue: value}}));
  await googleReadOrWrite(base + ":batchUpdate", token, {requests: [
    {addNamedRange: {namedRange: {name: marker, namedRangeId: marker,
      range: {sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1}}}},
    {appendCells: {sheetId, rows: [{values}], fields: "userEnteredValue"}}
  ]});
  return "created";
}

function configured(env) {
  const live = env.STRIPE_MODE === "live";
  return (live || env.STRIPE_MODE === "test") &&
    (live ? env.LEDGER_ID === LEDGER : env.LEDGER_ID && env.LEDGER_ID !== LEDGER) &&
    env.PATCH_LINK_ID && env.PATCH_PRICE_ID && /^\d+$/.test(env.ORDERS_SHEET_ID) &&
    env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") && env.GOOGLE_SERVICE_ACCOUNT_JSON &&
    env.STRIPE_RESTRICTED_KEY?.startsWith(live ? "rk_live_" : "rk_test_") && env.ORDER_COORDINATOR;
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/stripe/webhook") {
      return json({error: "not found"}, 404);
    }
    if (!configured(env)) return json({error: "not configured"}, 503);
    const signature = request.headers.get("stripe-signature");
    if (!signature) return json({error: "invalid signature"}, 400);
    const raw = await request.text();
    if (!await verify(raw, signature, env.STRIPE_WEBHOOK_SECRET)) return json({error: "invalid signature"}, 400);
    let event;
    try { event = JSON.parse(raw); } catch { return json({error: "invalid JSON"}, 400); }
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event?.type)) {
      return json({ok: true, ignored: true});
    }
    const session = event.data?.object;
    if (!event.id || !session?.id || session.object !== "checkout.session") return json({error: "invalid event"}, 400);
    if (event.livemode !== (env.STRIPE_MODE === "live") || session.livemode !== event.livemode ||
        session.payment_status !== "paid" || session.payment_link !== env.PATCH_LINK_ID) return json({ok: true, ignored: true});
    const id = env.ORDER_COORDINATOR.idFromName("baaabs-patch-orders");
    return env.ORDER_COORDINATOR.get(id).fetch("https://internal/order", {
      method: "POST", body: JSON.stringify({id: event.id, session})
    });
  }
};

export class OrderCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    const {id, session} = await request.json();
    try {
      const result = await this.state.blockConcurrencyWhile(async () => {
        const key = "event:" + id;
        if (await this.state.storage.get(key)) return "duplicate";
        const outcome = await sync(session, this.env);
        await this.state.storage.put(key, {processedAt: Date.now(), outcome});
        return outcome;
      });
      return json({ok: true, result});
    } catch {
      // Upstream error bodies, credentials and customer data must stay out of logs.
      return json({error: "retry later"}, 503);
    }
  }
}
