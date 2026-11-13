import test from 'node:test';
import assert from 'node:assert/strict';
import { sellingPrice, CatalogController } from '../dist/catalog/catalog.controller.js';
import { mapCatalog } from '../dist/catalog/catalog-mapping.js';
import { createHash } from 'node:crypto';

const game = (overrides = {}) => ({code:'ML14-S14',game:'Mobile Legends A',name:'14 Diamonds',price:{basic:3310,premium:3260,special:3235},status:'available',...overrides});
const prepaid = (overrides = {}) => ({code:'XL1',brand:'XL',type:'paket-internet',prepost:'prepaid',name:'XL Hotrod 3 GB',price:{basic:48225},status:'available',...overrides});

test('markup follows the existing top-up price tiers', () => {
  assert.equal(sellingPrice(5000), 6300);
  assert.equal(sellingPrice(10000), 12000);
  assert.equal(sellingPrice(30000), 34500);
  assert.equal(sellingPrice(60000), 66000);
  assert.equal(sellingPrice(100000), 105000);
});

test('maps actual provider groups and keeps exact service identity and safe selling price', () => {
 const rows = [game(),game({code:'PUBG1',game:'PUBGM INDO A'}),game({code:'FF1',game:'Free Fire Max Global'}),game({code:'H1',game:'Honkai: Star Rail'}),game({code:'N1',game:'Netflix Premium',description:'<b>30 hari</b> akses'})];
 const items = mapCatalog('game',rows);
 assert.equal(items.length,5);
 const ml = items.find(item => item.code === 'ML14-S14');
 assert.equal(ml.product,'Mobile Legends'); assert.equal(ml.productSlug,'mobile-legends'); assert.equal(ml.group,'Mobile Legends A'); assert.equal(ml.price,4200);
 assert.equal(items.find(item => item.code === 'PUBG1').product,'PUBG Mobile');
 assert.equal(items.find(item => item.code === 'FF1').product,'Free Fire');
 assert.equal(items.find(item => item.code === 'H1').product,'Honkai Star Rail');
 const app=items.find(item => item.code === 'N1'); assert.equal(app.category,'apps');assert.equal(app.product,'Netflix');assert.equal(app.description,'30 hari akses');
 assert.ok(!('cost' in ml)); assert.ok(!('basic' in ml));
});

test('does not mix login, gift, jockeying, unknown games or out-of-stock services into top-up', () => {
 const groups=['Mobile Legends Gift','Mobile Legends Joki Ranked','Mobile Legends Vilog','Roblox Via Login','Free Fire Vilog','Mobile Legends (Brazil)','Unknown Game'];
 assert.deepEqual(mapCatalog('game',groups.map((group,i)=>game({code:`TEST${i}`,game:group}))),[]);
 assert.deepEqual(mapCatalog('game',[game({status:'empty'}),game({name:'Login account'}),null,42,[]]),[]);
});

test('maps PPOB by provider type instead of ambiguous product text', () => {
 const rows=[prepaid(),prepaid({code:'P1',type:'pulsa-reguler',name:'Internet promo pulsa'}),prepaid({code:'E1',brand:'DANA',type:'saldo-emoney'}),prepaid({code:'T1',brand:'PLN',type:'token-pln'}),prepaid({code:'X1',type:'not-filtered',name:'DANA internet listrik'}),prepaid({code:'X2',prepost:'postpaid'}),prepaid({code:'X3',type:'voucher-game'})];
 const items=mapCatalog('prepaid',rows);
 assert.equal(items.length,4);
 assert.equal(items.find(item=>item.code==='P1').product,'Pulsa');
 assert.equal(items.find(item=>item.code==='XL1').product,'Paket data');
 assert.equal(items.find(item=>item.code==='E1').product,'E-wallet');
 assert.equal(items.find(item=>item.code==='T1').product,'Token listrik');
});

