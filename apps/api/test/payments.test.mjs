import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {PaymentsController} from '../dist/payments/payments.controller.js';
import {parsePayment,ownsPayment,paymentHash,validatePaymentDetail} from '../dist/payments/payment-contract.js';

Object.assign(process.env,{TRIPAY_API_KEY:'sandbox-key',TRIPAY_PRIVATE_KEY:'private-key',TRIPAY_MERCHANT_CODE:'T123',TRIPAY_BASE_URL:'https://tripay.co.id/api-sandbox',CORS_ORIGINS:'http://localhost:3000',TRIPAY_CALLBACK_URL:'https://tunnel.example/v1/payments/callback',TRIPAY_RETURN_URL:'http://localhost:3000'});
const id='f623c4ef-1eb2-49fb-ae0d-123456789012';
const identity={userId:null,guestHash:'a'.repeat(64)};
const req={headers:{origin:'http://localhost:3000'},method:'POST',socket:{remoteAddress:'127.0.0.1'}};
const res={setHeader(){}};
const input={id,source:'game',code:'SKU',target:'12345',method:'BRIVA',name:'Test customer',email:'test@example.com',phone:'081234567890',expectedAmount:20000};
const detail={reference:'T123PAY',merchant_ref:id,payment_method:'BRIVA',payment_name:'BRI VA',amount:20500,fee_customer:500,status:'UNPAID',checkout_url:'https://tripay.co.id/checkout/T123PAY',pay_code:'123',expired_time:2000000000,order_items:[{sku:'SKU',price:20000,quantity:1}]};
const copy=value=>structuredClone(value);
function signed(body) {
 const rawBody=Buffer.from(JSON.stringify(body));
 return {...req,body,rawBody,headers:{'x-callback-event':'payment_status','x-callback-signature':createHmac('sha256','private-key').update(rawBody).digest('hex')}};
}
const event={merchant_ref:id,reference:'T123PAY',is_closed_payment:1,payment_method_code:'BRIVA',total_amount:20500,status:'PAID'};
function setup() {
 const rows=new Map(),rates=new Map(),leases=new Set();let creates=0,beforePatch=null;
 const controller=new PaymentsController();
 controller.identities={resolve:async request=>request.testIdentity??copy(identity)};
 controller.catalog={list:async()=>({items:[{code:'SKU',price:20000,product:'Game',name:'Diamonds'}]})};
 controller.tripay={channels:async()=>[{code:'BRIVA',minimum_amount:10000,maximum_amount:1000000}],create:async value=>{creates++;await new Promise(resolve=>setTimeout(resolve,2));return {...copy(detail),merchant_ref:value.id};},detail:async()=>({...copy(detail),status:'PAID'})};
 controller.store={rpc:async(name,args)=>{
  if(name==='consume_payment_rate') {const count=(rates.get(args.p_key)||0)+1;rates.set(args.p_key,count);return count<=args.p_limit;}
  if(name==='claim_sandbox_payment_check') {if(leases.has(args.p_id))return false;leases.add(args.p_id);return true;}
  if(name==='reserve_sandbox_payment') {
   const value=args.p_payment,owner=value.owner_user_id??value.guest_session_hash;
   let row=rows.get(value.id);
   if(row) {assert.equal(row.owner_user_id??row.guest_session_hash,owner);assert.equal(row.request_hash,value.request_hash);return {payment:copy(row),claimed:false};}
   row=[...rows.values()].find(row=>(row.owner_user_id??row.guest_session_hash)===owner&&row.checkout_hash===value.checkout_hash&&['creating','unknown','pending'].includes(row.status));
   if(row)return {payment:copy(row),claimed:false};
   row={...value,created_at:new Date().toISOString(),status:'creating',reference:null,details:null,revision:0,provider_checked_at:null,provider_check_until:null,review_required:false};
   rows.set(row.id,row);return {payment:copy(row),claimed:true};
  }
  throw new Error('Unexpected RPC');
 }};
 controller.db=async(query,method='GET',body)=>{
  const rowId=/[?&]id=eq\.([a-f0-9-]+)/.exec(query)?.[1];
  if(!rowId)return [];
  let row=rows.get(rowId);if(!row)return [];
  if(method==='PATCH') {
   if(beforePatch){const hook=beforePatch;beforePatch=null;hook(row);row=rows.get(rowId);}
   const revision=/revision=eq\.(\d+)/.exec(query)?.[1],status=/status=eq\.([a-z]+)/.exec(query)?.[1];
   if((revision!==undefined&&row.revision!==Number(revision))||(status&&row.status!==status))return [];
   row={...row,...body};rows.set(rowId,row);
  }
  return [copy(row)];
 };
 return {controller,read:(rowId=id)=>rows.get(rowId),rows,creates:()=>creates,leases,beforePatch:hook=>{beforePatch=hook;}};
}

