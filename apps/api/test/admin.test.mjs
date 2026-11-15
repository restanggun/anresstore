import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdminController } from '../dist/admin/admin.controller.js';
import { mergeProducts } from '../dist/admin/admin-store.js';
import { CatalogController } from '../dist/catalog/catalog.controller.js';
const admin='f623c4ef-1eb2-49fb-ae0d-123456789012';
const res={setHeader(){}};
const token=(claims={})=>`header.${Buffer.from(JSON.stringify({sub:admin,aal:'aal2',exp:Math.floor(Date.now()/1000)+3600,...claims})).toString('base64url')}.signature`;
const req={headers:{cookie:`anres_access=${token()}`,origin:'http://localhost:3001'}};
const config={ADMIN_USER_IDS:admin,SUPABASE_URL:'https://db.example',SUPABASE_PUBLISHABLE_KEY:'public-key',SUPABASE_SECRET_KEY:'server-key',CORS_ORIGINS:'http://localhost:3001',ADMIN_ALLOWED_ORIGINS:'http://localhost:3001'};
async function isolated(fn){const env={...process.env},original=global.fetch;Object.assign(process.env,config);try{await fn();}finally{global.fetch=original;process.env=env;}}
test('admin is denied when unconfigured, anonymous, or not allowlisted; metadata cannot grant access',()=>isolated(async()=>{
 const c=new AdminController();delete process.env.ADMIN_USER_IDS;
 await assert.rejects(c.session(req,res),e=>e.getStatus()===503);
 process.env.ADMIN_USER_IDS=admin;
 await assert.rejects(c.session({headers:{}},res),e=>e.getStatus()===401);
 global.fetch=async()=>Response.json({id:'other',user_metadata:{role:'admin'}});
 await assert.rejects(c.session(req,res),e=>e.getStatus()===401);
 global.fetch=async()=>Response.json({id:admin});
 assert.equal((await c.session(req,res)).id,admin);
}));
test('admin requires verified MFA claims and an unexpired token for the verified user',()=>isolated(async()=>{
 const c=new AdminController(); global.fetch=async()=>Response.json({id:admin});
 const withToken=value=>({headers:{...req.headers,cookie:`anres_access=${value}`}});
 await assert.rejects(c.session(withToken(token({aal:'aal1'})),res),e=>e.getStatus()===403);
 await assert.rejects(c.session(withToken(token({sub:'other'})),res),e=>e.getStatus()===401);
 await assert.rejects(c.session(withToken(token({exp:1})),res),e=>e.getStatus()===401);
 await assert.rejects(c.session(withToken('malformed'),res),e=>e.getStatus()===401);
 global.fetch=async()=>new Response('',{status:401});
 await assert.rejects(c.session(req,res),e=>e.getStatus()===401);
}));
test('MFA challenge requires an allowed origin and verified factor; successful verification stores HttpOnly cookies',()=>isolated(async()=>{
 const factor='f623c4ef-1eb2-49fb-ae0d-123456789011', challenge='f623c4ef-1eb2-49fb-ae0d-123456789010';
 const aal1={headers:{...req.headers,cookie:`anres_access=${token({aal:'aal1'})}`}};
 const cookies=[];const response={setHeader(){},cookie(...args){cookies.push(args);}};
 let verified=false;
 global.fetch=async(url)=>{
  url=String(url);
  if(url.endsWith('/user'))return Response.json({id:admin,factors:[{id:factor,status:'verified',factor_type:'totp'}]});
  if(url.endsWith('/challenge'))return Response.json({id:challenge});
  if(url.endsWith('/verify')){verified=true;return Response.json({access_token:token(),refresh_token:'refresh-secret'});}
  throw new Error('unexpected request');
 };
 const c=new AdminController();
 await assert.rejects(c.mfaChallenge({factorId:factor},{headers:{...aal1.headers,origin:'https://evil.example'}},response),e=>e.getStatus()===403);
 await assert.rejects(c.mfaVerify({factorId:factor,challengeId:challenge,code:'bad'},aal1,response),e=>e.getStatus()===400);
 await c.mfaChallenge({factorId:factor},aal1,response);
 await c.mfaVerify({factorId:factor,challengeId:challenge,code:'123456'},aal1,response);
 assert.equal(verified,true);assert.equal(cookies.length,3);assert.ok(cookies.every(c=>c[2].httpOnly));
}));
test('payment listing has pagination and never selects guest hashes or gateway details',()=>isolated(async()=>{
 const calls=[];global.fetch=async(url)=>{calls.push(String(url));return Response.json(String(url).endsWith('/user')?{id:admin}:Array.from({length:51},(_,i)=>({id:i})));};
 const result=await new AdminController().records('payments','1',req,res);
 assert.equal(result.rows.length,50);assert.equal(result.hasMore,true);
 assert.match(calls[1],/offset=50/);assert.doesNotMatch(calls[1],/access_hash|request_hash|details/);
 assert.match(decodeURIComponent(calls[1]),/payment_mode=in\.\(live,sandbox\)/);
 for(const mode of ['live','sandbox']){
  calls.length=0;
  await new AdminController().records('fulfillment','0',req,res,mode);
  assert.ok(decodeURIComponent(calls[1]).includes(`payment_mode=eq.${mode}`));
 }
 await assert.rejects(new AdminController().records('fulfillment','0',req,res,'invalid'),e=>e.getStatus()===400);
 await assert.rejects(new AdminController().records('secrets','0',req,res),e=>e.getStatus()===404);
 await assert.rejects(new AdminController().records('orders','-1',req,res),e=>e.getStatus()===400);
}));
const product={id:admin,provider:'custom',provider_code:'SKU',category:'game',product:'Test game',product_slug:'test-game',name:'10 credits',price:12000,description:'Test',active:true};
test('system monitor reports exact live counts and fails closed when database is unavailable',()=>isolated(async()=>{
 let count=0;const urls=[];
 global.fetch=async(url,options={})=>{
  urls.push(String(url));
  if(String(url).endsWith('/auth/v1/user'))return Response.json({id:admin});
  if(options.method==='HEAD'){count++;return new Response(null,{status:200,headers:{'content-range':`0-0/${count===1?2:0}`}});}
  throw new Error('unexpected request');
 };
 const c=new AdminController();const result=await c.operationalStatus(req,res);
 assert.equal(result.status,'attention');assert.equal(result.checks[0].count,2);assert.equal(result.checks.length,17);
 assert.equal(count,17);
 assert.ok(urls.some(url=>url.includes("premium_orders?select=id&payment_mode=eq.live")));
 global.fetch=async(url,options={})=>String(url).endsWith('/auth/v1/user')?Response.json({id:admin}):new Response(null,{status:503});
 await assert.rejects(c.operationalStatus(req,res),e=>e.getStatus()===503);
}));
test('product writes require allowed origin, validate prices, and whitelist saved fields',()=>isolated(async()=>{
 let saved;global.fetch=async(url,options)=>{if(String(url).endsWith('/user'))return Response.json({id:admin});if(!options.body)return Response.json([]);saved=JSON.parse(options.body);return Response.json([saved]);};
 const c=new AdminController();
 await assert.rejects(c.saveProduct(product,{headers:{...req.headers,origin:'https://evil.example'}},res),e=>e.getStatus()===403);
 await assert.rejects(c.saveProduct({...product,price:0},req,res),e=>e.getStatus()===400);
 await assert.rejects(c.saveProduct({...product,cost_price:-1},req,res),e=>e.getStatus()===400);
 await assert.rejects(c.saveProduct({...product,category:'invalid'},req,res),e=>e.getStatus()===400);
 await c.saveProduct({...product,cost_price:7000,access_hash:'should-never-save'},req,res);
 assert.equal(saved.provider,'custom');assert.equal(saved.cost_price,7000);assert.equal(saved.access_hash,undefined);
}));
test('catalog preserves distinct providers with identical SKUs, hides disabled VIP products, and shares prices with checkout feed',()=>isolated(async()=>{
 const base={code:'SKU',category:'game',product:'Test game',productSlug:'test-game',name:'10 credits',price:9000};
 const items=mergeProducts([base],[product,{...product,id:'other',provider:'another'}, {...product,provider:'vipayment',active:false}], 'game');
 assert.equal(items.length,2);assert.equal(new Set(items.map(i=>i.code)).size,2);assert.equal(items[0].price,12000);
 process.env.ADMIN_CATALOG_ENABLED='true';delete process.env.VIPAYMENT_API_ID;delete process.env.VIPAYMENT_API_KEY;
 global.fetch=async url=>Response.json(String(url).includes('/catalog_versions')?[{version:0}]:[product]);
 const feed=await new CatalogController().list('game');
 assert.equal(feed.items[0].code,`managed.${admin}`);assert.equal(feed.products[0].minPrice,12000);
}));
test('support status can be updated; invalid status cannot be stored',()=>isolated(async()=>{
 global.fetch=async(url)=>Response.json(String(url).endsWith('/user')?{id:admin}:[{id:admin,status:'closed'}]);
 const c=new AdminController();assert.equal((await c.support(admin,{status:'closed'},req,res)).status,'closed');
 await assert.rejects(c.support(admin,{status:'paid'},req,res),e=>e.getStatus()===400);
}));
test('audit storage failure blocks a support update',()=>isolated(async()=>{
 let updated=false;
 global.fetch=async(url)=>{url=String(url);if(url.endsWith('/user'))return Response.json({id:admin});if(url.includes('admin_audit_log'))return new Response('',{status:503});updated=true;return Response.json([]);};
 await assert.rejects(new AdminController().support(admin,{status:'closed'},req,res),e=>e.getStatus()===503);
 assert.equal(updated,false);
}));

