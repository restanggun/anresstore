import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {TripayClient,tripayConfig} from '../dist/payments/tripay-client.js';

const config={TRIPAY_API_KEY:'sandbox-api',TRIPAY_PRIVATE_KEY:'sandbox-private',TRIPAY_MERCHANT_CODE:'T123',TRIPAY_BASE_URL:'https://tripay.co.id/api-sandbox'};
Object.assign(process.env,config);
test('sandbox cannot send credentials to production or arbitrary hosts',()=>{
  assert.equal(tripayConfig(config).base,'https://tripay.co.id/api-sandbox');
  for(const base of ['https://tripay.co.id/api','https://evil.example/api-sandbox','https://tripay.co.id/api-sandbox?other=1']) assert.throws(()=>tripayConfig({...config,TRIPAY_BASE_URL:base}));
  assert.throws(()=>tripayConfig({...config,TRIPAY_PRIVATE_KEY:''}));
});
test('create signs the merchant, reference and authoritative amount and sends one line item',async()=>{
  let captured;
  const client=new TripayClient(async(url,options)=>{
    captured={url,options,body:JSON.parse(options.body)};
    return Response.json({success:true,data:{reference:'T123PAY'}});
  });
  const input={id:'invoice-1',method:'BRIVA',amount:20000,name:'Test',email:'test@example.com',phone:'081234567890',product:'Test product',code:'SKU1',callback:'https://test.example/v1/payments/callback',returnUrl:'http://localhost:3000'};
  await client.create(input);
  assert.equal(captured.url,'https://tripay.co.id/api-sandbox/transaction/create');
  assert.equal(captured.options.headers.Authorization,'Bearer sandbox-api');
  assert.equal(captured.options.redirect,'error');
  assert.equal(captured.body.signature,createHmac('sha256','sandbox-private').update('T123invoice-120000').digest('hex'));
  assert.deepEqual(captured.body.order_items,[{sku:'SKU1',name:'Test product',price:20000,quantity:1}]);
  await assert.rejects(client.create({...input,amount:1.5}));
});
test('only active payment channels are exposed',async()=>{
  const client=new TripayClient(async()=>Response.json({success:true,data:[{code:'BRIVA',active:true},{code:'QRIS',active:false},{code:'bad?',active:true}]}));
  assert.deepEqual((await client.channels()).map(x=>x.code),['BRIVA']);
});
test('provider and network errors do not leak secrets or customer information',async()=>{
  for(const transport of [async()=>{throw new Error('sandbox-private test@example.com');},async()=>Response.json({success:false,message:'sandbox-api'})]) {
    await assert.rejects(new TripayClient(transport).channels(),error=>error.getStatus()===502&&!JSON.stringify(error.getResponse()).includes('sandbox-api')&&!JSON.stringify(error.getResponse()).includes('test@example.com'));
  }
});
test('merchant invoice lookup is bounded and refuses ambiguous or unrelated records',async()=>{
 let requested;
 const client=new TripayClient(async url=>{requested=url;return Response.json({success:true,data:[{merchant_ref:'invoice-1',reference:'DEV-123'}]});});
 assert.equal(await client.findByMerchantRef('invoice-1'),'DEV-123');assert.match(requested,/merchant_ref=invoice-1&per_page=2/);
 for(const data of [[{merchant_ref:'other',reference:'DEV-123'}],[{merchant_ref:'invoice-1',reference:'DEV-1'},{merchant_ref:'invoice-1',reference:'DEV-2'}]])await assert.rejects(new TripayClient(async()=>Response.json({success:true,data})).findByMerchantRef('invoice-1'),error=>error.getStatus()===409);
 assert.equal(await new TripayClient(async()=>Response.json({success:true,data:[]})).findByMerchantRef('invoice-1'),null);
});
test('oversized gateway responses are rejected before JSON decoding',async()=>{
 const client=new TripayClient(async()=>new Response('x'.repeat(1024*1024+1)));
 await assert.rejects(client.channels(),error=>error.getStatus()===502);
});