test('rejects invalid prices and ambiguous duplicate service codes', () => {
 const prices=[null,true,'',0,-1,1.5,'1e3',Infinity,Number.MAX_SAFE_INTEGER,{}, {basic:0}, {premium:100}];
 assert.deepEqual(mapCatalog('game',prices.map((price,i)=>game({code:`PRICE${i}`,price}))),[]);
 assert.deepEqual(mapCatalog('game',[game(),game({name:'Conflicting price',price:9000})]),[]);
 assert.deepEqual(mapCatalog('game',[game({code:'<script>'})]),[]);
 assert.deepEqual(mapCatalog('game',[game({game:'constructor'})]),[]);
 assert.deepEqual(mapCatalog('prepaid',[prepaid({type:'constructor'})]),[]);
});

async function withProvider(fetchMock, run) {
 const previous={id:process.env.VIPAYMENT_API_ID,key:process.env.VIPAYMENT_API_KEY,fetch:globalThis.fetch};
 process.env.VIPAYMENT_API_ID='test-id';process.env.VIPAYMENT_API_KEY='test-key';globalThis.fetch=fetchMock;
 try { await run(new CatalogController()); }
 finally { globalThis.fetch=previous.fetch; for(const [name,value] of [['VIPAYMENT_API_ID',previous.id],['VIPAYMENT_API_KEY',previous.key]]) { if(value===undefined) delete process.env[name]; else process.env[name]=value; } }
}

test('signs server requests, coalesces concurrent loads and caches catalog for one minute', async () => {
 let calls=0;
 await withProvider(async(url,options)=>{
  calls++;assert.equal(url,'https://vip-reseller.co.id/api/game-feature');assert.equal(options.redirect,'error');
  assert.equal(options.body.get('type'),'services');assert.equal(options.body.get('key'),'test-key');
  assert.equal(options.body.get('sign'),createHash('md5').update('test-idtest-key').digest('hex'));
  return Response.json({result:true,data:[game(),game({code:'APP1',game:'Canva Pro'})]});
 },async controller=>{
  const [first,second]=await Promise.all([controller.list('game'),controller.list('game')]);
  const {serverTime:firstTime,...firstCatalog}=first;
  const {serverTime:secondTime,...secondCatalog}=second;
  assert.deepEqual(firstCatalog,secondCatalog);
  assert.ok(Number.isFinite(Date.parse(firstTime)) && Number.isFinite(Date.parse(secondTime)));
  assert.equal(first.items.length,1);assert.equal(first.products[0].name,'Mobile Legends');assert.equal(first.source,'vipayment');
  await controller.list('game');assert.equal(calls,1);
  const now=Date.now;try { Date.now=()=>now()+61000;await controller.list('game');assert.equal(calls,2); } finally {Date.now=now;}
  const apps=await controller.list('apps');assert.equal(apps.items.length,1);assert.equal(apps.items[0].product,'Canva');
  assert.doesNotMatch(JSON.stringify(first),/test-key|test-id/);
 });
});

test('hides provider error details, backs off failures and rejects unknown endpoints', async () => {
 let calls=0;
 await withProvider(async()=>{calls++;return Response.json({result:false,message:'test-key provider internals'});},async controller=>{
  await assert.rejects(()=>controller.list('game'),error=>error.getStatus()===503 && !error.message.includes('test-key'));
  await assert.rejects(()=>controller.list('game'),error=>error.getStatus()===503);assert.equal(calls,1);
  await assert.rejects(()=>controller.list('anything'),error=>error.getStatus()===404);assert.equal(calls,1);
 });
});

test('provider failure never serves stale catalog', async () => {
 let calls=0;
 await withProvider(async()=>{ if(++calls===1) return Response.json({result:true,data:[game()]});throw new Error('network'); },async controller=>{
  await controller.list('game');const now=Date.now;
  try {Date.now=()=>now()+61000;await assert.rejects(()=>controller.list('game'),error=>error.getStatus()===503);} finally {Date.now=now;}
 });
});

test('catalog fails closed when provider credentials are missing', async () => {
  const oldId = process.env.VIPAYMENT_API_ID, oldKey = process.env.VIPAYMENT_API_KEY;
  delete process.env.VIPAYMENT_API_ID; delete process.env.VIPAYMENT_API_KEY;
  try { await assert.rejects(() => new CatalogController().list('game'), error => error.getStatus() === 503); }
  finally { if (oldId !== undefined) process.env.VIPAYMENT_API_ID = oldId; if (oldKey !== undefined) process.env.VIPAYMENT_API_KEY = oldKey; }
});