test('reopening an existing provider SKU preserves its public UUID across admin pages',()=>isolated(async()=>{
 const existingId='f623c4ef-1eb2-49fb-ae0d-123456789099';let saved;
 global.fetch=async(url,options)=>{
  if(String(url).endsWith('/user'))return Response.json({id:admin});
  if(!options.body)return Response.json(String(url).includes('id=eq.') ? [] : [{id:existingId}]);
  saved=JSON.parse(options.body);return Response.json([saved]);
 };
 await new AdminController().saveProduct(product,req,res);
 assert.equal(saved.id,existingId);assert.equal(saved.provider_code,'SKU');
}));
test('scoped roles cannot read other services, manage access, or modify a product in another category',()=>isolated(async()=>{
 const other='f623c4ef-1eb2-49fb-ae0d-123456789099'; const roleId='f623c4ef-1eb2-49fb-ae0d-123456789098';
 const scoped={headers:{...req.headers,cookie:`anres_access=${token({sub:other})}`}};
 global.fetch=async(url)=>{
  url=String(url);
  if(url.endsWith('/user'))return Response.json({id:other});
  if(url.includes('/admin_assignments'))return Response.json([{role_id:roleId,is_super:false}]);
  if(url.includes('/admin_roles'))return Response.json([{permissions:['products.read','products.write'],categories:['game'],product_slugs:['test-game']}]);
  if(url.includes('/managed_products') && url.includes('id=eq.'))return Response.json([{id:product.id,category:'apps'}]);
  return Response.json([]);
 };
 const c=new AdminController();
 await assert.rejects(c.catalog('apps',scoped,res),e=>e.getStatus()===403);
 await assert.rejects(c.records('payments','0',scoped,res),e=>e.getStatus()===403);
 await assert.rejects(c.accessList(scoped,res),e=>e.getStatus()===403);
 await assert.rejects(c.saveProduct({...product,product_slug:'other-game'},scoped,res),e=>e.getStatus()===403);
 await assert.rejects(c.saveProduct(product,scoped,res),e=>e.getStatus()===403);
}));

