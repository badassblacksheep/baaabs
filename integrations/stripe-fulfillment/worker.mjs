// BAAABS paid Checkout Session → Google Sheets fulfillment ledger.
// Deploy as a Cloudflare Worker with secrets documented in README.
// Never expose credentials in GitHub Pages.
const LEDGER = "1WTzo6wRm4YWE5p0yUoUo3GgoDcI8kljbQF684JBVIFA";
const TAB = "Orders & Fulfillment";
const PATCH_LINK = "plink_1UYJaFGwhPQmXQjfbMx7S4C3";
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
async function sheets(method,range,token,values) {
  const url="https://sheets.googleapis.com/v4/spreadsheets/"+LEDGER+"/values/"+encodeURIComponent("'"+TAB+"'!"+range)+(method==="PUT"?"?valueInputOption=RAW":"");
  const r=await fetch(url,{method,headers:{authorization:"Bearer "+token,...(values?{"content-type":"application/json"}:{})},body:values?JSON.stringify({values}):undefined});
  if(!r.ok)throw new Error("Google Sheets "+method+" failed: "+r.status);
  return r.json();
}
async function sync(session,env) {
  if(session.payment_link!==PATCH_LINK||session.payment_status!=="paid")return "ignored";
  const items=await stripe("checkout/sessions/"+encodeURIComponent(session.id)+"/line_items?limit=100",env.STRIPE_RESTRICTED_KEY);
  if(items.has_more)throw new Error("More than 100 line items: manual reconciliation required");
  const quantity=items.data.reduce((n,item)=>n+(item.quantity||0),0);
  if(!quantity)throw new Error("Paid session has no line items");
  const token=await googleToken(env);
  const sheet=await sheets("GET","A1:M1000",token);
  const rows=sheet.values||[];
  const index=rows.findIndex((row,i)=>i>0&&row[0]===session.id);
  const address=session.collected_information?.shipping_details?.address||session.shipping_details?.address||null;
  const name=session.customer_details?.name||session.collected_information?.shipping_details?.name||"";
  const formatted=address?[address.line1,address.line2,address.city,address.state,address.postal_code,address.country].filter(Boolean).join(", "):"";
  const previous=index>=0?rows[index]:[];
  const row=[session.id,name,quantity,(session.amount_total/100).toFixed(2),"Paid",previous[5]||"Awaiting fulfillment",previous[6]||"",previous[7]||"",previous[8]||"",formatted,session.payment_intent||"", "Stripe API",previous[12]||""];
  // Preserve owner-controlled fulfillment columns. Writes remain idempotent for serial deliveries.
  if(index>=0){await sheets("PUT","A"+(index+1)+":M"+(index+1),token,[row]);return "updated";}
  // Sheets append is intentionally not used: rows are indexed by Checkout Session ID.
  // Production must serialize this read-modify-write (e.g. Cloudflare Durable Object) to prevent duplicate rows.
  await sheets("PUT","A"+(rows.length+1)+":M"+(rows.length+1),token,[row]);
  return "created";
}
export default {
 async fetch(request,env) {
   if(request.method!=="POST"||new URL(request.url).pathname!=="/stripe/webhook")return json({error:"not found"},404);
   const raw=await request.text();
   if(!await verify(raw,request.headers.get("stripe-signature"),env.STRIPE_WEBHOOK_SECRET))return json({error:"invalid signature"},400);
   const event=JSON.parse(raw);
   if(!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type))return json({ok:true,ignored:true});
   try {
     const result=await sync(event.data.object,env);
     return json({ok:true,result});
   } catch(e) {
     console.error("Order synchronization failed",String(e.message||e));
     return json({error:"retry later"},503);
   }
 }
};
