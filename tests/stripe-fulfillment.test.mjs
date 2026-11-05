import assert from "node:assert/strict";
import test from "node:test";
import {createHmac, generateKeyPairSync} from "node:crypto";
import worker, {OrderCoordinator} from "../integrations/stripe-fulfillment/worker.mjs";

test("signed checkout deliveries, retries and isolation", async t => {
  const headers = ["Order ID","Customer","Quantity","Amount USD","Payment Status","Fulfillment Status",
    "Date Mailed","Carrier","Tracking","Shipping Address","Stripe Payment ID","Source","Notes"];
  const session = {id:"cs_test_fixture",object:"checkout.session",livemode:false,payment_link:"test-link",
    payment_status:"paid",currency:"usd",amount_total:3000,payment_intent:"pi_fixture",
    customer_details:{name:"Fixture"}};
  const account = generateKeyPairSync("rsa",{modulusLength:2048,
    privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
  const env = {STRIPE_MODE:"test", LEDGER_ID:"fixture", ORDERS_SHEET_ID:"123",
    PATCH_LINK_ID:"test-link", PATCH_PRICE_ID:"patch", STRIPE_WEBHOOK_SECRET:"whsec_fixture",
    STRIPE_RESTRICTED_KEY:"rk_test_fixture",
    GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:"fixture@example.invalid",private_key:account.privateKey})};
  const rows = [], storage = new Map();
  const object = new OrderCoordinator({blockConcurrencyWhile:fn=>fn(),
    storage:{get:k=>storage.get(k),put:(k,v)=>storage.set(k,v)}},env);
  env.ORDER_COORDINATOR = {idFromName:()=>1,get:()=>({fetch:(url,init)=>object.fetch(new Request(url,init))})};
  let failedResponse = false;
  t.mock.method(globalThis,"fetch",async (url,init) => {
    if (url.startsWith("https://api.stripe.com/")) return Response.json({has_more:false,data:[
      {price:{id:"patch"},quantity:3},{price:{id:"other"},quantity:2}]});
    if (url.startsWith("https://oauth2.googleapis.com/")) return Response.json({access_token:"fixture"});
    if (url.includes("values:batchGet")) return Response.json({valueRanges:[
      {values:[headers]},{values:rows.map(r=>[r[0]])}]});
    assert.ok(url.endsWith(":batchUpdate"));
    const [marker,append] = JSON.parse(init.body).requests;
    assert.ok(marker.addNamedRange.namedRange.namedRangeId);
    rows.push(append.appendCells.rows[0].values.map(v=>Object.values(v.userEnteredValue)[0]));
    if (failedResponse) return new Response(null,{status:503});
    return Response.json({});
  });
  async function send(id, object=session, type="checkout.session.completed", age=0, secret=env.STRIPE_WEBHOOK_SECRET) {
    const raw = JSON.stringify({id,type,livemode:object.livemode,data:{object}});
    const time = Math.floor(Date.now()/1000)-age;
    const digest = createHmac("sha256",secret||"").update(time+"."+raw).digest("hex");
    return worker.fetch(new Request("https://fixture.invalid/stripe/webhook",{method:"POST",
      body:raw,headers:{"stripe-signature":"t="+time+",v1="+digest}}),env);
  }
  assert.equal((await send("x",session,undefined,301)).status,400);
  assert.equal((await send("x",session,undefined,0,"wrong")).status,400);
  for (const patch of [{payment_status:"unpaid"},{livemode:true},{payment_link:"other"}]) {
    assert.equal((await (await send("ignored",{...session,...patch})).json()).ignored,true);
  }
  assert.equal((await (await send("refund",session,"charge.refunded")).json()).ignored,true);
  assert.equal(rows.length,0);
  failedResponse = true;
  assert.equal((await send("evt1")).status,503);
  assert.equal(rows.length,1);
  assert.equal(rows[0][2],3);
  assert.equal(rows[0][3],30);
  assert.match(rows[0][12],/Shipping address missing/);
  rows[0][5]="Mailed";
  assert.equal((await (await send("evt1")).json()).result,"already recorded");
  assert.equal((await (await send("evt1")).json()).result,"duplicate");
  assert.equal((await (await send("evt2",session,"checkout.session.async_payment_succeeded")).json()).result,"already recorded");
  assert.equal(rows.length,1);
  assert.equal(rows[0][5],"Mailed");
  env.STRIPE_WEBHOOK_SECRET=undefined;
  assert.equal((await send("x")).status,503);
});