test('MFA enrollment is allowlisted and returns a browser-ready QR without exposing it in status',()=>isolated(async()=>{
 const c=new AdminController();
 const factor='f623c4ef-1eb2-49fb-ae0d-123456789011';
 const aal1={headers:{...req.headers,cookie:`anres_access=${token({aal:'aal1'})}`}};
 let created=0;
 global.fetch=async(url)=>{
  if(String(url).endsWith('/user'))return Response.json({id:admin,factors:[]});
  created++;return Response.json({id:factor,totp:{secret:'test-secret',qr_code:'<?xml version="1.0"?>\n<!-- Generated by SVGo -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'}});
 };
 delete process.env.ADMIN_MFA_ENROLLMENT_USER_IDS;
 assert.equal((await c.mfaStatus(aal1,res)).enrollmentAllowed,false);
 await assert.rejects(c.mfaEnroll(aal1,res),e=>e.getStatus()===403);
 assert.equal(created,0);
 process.env.ADMIN_MFA_ENROLLMENT_USER_IDS=admin;
 assert.deepEqual(await c.mfaStatus(aal1,res),{factors:[],enrollmentAllowed:true});
 const enrolled=await c.mfaEnroll(aal1,res);
 assert.equal(enrolled.id,factor);assert.equal(enrolled.secret,'test-secret');
 assert.ok(enrolled.qrCode.startsWith('data:image/svg+xml;base64,'));
 assert.ok(Buffer.from(enrolled.qrCode.split(',')[1],'base64').toString().includes('<svg'));
 global.fetch=async()=>Response.json({id:admin,factors:[{id:factor,status:'verified',factor_type:'totp'}]});
 assert.equal((await c.mfaStatus(aal1,res)).enrollmentAllowed,false);
 await assert.rejects(c.mfaEnroll(aal1,res),e=>e.getStatus()===403);
}));

