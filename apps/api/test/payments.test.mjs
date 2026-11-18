import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HttpException} from '@nestjs/common';
import {createHmac,randomUUID} from 'node:crypto';
import {PaymentsController} from '../dist/payments/payments.controller.js';
import {TripayRejectedError} from '../dist/payments/tripay-client.js';
import {parsePayment,ownsPayment,paymentHash,validatePaymentDetail} from '../dist/payments/payment-contract.js';

Object.assign(process.env,{TRIPAY_API_KEY:'test-key',TRIPAY_PRIVATE_KEY:'private-key',TRIPAY_MERCHANT_CODE:'T123',TRIPAY_BASE_URL:'https://tripay.co.id/api',CORS_ORIGINS:'http://localhost:3000',TRIPAY_CALLBACK_URL:'https://tunnel.example/v1/payments/callback',TRIPAY_RETURN_URL:'http://localhost:3000'});
const id='f623c4ef-1eb2-49fb-ae0d-123456789012';
const identity={userId:null,guestHash:'a'.repeat(64)};
const req={headers:{origin:'http://localhost:3000'},method:'POST',socket:{remoteAddress:'127.0.0.1'}};
const res={setHeader(){}};
// Live checkout is exercised with mocked gateway/supplier transports only.
Object.assign(process.env, { TRIPAY_MODE: 'live', VIPAYMENT_FULFILLMENT_ENABLED: 'true', VIPAYMENT_API_ID: 'test-id', VIPAYMENT_API_KEY: 'test-key' });
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
 controller.catalog={list:async()=>({items:[{code:'SKU',price:20000,providerCost:15000,product:'Game',name:'Diamonds'}]})};
 controller.tripay={channels:async()=>[{code:'BRIVA',minimum_amount:1,maximum_amount:1000000}],create:async value=>{creates++;await new Promise(resolve=>setTimeout(resolve,2));return {...copy(detail),merchant_ref:value.id};},detail:async()=>({...copy(detail),status:'PAID'})};
 controller.store={request:async()=>[],rpc:async(name,args)=>{
  if(name==='consume_payment_rate') {const count=(rates.get(args.p_key)||0)+1;rates.set(args.p_key,count);return count<=args.p_limit;}
  if(name==='claim_payment_check') {if(leases.has(args.p_id))return false;leases.add(args.p_id);return true;}
  if(name==='reserve_payment') {
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
  const invoice=/[?&]invoice_number=eq\.([A-Z0-9-]+)/.exec(query)?.[1];
  const rowId=/[?&]id=eq\.([a-f0-9-]+)/.exec(query)?.[1] ?? (invoice ? [...rows.values()].find(row=>row.invoice_number===invoice)?.id : undefined);
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

test('dashboard history requires an account and only returns verified owner invoices',async()=>{
 const {controller,read}=setup(),userId=randomUUID();
 const account={...req,testIdentity:{userId,guestHash:identity.guestHash,email:'account@example.com'}};
 await controller.create(input,account,res);
 const row=copy(read()),queries=[];
 controller.db=async query=>{queries.push(query);return [{...row,id:randomUUID(),owner_user_id:randomUUID()},row];};
 const history=await controller.history('0',account,res,'account');
 assert.equal(history.userId,userId);assert.equal(history.payments.length,1);assert.equal(history.payments[0].id,id);
 assert.ok(queries[0].includes(`owner_user_id.eq.${userId}`));assert.ok(queries[0].includes(`claimed_user_id.eq.${userId}`));assert.ok(queries[0].includes('order=created_at.desc'));assert.ok(!queries[0].includes('guest_session_hash'));
 assert.doesNotMatch(JSON.stringify(history.payments),/access_hash|request_hash|guest_session_hash|owner_user_id/);
 await assert.rejects(controller.history('0',req,res,'account'),error=>error.getStatus()===401);
 await assert.rejects(controller.history('0',account,res,'other'),error=>error.getStatus()===400);
 await assert.rejects(controller.history('-1',account,res,'account'),error=>error.getStatus()===400);
 controller.db=async query=>{assert.ok(query.includes('offset=50'));return Array.from({length:51},(_,i)=>({...row,id:`invoice-${i}`}));};
 const next=await controller.history('1',account,res,'account');assert.equal(next.payments.length,50);assert.equal(next.hasMore,true);
});

test('ARNS number is shared by checkout, return URL, invoice lookup and verified callback',async()=>{
 const {controller,rows}=setup();
 const number='ANRS-SKU-GAME-20261115-0123456789ABCDEF';
 const rpc=controller.store.rpc;
 controller.store.rpc=async(name,args)=>{
  const result=await rpc(name,args);
  if(name==='reserve_payment'){
   const row=rows.get(result.payment.id);row.invoice_number=number;row.merchant_ref=number;
   result.payment=copy(row);
  }
  return result;
 };
 controller.tripay.create=async value=>{
  assert.equal(value.id,number);
  assert.equal(value.returnUrl,`http://localhost:3000/invoice/${number}`);
  return {...copy(detail),merchant_ref:number};
 };
 controller.tripay.detail=async()=>({...copy(detail),merchant_ref:number,status:'PAID'});
 const payment=await controller.create(input,req,res);
 assert.equal(payment.invoiceNumber,number);
 const invoice=await controller.detail(number.toLowerCase(),req,res);
 assert.equal(invoice.id,id);assert.equal(invoice.invoiceNumber,number);
 await assert.rejects(controller.detail(number,{...req,testIdentity:{userId:null,guestHash:'f'.repeat(64)}},res),e=>e.getStatus()===404);
 assert.deepEqual(await controller.callback(signed({...event,merchant_ref:number})),{success:true});
 assert.equal(rows.get(id).status,'paid');
 assert.equal(rows.get(id).invoice_number,number);
});

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

test('an admin catalog change between pricing and reservation prevents a gateway charge',async()=>{
 const {controller,creates,rows}=setup();const rpc=controller.store.rpc;
 const list=controller.catalog.list;
 controller.catalog.list=async()=>({...await list(),catalogRevision:'7'});
 controller.store.rpc=async(name,args)=>{
  if(name==='reserve_payment'){
   assert.equal(args.p_payment.catalog_revision,'7');
   throw new HttpException('Catalog changed before reservation',409);
  }
  return rpc(name,args);
 };
 await assert.rejects(controller.create(input,req,res),error=>error.getStatus()===409);
 assert.equal(creates(),0);assert.equal(rows.size,0);
});
test('ambiguous provider result stays unknown and retry never creates another payment',async()=>{
 const {controller,read}=setup();let attempts=0;
 controller.tripay.create=async()=>{attempts++;throw new Error('timeout');};
 const payment=await controller.create(input,req,res);assert.equal(payment.status,'unknown');assert.equal(payment.refreshDelayed,true);
 const retried=await controller.create({...input,id:randomUUID()},req,res);assert.equal(retried.id,id);assert.equal(attempts,1);assert.equal(read().status,'unknown');
});
test('database reservation failure prevents sending a payment to the provider',async()=>{
 const {controller,creates}=setup();const rpc=controller.store.rpc;
 controller.store.rpc=async(name,args)=>{if(name==='reserve_payment')throw new Error('database disconnected');return rpc(name,args);};
 await assert.rejects(controller.create(input,req,res));assert.equal(creates(),0);
});
test('account payments bind to verified session identity and cannot be opened by a guest or another account',async()=>{
 const {controller,read}=setup();const userId=randomUUID();const account={...req,testIdentity:{userId,guestHash:identity.guestHash,email:'account@example.com'}};
 await controller.create(input,account,res);assert.equal(read().owner_user_id,userId);assert.equal(read().guest_session_hash,null);
 for(const stranger of [req,{...req,testIdentity:{userId:randomUUID(),guestHash:identity.guestHash,email:'other@example.com'}}]) {
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
test('guest expiry and removal of bearer-only invoice access are enforced by the server',async()=>{
 const {controller,read}=setup();await controller.create(input,req,res);const row=read();
 assert.equal(ownsPayment({...row,created_at:new Date(Date.now()-31*86400000).toISOString()},identity,null),false);
 const legacy={...row,guest_session_hash:null,created_at:new Date(Date.now()-8*86400000).toISOString()};
 assert.equal(ownsPayment(legacy,identity,row.access_hash),false);
 assert.equal(ownsPayment({...legacy,created_at:new Date().toISOString()},identity,row.access_hash),false);
 assert.equal(ownsPayment({...row,created_at:'invalid'},identity,null),false);
});

for (const [providerStatus, status] of [['FAILED','failed'], ['EXPIRED','expired']]) {
 test(`${providerStatus} is terminal, survives replay and cannot silently become paid`, async()=>{
  const {controller,read}=setup();
  await controller.create(input,req,res);
  controller.tripay.detail=async()=>({...detail,status:providerStatus});
  await controller.callback(signed({...event,status:providerStatus}));
  await controller.callback(signed({...event,status:providerStatus}));
  assert.equal((await controller.detail(id,req,res)).status,status);
  controller.tripay.detail=async()=>({...detail,status:'PAID'});
  await assert.rejects(controller.callback(signed(event)),error=>error.getStatus()===409);
  assert.equal(read().status,status);
  assert.equal(read().review_required,true);
 });
}

test('callback database failure is not acknowledged and provider retry recovers the same invoice',async()=>{
 const {controller,read,creates}=setup();
 await controller.create(input,req,res);
 const db=controller.db;
 controller.db=async(query,method,body)=>{if(method==='PATCH')throw new Error('database unavailable');return db(query,method,body);};
 await assert.rejects(controller.callback(signed(event)));
 assert.equal(read().status,'pending');
 controller.db=db;
 assert.deepEqual(await controller.callback(signed(event)),{success:true});
 assert.equal(read().status,'paid');
 assert.equal(creates(),1);
});

test('manual task checkout stores authoritative work mode and customer contact snapshots',async()=>{
 const s=setup(),rpc=s.controller.store.rpc;
 const taskCode=`managed.${randomUUID()}`;
 s.controller.catalog={list:async()=>({items:[{code:taskCode,price:20000,product:'Joki tugas',name:'Format dokumen',fulfillmentMode:'manual'}]})};
 s.controller.store.rpc=(name,args)=>name==='quote_task_order'?20000:rpc(name==='reserve_task_payment'?'reserve_payment':name,args);
 await s.controller.create({...input,source:'tasks',code:taskCode,target:'Format 10 halaman',task:{pages:10,deadline_days:7,revisions:1,instructions:'Rapikan dokumen tugas sesuai contoh.',reference_url:''}},req,res);
 assert.equal(s.read().fulfillment_mode,'manual');assert.equal(s.read().customer_email,input.email);assert.equal(s.read().customer_phone,input.phone);
 assert.equal(s.read().service_quantity,1);assert.equal(s.read().amount,input.expectedAmount);
});

test('social checkout validates the destination and quantity and calculates the authoritative amount',async()=>{
 const s=setup();s.controller.catalog={list:async()=>({items:[{code:'SKU',price:20000,unitPrice:6500,minimum:100,maximum:50000,product:'TikTok',name:'Likes',targetKind:'link',targetHosts:['tiktok.com'],serviceQuantity:100,providerServiceCode:'17',providerCost:6500,fulfillmentMode:'vipayment'}]})};
 await assert.rejects(s.controller.create({...input,source:'social',expectedQuantity:50001},req,res),e=>e.getStatus()===400);assert.equal(s.creates(),0);
 await assert.rejects(s.controller.create({...input,source:'social',expectedQuantity:500,expectedAmount:3250},req,res),e=>e.getStatus()===400);assert.equal(s.creates(),0);
 await assert.rejects(s.controller.create({...input,source:'social',target:'https://tiktok.com.example.net/@public/video/123',expectedQuantity:500,expectedAmount:3250},req,res),e=>e.getStatus()===400);assert.equal(s.creates(),0);
 await s.controller.create({...input,source:'social',target:'https://www.tiktok.com/@public/video/123',expectedQuantity:500,expectedAmount:3250},req,res);assert.equal(s.read().service_quantity,500);assert.equal(s.read().provider_service_code,'17');assert.equal(s.read().provider_cost,3250);assert.equal(s.read().amount,3250);
});

test('guest game checkout requires email but allows empty WhatsApp',async()=>{
 for(const email of ['',undefined]){
  const s=setup();
  await assert.rejects(s.controller.create({...input,email,phone:''},req,res),e=>e.getStatus()===400);
  assert.equal(s.creates(),0);assert.equal(s.rows.size,0);
 }
 const s=setup();await s.controller.create({...input,phone:''},req,res);
 assert.equal(s.read().customer_email,input.email);assert.equal(s.read().customer_phone,'');
});
test('account checkout uses verified account email instead of browser email',async()=>{
 for(const email of ['', 'forged@example.com']){
  const s=setup();
  const account={...req,testIdentity:{userId:randomUUID(),guestHash:null,email:'verified@example.com'}};
  await s.controller.create({...input,email,phone:''},account,res);
  assert.equal(s.read().customer_email,'verified@example.com');
  assert.equal(s.creates(),1);
 }
});
test('account without verified email cannot fall back to browser email',async()=>{
 const s=setup();
 await assert.rejects(s.controller.create(input,{...req,testIdentity:{userId:randomUUID(),guestHash:null}},res),e=>e.getStatus()===400);
 assert.equal(s.creates(),0);assert.equal(s.rows.size,0);
});


test('OVO requires a payment phone before any reservation and definitive rejection returns a usable error instead of unknown',async()=>{
 const {controller,read,creates}=setup();
 await assert.rejects(controller.create({...input,source:'game',method:'OVO',phone:''},req,res),error=>error.getStatus()===400&&/OVO/.test(error.message));
 assert.equal(creates(),0);assert.equal(read(),undefined);
 controller.tripay.create=async()=>{throw new TripayRejectedError('phone_required');};
 await assert.rejects(controller.create(input,req,res),error=>error.getStatus()===502&&/nomor HP/.test(error.message));
 assert.equal(read().status,'failed');assert.equal(read().reference,null);
});


test('Mobile Legends preserves separate numeric player/zone strings and rejects combined pasted IDs before payment',async()=>{
 const {controller,read,creates}=setup();
 controller.catalog={list:async()=>({items:[{code:'SKU',price:20000,providerCost:15000,product:'Mobile Legends',productSlug:'mobile-legends',name:'Diamonds'}]})};
 for(const invalid of [{target:'123456(1234)',targetZone:'1234'},{target:'123456',targetZone:'12A4'},{target:'123456',targetZone:''}]){
  await assert.rejects(controller.create({...input,...invalid},req,res),error=>error.getStatus()===400);
 }
 assert.equal(creates(),0);assert.equal(read(),undefined);
 await controller.create({...input,target:'0012345678',targetZone:'01234'},req,res);
 assert.equal(read().target,'0012345678');assert.equal(read().target_zone,'01234');
});