test('server price and strict request schema reject tampering before the gateway is called',async()=>{
 const {controller,creates}=setup();
 for(const bad of [{...input,amount:1},{...input,userId:randomUUID()},{...input,expectedAmount:1},{...input,expectedAmount:1.5},{...input,target:'bad\u0000target'},null,[]]) {
  await assert.rejects(controller.create(bad,req,res),error=>[400,409].includes(error.getStatus()));
 }
 assert.equal(creates(),0);
});
test('canonical input normalizes UUID case and whitespace without accepting forged ownership',()=>{
 const parsed=parsePayment({...input,id:id.toUpperCase(),name:'  Test   customer ',email:'TEST@EXAMPLE.COM'});
 assert.equal(parsed.id,id);assert.equal(parsed.name,'Test customer');assert.equal(parsed.email,'test@example.com');
 assert.throws(()=>parsePayment({...input,guest_session_hash:'b'.repeat(64)}));
});
test('parallel requests and different tab IDs reserve only one provider transaction',async()=>{
 const {controller,creates,rows}=setup();
 const results=await Promise.all(Array.from({length:8},(_,index)=>controller.create({...input,id:index%2?id:randomUUID()},req,res)));
 assert.equal(creates(),1);assert.equal(rows.size,1);assert.equal(new Set(results.map(value=>value.id)).size,1);
 const payment=results.find(value=>value.status==='pending');assert.equal(payment.amount,20000);assert.equal(payment.total,20500);
 assert.doesNotMatch(JSON.stringify(payment),/access_hash|request_hash|guest_session_hash|owner_user_id/);
});
test('ambiguous provider result stays unknown and retry never creates another payment',async()=>{
 const {controller,read}=setup();let attempts=0;
 controller.tripay.create=async()=>{attempts++;throw new Error('timeout');};
 const payment=await controller.create(input,req,res);assert.equal(payment.status,'unknown');assert.equal(payment.refreshDelayed,true);
 const retried=await controller.create({...input,id:randomUUID()},req,res);assert.equal(retried.id,id);assert.equal(attempts,1);assert.equal(read().status,'unknown');
});
test('database reservation failure prevents sending a payment to the provider',async()=>{
 const {controller,creates}=setup();const rpc=controller.store.rpc;
 controller.store.rpc=async(name,args)=>{if(name==='reserve_sandbox_payment')throw new Error('database disconnected');return rpc(name,args);};
 await assert.rejects(controller.create(input,req,res));assert.equal(creates(),0);
});
test('account payments bind to verified session identity and cannot be opened by a guest or another account',async()=>{
 const {controller,read}=setup();const userId=randomUUID();const account={...req,testIdentity:{userId,guestHash:identity.guestHash}};
 await controller.create(input,account,res);assert.equal(read().owner_user_id,userId);assert.equal(read().guest_session_hash,null);
 for(const stranger of [req,{...req,testIdentity:{userId:randomUUID(),guestHash:identity.guestHash}}]) {
  await assert.rejects(controller.detail(id,stranger,res),error=>error.getStatus()===404);
  await assert.rejects(controller.create(input,stranger,res),error=>error.getStatus()===404);
 }
 assert.equal((await controller.detail(id,account,res)).id,id);
});
test('guest session ownership is required; knowing invoice ID or an old bearer token is insufficient',async()=>{
 const {controller,read}=setup();await controller.create(input,req,res);
 const other={...req,testIdentity:{userId:null,guestHash:'b'.repeat(64)}};
 await assert.rejects(controller.detail(id,other,res),error=>error.getStatus()===404);
 assert.equal(ownsPayment(read(),other.testIdentity,read().access_hash),false);
 assert.equal(ownsPayment(read(),identity,null),true);
});
test('missing checkout session and expired account session fail closed',async()=>{
 const {controller,creates}=setup();
 await assert.rejects(controller.create(input,{...req,testIdentity:{userId:null,guestHash:null}},res),error=>error.getStatus()===401);
 controller.identities.resolve=async()=>{throw new Error('auth disconnected');};
 await assert.rejects(controller.create(input,req,res));assert.equal(creates(),0);
});
test('cross-origin checkout and missing origin are rejected',async()=>{
 const {controller,creates}=setup();
 for(const origin of [undefined,'https://evil.example','null'])await assert.rejects(controller.create(input,{...req,headers:{origin}},res),error=>error.getStatus()===403);
 assert.equal(creates(),0);
});
test('shared rate limiter fails closed and rejects an eleventh owner request',async()=>{
 const {controller,creates}=setup();await controller.create(input,req,res);
 for(let i=0;i<9;i++)await controller.create(input,req,res);
 await assert.rejects(controller.create(input,req,res),error=>error.getStatus()===429);assert.equal(creates(),1);
 const isolated=setup();isolated.controller.store.rpc=async()=>{throw new Error('limiter unavailable');};
 await assert.rejects(isolated.controller.create(input,req,res));assert.equal(isolated.creates(),0);
});
test('signature, event, amount, reference and channel are verified before recording payment',async()=>{
 const {controller,read}=setup();await controller.create(input,req,res);
 await assert.rejects(controller.callback({...signed(event),rawBody:Buffer.from('{}')}),error=>error.getStatus()===401);
 await assert.rejects(controller.callback({...signed(event),headers:{...signed(event).headers,'x-callback-event':'other'}}),error=>error.getStatus()===400);
 await assert.rejects(controller.callback(signed({...event,total_amount:1})),error=>error.getStatus()===400);
 assert.equal(read().status,'pending');
 await controller.callback(signed(event));assert.equal(read().status,'paid');
 await controller.callback(signed(event));assert.equal(read().status,'paid');
});
test('callback recovers a provider request accepted before the connection was lost',async()=>{
 const {controller,read}=setup();controller.tripay.create=async()=>{throw new Error('timeout');};
 await controller.create(input,req,res);await controller.callback(signed(event));assert.equal(read().status,'paid');assert.equal(read().reference,'T123PAY');
});
test('optimistic concurrency retries a refund instead of acknowledging a lost write',async()=>{
 const fixture=setup();await fixture.controller.create(input,req,res);await fixture.controller.callback(signed(event));
 const stale=copy(fixture.read());
 fixture.beforePatch(row=>{row.revision++;});
 await fixture.controller.saveDetail(stale,{...detail,status:'REFUND'});
 assert.equal(fixture.read().status,'refunded');assert.ok(fixture.read().revision>stale.revision+1);
});
test('polling and PAID callback racing cannot roll paid state back to UNPAID',async()=>{
 const {controller,read}=setup();await controller.create(input,req,res);const stale=copy(read());
 await Promise.all([controller.saveDetail(stale,{...detail,status:'PAID'}),controller.saveDetail(stale,{...detail,status:'UNPAID'})]);
 assert.equal(read().status,'paid');assert.equal(read().details.status,'PAID');
});
test('late PAID callback after refund uses current provider state without rolling back',async()=>{
 const {controller,read}=setup();await controller.create(input,req,res);await controller.callback(signed(event));
 controller.tripay.detail=async()=>({...detail,status:'REFUND'});
 await controller.callback(signed(event));assert.equal(read().status,'refunded');
 await controller.saveDetail(copy(read()),{...detail,status:'PAID'});assert.equal(read().status,'refunded');
});
test('contradictory terminal state and malformed provider totals require review',async()=>{
 const {controller,read}=setup();await controller.create(input,req,res);await controller.callback(signed(event));
 await assert.rejects(controller.saveDetail(copy(read()),{...detail,status:'EXPIRED'}),error=>error.getStatus()===409);
 assert.equal(read().status,'paid');assert.equal(read().review_required,true);
 for(const invalid of [{...detail,amount:1},{...detail,fee_customer:-1},{...detail,checkout_url:'https://evil.example/checkout'},{...detail,order_items:[{price:10000,quantity:2}]},{...detail,merchant_ref:randomUUID()}]) assert.throws(()=>validatePaymentDetail(read(),invalid));
});
test('provider outage preserves last verified state and polling lease prevents request amplification',async()=>{
 const {controller,read,leases}=setup();await controller.create(input,req,res);let checks=0;
 controller.tripay.detail=async()=>{checks++;throw new Error('disconnected');};
 const payment=await controller.detail(id,req,res);assert.equal(payment.status,'pending');assert.equal(payment.refreshDelayed,true);
 await Promise.all(Array.from({length:10},()=>controller.detail(id,req,res)));assert.equal(checks,1);assert.equal(read().status,'pending');
 assert.equal(leases.size,1);
});
test('stale creating records become unknown without resending a gateway request',async()=>{
 const {controller,read,creates}=setup();await controller.create(input,req,res);
 const row=read();row.status='creating';row.reference=null;row.created_at=new Date(Date.now()-180000).toISOString();
 const result=await controller.detail(id,req,res);assert.equal(result.status,'unknown');assert.equal(creates(),1);
});
test('reconciliation recovers a lost reference using merchant invoice lookup without resending',async()=>{
 const {controller,read}=setup();let creates=0,lookups=0;
 controller.tripay.create=async()=>{creates++;throw new Error('response lost');};
 controller.tripay.findByMerchantRef=async value=>{assert.equal(value,id);lookups++;return 'T123PAY';};
 await controller.create(input,req,res);
 const payment=await controller.detail(id,req,res);
 assert.equal(payment.status,'paid');assert.equal(read().reference,'T123PAY');assert.equal(creates,1);assert.equal(lookups,1);
});
test('no provider match leaves an ambiguous payment unknown instead of falsely failing or recreating it',async()=>{
 const {controller,read}=setup();controller.tripay.create=async()=>{throw new Error('disconnected');};controller.tripay.findByMerchantRef=async()=>null;
 await controller.create(input,req,res);const payment=await controller.detail(id,req,res);
 assert.equal(payment.status,'unknown');assert.equal(payment.refreshDelayed,true);assert.equal(read().reference,null);
});
test('guest and legacy capability expiry are checked on the server, not just in browser cookie settings',async()=>{
 const {controller,read}=setup();await controller.create(input,req,res);const row=read();
 assert.equal(ownsPayment({...row,created_at:new Date(Date.now()-31*86400000).toISOString()},identity,null),false);
 const legacy={...row,guest_session_hash:null,created_at:new Date(Date.now()-8*86400000).toISOString()};
 assert.equal(ownsPayment(legacy,identity,row.access_hash),false);
 assert.equal(ownsPayment({...row,created_at:'invalid'},identity,null),false);
});