test('management includes hidden variants across pages and preserves access scope',()=>isolated(async()=>{
 const c=new AdminController(); const calls=[];
 c.catalogReader.list=async()=>({items:[{code:'SKU',productSlug:'test-game',price:12000}],products:[]});
 const hidden={...product,active:false};
 global.fetch=async(url)=>{url=String(url);calls.push(url);if(url.endsWith('/user'))return Response.json({id:admin});return Response.json(url.includes('offset=0')?Array.from({length:500},(_,i)=>({...hidden,id:String(i)})):[{...hidden,id:'last'}]);};
 const result=await c.productManagement('game',req,res);
 assert.equal(result.managed.length,501);assert.equal(result.managed[500].active,false);assert.equal(result.items[0].code,'SKU');assert.ok(calls.some(u=>u.includes('offset=500')));assert.equal(result.canWrite,true);
 c.catalogReader.list=async()=>{throw new Error('provider unavailable');};
 const fallback=await c.productManagement('game',req,res);
 assert.equal(fallback.providerAvailable,false);assert.equal(fallback.managed.length,501);
}));

test('every saved variant remains in the public catalog beyond the database page limit',()=>isolated(async()=>{
 process.env.ADMIN_CATALOG_ENABLED='true';
 const {managedCatalog}=await import('../dist/admin/admin-store.js');
 global.fetch=async url=>Response.json(String(url).includes('offset=0')?Array.from({length:500},(_,i)=>({...product,id:`item-${i}`,provider_code:`sku-${i}`})):[{...product,id:'last',provider_code:'last-sku'}]);
 const items=await managedCatalog([],'game');
 assert.equal(items.length,501);assert.ok(items.some(i=>i.code==='managed.last'));
}));

test('product overrides preserve supplier fulfillment metadata and cannot revive unavailable SKUs',()=>{
 const supplier={code:'ML-1',category:'game',product:'Mobile Legends',productSlug:'mobile-legends',name:'86 Diamonds',displayName:'86 Diamonds',price:23000,providerCost:21000,group:'Mobile Legends Indonesia',type:'diamonds',brand:'Mobile Legends',section:'Diamonds',description:''};
 const override={...product,provider:'vipayment',provider_code:'ML-1',name:'86 Diamond',product:'Mobile Legends',product_slug:'mobile-legends',price:25000};
 const [item]=mergeProducts([supplier],[override],'game');
 assert.equal(item.price,25000);assert.equal(item.providerCost,21000);assert.equal(item.group,supplier.group);assert.equal(item.section,supplier.section);
 assert.deepEqual(mergeProducts([],[override],'game'),[]);
});

test('social packages keep supplier code separate and scale authoritative cost without publishing unselected services',()=>{
 const source={code:'17',category:'social',name:'TikTok Likes',displayName:'TikTok Likes',product:'TikTok',productSlug:'tiktok',group:'TikTok Likes',type:'social',brand:'TikTok',section:'Likes',description:'',price:8000,providerCost:6497,minimum:100,maximum:50000};
 const managed={...product,id:'social-package',category:'social',provider:'vipayment',provider_code:'17-500',supplier_code:'17',service_quantity:500,product:'TikTok',product_slug:'tiktok',name:'500 Likes',price:5000,fulfillment_mode:'vipayment'};
 const [item]=mergeProducts([],[managed],'social',[source]);
 assert.equal(item.code,'managed.social-package');assert.equal(item.providerServiceCode,'17');assert.equal(item.serviceQuantity,500);assert.equal(item.providerCost,3249);assert.equal(item.price,5000);
 assert.deepEqual(mergeProducts([],[{...managed,service_quantity:50}],'social',[source]),[]);
 const [manual]=mergeProducts([],[{...product,category:'tasks',provider:'manual',fulfillment_mode:'manual'}],'tasks');
 assert.equal(manual.fulfillmentMode,'manual');assert.equal(manual.providerCost,undefined);
});

