import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdminController } from '../dist/admin/admin.controller.js';
import { mergeProducts } from '../dist/admin/admin-store.js';
import { CatalogController } from '../dist/catalog/catalog.controller.js';
const admin='f623c4ef-1eb2-49fb-ae0d-123456789012';
const res={setHeader(){}};
const req={headers:{cookie:'anres_access=verified-token',origin:'http://localhost:3001'}};
const config={ADMIN_USER_IDS:admin,SUPABASE_URL:'https://db.example',SUPABASE_PUBLISHABLE_KEY:'public-key',SUPABASE_SECRET_KEY:'server-key',CORS_ORIGINS:'http://localhost:3001'};
async function isolated(fn){const env={...process.env},original=global.fetch;Object.assign(process.env,config);try{await fn();}finally{global.fetch=original;process.env=env;}}
test('admin is denied when unconfigured, anonymous, or not allowlisted; metadata cannot grant access',()=>isolated(async()=>{
 const c=new AdminController();delete process.env.ADMIN_USER_IDS;
 await assert.rejects(c.session(req,res),e=>e.getStatus()===503);
 process.env.ADMIN_USER_IDS=admin;
 await assert.rejects(c.session({headers:{}},res),e=>e.getStatus()===401);
 global.fetch=async()=>Response.json({id:'other',user_metadata:{role:'admin'}});
 await assert.rejects(c.session(req,res),e=>e.getStatus()===403);
 global.fetch=async()=>Response.json({id:admin});
 assert.equal((await c.session(req,res)).id,admin);
}));
test('payment listing has pagination and never selects guest hashes or gateway details',()=>isolated(async()=>{
 const calls=[];global.fetch=async(url)=>{calls.push(String(url));return Response.json(String(url).endsWith('/user')?{id:admin}:Array.from({length:51},(_,i)=>({id:i})));};
 const result=await new AdminController().records('payments','1',req,res);
 assert.equal(result.rows.length,50);assert.equal(result.hasMore,true);
 assert.match(calls[1],/offset=50/);assert.doesNotMatch(calls[1],/access_hash|request_hash|details/);
 await assert.rejects(new AdminController().records('secrets','0',req,res),e=>e.getStatus()===404);
 await assert.rejects(new AdminController().records('orders','-1',req,res),e=>e.getStatus()===400);
}));
const product={id:admin,provider:'custom',provider_code:'SKU',category:'game',product:'Test game',product_slug:'test-game',name:'10 credits',price:12000,description:'Test',active:true};
test('product writes require allowed origin, validate prices, and whitelist saved fields',()=>isolated(async()=>{
 let saved;global.fetch=async(url,options)=>{if(String(url).endsWith('/user'))return Response.json({id:admin});if(!options.body)return Response.json([]);saved=JSON.parse(options.body);return Response.json([saved]);};
 const c=new AdminController();
 await assert.rejects(c.saveProduct(product,{headers:{...req.headers,origin:'https://evil.example'}},res),e=>e.getStatus()===403);
 await assert.rejects(c.saveProduct({...product,price:0},req,res),e=>e.getStatus()===400);
 await assert.rejects(c.saveProduct({...product,category:'social'},req,res),e=>e.getStatus()===400);
 await c.saveProduct({...product,access_hash:'should-never-save'},req,res);
 assert.equal(saved.provider,'custom');assert.equal(saved.access_hash,undefined);
}));
test('catalog preserves distinct providers with identical SKUs, hides disabled VIP products, and shares prices with checkout feed',()=>isolated(async()=>{
 const base={code:'SKU',category:'game',product:'Test game',productSlug:'test-game',name:'10 credits',price:9000};
 const items=mergeProducts([base],[product,{...product,id:'other',provider:'another'}, {...product,provider:'vipayment',active:false}], 'game');
 assert.equal(items.length,2);assert.equal(new Set(items.map(i=>i.code)).size,2);assert.equal(items[0].price,12000);
 process.env.ADMIN_CATALOG_ENABLED='true';delete process.env.VIPAYMENT_API_ID;delete process.env.VIPAYMENT_API_KEY;
 global.fetch=async()=>Response.json([product]);
 const feed=await new CatalogController().list('game');
 assert.equal(feed.items[0].code,`managed.${admin}`);assert.equal(feed.products[0].minPrice,12000);
}));
test('support status can be updated; invalid status cannot be stored',()=>isolated(async()=>{
 global.fetch=async(url)=>Response.json(String(url).endsWith('/user')?{id:admin}:[{id:admin,status:'closed'}]);
 const c=new AdminController();assert.equal((await c.support(admin,{status:'closed'},req,res)).status,'closed');
 await assert.rejects(c.support(admin,{status:'paid'},req,res),e=>e.getStatus()===400);
}));

test('reopening an existing provider SKU preserves its public UUID across admin pages',()=>isolated(async()=>{
 const existingId='f623c4ef-1eb2-49fb-ae0d-123456789099';let saved;
 global.fetch=async(url,options)=>{
  if(String(url).endsWith('/user'))return Response.json({id:admin});
  if(!options.body)return Response.json([{id:existingId}]);
  saved=JSON.parse(options.body);return Response.json([saved]);
 };
 await new AdminController().saveProduct(product,req,res);
 assert.equal(saved.id,existingId);assert.equal(saved.provider_code,'SKU');
}));
