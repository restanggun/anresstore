import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VipaymentClient} from '../dist/payments/vipayment-client.js';
import {FulfillmentWorker} from '../dist/payments/fulfillment-worker.js';

const order={id:'f623c4ef-1eb2-49fb-ae0d-123456789012',category:'game',provider_code:'ML10',target:'12345',target_zone:'123',provider_cost:20000,provider_reference:null,payment_status:'paid',payment_reference:'LIVE1',fulfillment_status:'ready'};
test('VIPayment sends separate destination and zone; verifies exact status identity without retries',async()=>{
 const old={fetch:globalThis.fetch,id:process.env.VIPAYMENT_API_ID,key:process.env.VIPAYMENT_API_KEY,enabled:process.env.VIPAYMENT_FULFILLMENT_ENABLED};
 Object.assign(process.env,{VIPAYMENT_API_ID:'test',VIPAYMENT_API_KEY:'secret',VIPAYMENT_FULFILLMENT_ENABLED:'true'});
 let calls=[];
 let reply={result:true,data:{trxid:'VP1',data:'12345',zone:'123',price:20000,status:'waiting',note:''}};
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(reply));};
 try {
  const client=new VipaymentClient();
  assert.deepEqual(await client.order(order),{reference:'VP1',status:'processing',note:''});
  assert.equal(calls[0].url,'https://vip-reseller.co.id/api/game-feature');
  assert.equal(calls[0].init.body.get('data_no'),'12345');assert.equal(calls[0].init.body.get('data_zone'),'123');
  reply={result:true,data:[{...reply.data,status:'success'}]};
  assert.equal((await client.status({...order,provider_reference:'VP1'})).status,'completed');
  reply.data[0].trxid='OTHER';await assert.rejects(client.status({...order,provider_reference:'VP1'}));
  globalThis.fetch=async()=>{calls.push({});throw new Error('timeout');};
  const before=calls.length;await assert.rejects(client.order(order));assert.equal(calls.length,before+1);
  process.env.VIPAYMENT_FULFILLMENT_ENABLED='false';await assert.rejects(client.order(order));assert.equal(calls.length,before+1);
 } finally {globalThis.fetch=old.fetch;for(const [key,value] of [['VIPAYMENT_API_ID',old.id],['VIPAYMENT_API_KEY',old.key],['VIPAYMENT_FULFILLMENT_ENABLED',old.enabled]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('durable claim allows one dispatch across workers and uncertain orders are never sent again',async()=>{
 const old=process.env.VIPAYMENT_FULFILLMENT_ENABLED;process.env.VIPAYMENT_FULFILLMENT_ENABLED='true';
 let row={...order},sends=0;const paths=[];
 const store={request:async(path,method,body)=>{
  paths.push(path);
  if(path==='rpc/claim_live_fulfillment'){if(row.fulfillment_status!=='ready')return [];row={...row,fulfillment_status:'dispatching'};return [{...row}];}
  if(method==='PATCH'){
   if(path.includes('updated_at=lt.'))return [];
   const expected=/fulfillment_status=eq\.([^&]+)/.exec(path)[1];
   if(expected!==row.fulfillment_status)return [];
   row={...row,...body};return [{...row}];
  }
  return ['ready','processing'].includes(row.fulfillment_status)?[{...row}]:[];
 }};
 const workers=[new FulfillmentWorker(),new FulfillmentWorker()];
 for(const worker of workers){worker.store=store;worker.provider={order:async()=>{sends++;throw new Error('response lost');}};}
 try {
  await Promise.all(workers.map(worker=>worker.run()));
  assert.equal(sends,1);assert.equal(row.fulfillment_status,'unknown');
  await workers[0].run();assert.equal(sends,1);
  assert.ok(paths.every(path=>!path.includes('sandbox_payments')));
  process.env.VIPAYMENT_FULFILLMENT_ENABLED='false';row={...order};await workers[0].run();assert.equal(sends,1);
 } finally {if(old===undefined)delete process.env.VIPAYMENT_FULFILLMENT_ENABLED;else process.env.VIPAYMENT_FULFILLMENT_ENABLED=old;}
});

test('social orders send fixed package quantity and partial fulfillment requires manual review',async()=>{
 const originalFetch=global.fetch,env={...process.env};Object.assign(process.env,{VIPAYMENT_API_ID:'test',VIPAYMENT_API_KEY:'secret',VIPAYMENT_FULFILLMENT_ENABLED:'true'});
 const social={...order,category:'social',provider_code:'17',target:'https://tiktok.com/@public',target_zone:null,service_quantity:500,provider_cost:3249};let sent;
 global.fetch=async(url,init)=>{sent={url,body:init.body};return Response.json({result:true,data:{trxid:'VP17',data:social.target,quantity:500,price:3249,status:'partial',note:'Partial delivery'}});};
 try {const result=await new VipaymentClient().order(social);assert.equal(sent.url,'https://vip-reseller.co.id/api/social-media');assert.equal(sent.body.get('quantity'),'500');assert.equal(sent.body.get('data'),social.target);assert.equal(result.status,'manual_review');await assert.rejects(new VipaymentClient().order({...social,service_quantity:0}));}
 finally{global.fetch=originalFetch;process.env=env;}
});