test('manual work updates require write permission and preserve payment state with a conditional update',()=>isolated(async()=>{
 let written;global.fetch=async(url,options={})=>{url=String(url);if(url.endsWith('/user'))return Response.json({id:admin});if(url.includes('admin_audit_log'))return Response.json([]);if(options.method==='PATCH'){written={url,body:JSON.parse(options.body)};return Response.json([written.body]);}return Response.json([{fulfillment_status:'ready'}]);};
 const c=new AdminController();await c.manualFulfillment(admin,{status:'processing',note:'Mulai pengerjaan'},req,res);
 assert.equal(written.body.fulfillment_status,'processing');assert.equal(written.body.payment_status,undefined);assert.ok(written.url.includes('payment_status=eq.paid'));assert.ok(written.url.includes('fulfillment_mode=eq.manual'));
 await assert.rejects(c.manualFulfillment(admin,{status:'paid',note:'invalid'},req,res),e=>e.getStatus()===400);
}));


test('catalog lifecycle publishes edits, hides, removes and restores variants through the public feed',()=>isolated(async()=>{
 process.env.ADMIN_CATALOG_ENABLED='true';
 const store=new Map();const controller=new AdminController();const publicCatalog=new CatalogController();
 global.fetch=async(url,options={})=>{
  url=String(url);
  if(url.endsWith('/user'))return Response.json({id:admin});
  if(url.includes('/catalog_versions'))return Response.json([{version:0}]);
  if(url.includes('/admin_audit_log')||url.includes('/catalog_promotions'))return Response.json([]);
  if(!url.includes('/managed_products'))throw new Error('Unexpected request');
  const params=new URL(url).searchParams;
  if(options.method==='POST'){
   const row=JSON.parse(options.body);store.set(row.id,row);return Response.json([row]);
  }
  const rows=[...store.values()].filter(row=>['id','category','provider','provider_code'].every(field=>!params.has(field)||params.get(field)===`eq.${row[field]}`));
  if(options.method==='PATCH'){for(const row of rows)Object.assign(row,JSON.parse(options.body));}
  return Response.json(rows);
 };
 const variant={...product,provider:'manual',category:'tasks',description:'Baris pertama\nBaris kedua'};
 await controller.saveProduct(variant,req,res);
 let feed=await publicCatalog.list('tasks');assert.equal(feed.items.length,1);assert.equal(feed.items[0].price,12000);
 await controller.saveProduct({...variant,name:'Paket diperbarui',product:'Produk baru',product_slug:'produk-baru',price:18000},req,res);
 feed=await publicCatalog.list('tasks');assert.equal(feed.items[0].displayName,'Paket diperbarui');assert.equal(feed.products[0].slug,'produk-baru');assert.equal(feed.items[0].price,18000);
 await controller.saveProduct({...variant,active:false},req,res);
 assert.equal((await publicCatalog.list('tasks')).items.length,0);
 await controller.saveProduct(variant,req,res);
 await controller.removeProduct(variant,req,res);
 assert.equal((await publicCatalog.list('tasks')).items.length,0);assert.ok(store.get(variant.id).deleted_at);
 await controller.saveProduct(variant,req,res);
 assert.equal((await publicCatalog.list('tasks')).items.length,1);assert.equal(store.get(variant.id).deleted_at,null);
}));

test('deleted default supplier variants never reappear and unavailable services can be hidden',()=>isolated(async()=>{
 const supplier={code:'SKU',category:'game',product:'Test',productSlug:'test',name:'Test',displayName:'Test',price:12000};
 assert.deepEqual(mergeProducts([supplier],[{...product,provider:'vipayment',active:true,deleted_at:new Date().toISOString()}],'game'),[]);
 const c=new AdminController();c.catalogReader.list=async()=>{throw new Error('Provider unavailable');};
 global.fetch=async(url,options={})=>Response.json(String(url).endsWith('/user')?{id:admin}:options.method==='POST'&&String(url).includes('managed_products')?[JSON.parse(options.body)]:[]);
 await c.saveProduct({...product,provider:'vipayment',supplier_code:'SKU',active:false},req,res);
}));

test('saved active supplier variants can change presentation during an outage, but activation and service changes still require availability',()=>isolated(async()=>{
 const stored={...product,provider:'vipayment',supplier_code:'SKU',fulfillment_mode:'vipayment',service_quantity:1,active:true};
 const c=new AdminController();let writes=0;
 c.catalogReader.list=async()=>{throw new Error('Provider unavailable');};
 global.fetch=async(url,options={})=>{
  if(String(url).endsWith('/user'))return Response.json({id:admin});
  if(String(url).includes('/managed_products')){
   if(options.method==='POST'){writes++;return Response.json([JSON.parse(options.body)]);}
   return Response.json([stored]);
  }
  return Response.json([]);
 };
 const result=await c.saveProduct({...stored,name:'Nama baru',price:15000,product:'Induk baru',product_slug:'induk-baru'},req,res);
 assert.equal(result.product.name,'Nama baru');assert.equal(result.product.price,15000);assert.equal(result.product.product_slug,'induk-baru');assert.equal(writes,1);
 await assert.rejects(c.saveProduct({...stored,supplier_code:'OTHER'},req,res),/Provider unavailable/);
 stored.active=false;
 await assert.rejects(c.saveProduct({...stored,active:true},req,res),/Provider unavailable/);
 assert.equal(writes,1);
}));

test('hiding a Mobile Legends Weekly Pass persists its supplier override and removes it from a refreshed public catalog',()=>isolated(async()=>{
 process.env.ADMIN_CATALOG_ENABLED='true';process.env.VIPAYMENT_API_ID='test';process.env.VIPAYMENT_API_KEY='key';
 let stored;
 const weekly={...product,provider:'vipayment',provider_code:'ML-WEEKLY',supplier_code:'ML-WEEKLY',product:'Mobile Legends',product_slug:'mobile-legends',name:'Global Weekly Pass',active:false};
 global.fetch=async(url,options={})=>{
  url=String(url);
  if(url.endsWith('/user'))return Response.json({id:admin});
  if(url.includes('vip-reseller'))return Response.json({result:true,data:[{code:'ML-WEEKLY',game:'Mobile Legends A',name:'Global Weekly Pass',status:'available',price:{basic:10000}}]});
  if(url.includes('/catalog_versions'))return Response.json([{version:1}]);
  if(url.includes('/managed_products')){
   if(options.method==='POST')stored=JSON.parse(options.body);
   return Response.json(stored?[stored]:[]);
  }
  return Response.json([]);
 };
 const publicCatalog=new CatalogController();
 assert.ok((await publicCatalog.list('game')).items.some(item=>item.code==='ML-WEEKLY'));
 await new AdminController().saveProduct(weekly,req,res);
 assert.equal(stored.active,false);
 assert.equal((await publicCatalog.list('game')).items.some(item=>item.code==='ML-WEEKLY'),false);
 assert.equal((await new CatalogController().list('game')).items.some(item=>item.code==='ML-WEEKLY'),false);
}));


test('promotion writes validate the current base price and schedule before changing public discounts',()=>isolated(async()=>{
 const c=new AdminController();let saved;
 c.catalogReader.list=async()=>({items:[{code:'SKU',price:10000,promotion:{originalPrice:12000},productSlug:'test-game'}]});
 global.fetch=async(url,options={})=>{
  if(String(url).endsWith('/user'))return Response.json({id:admin});
  if(String(url).includes('/catalog_promotions')){saved=JSON.parse(options.body);return Response.json([saved]);}
  return Response.json([]);
 };
 const promotion={category:'game',item_code:'SKU',sale_price:11000,starts_at:'2026-11-15T00:00:00Z',ends_at:'2026-11-16T00:00:00Z',active:true};
 await c.savePromotion(promotion,req,res);assert.equal(saved.sale_price,11000);
 await assert.rejects(c.savePromotion({...promotion,sale_price:12000},req,res),error=>error.getStatus()===400);
 await assert.rejects(c.savePromotion({...promotion,ends_at:promotion.starts_at},req,res),error=>error.getStatus()===400);
 c.catalogReader.list=async()=>({items:[]});
 await assert.rejects(c.savePromotion(promotion,req,res),error=>error.getStatus()===400);
}));
