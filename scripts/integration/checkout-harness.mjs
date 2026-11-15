import 'reflect-metadata';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {parse} from 'dotenv';
import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
const env=parse(await readFile(process.argv[3] || 'apps/api/.env.sandbox','utf8'));
assert.equal(env.TRIPAY_BASE_URL,'https://tripay.co.id/api-sandbox','Only sandbox credentials allowed');
const callback=process.argv[2];assert.match(callback,/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/v1\/payments\/callback$/);
const catalog=await(await fetch('http://localhost:4000/v1/catalog/game')).json();
const product=catalog.items.find(p=>p.price===2100);assert.ok(product);
Object.assign(process.env,env,{NODE_ENV:'development',TRIPAY_MODE:'live',TRIPAY_BASE_URL:'https://tripay.co.id/api',TRIPAY_CALLBACK_URL:callback,TRIPAY_RETURN_URL:'http://localhost:3000',CORS_ORIGINS:'http://localhost:3000',VIPAYMENT_FULFILLMENT_ENABLED:'true'});
for(const key of ['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY'])delete process.env[key];
const require=createRequire(import.meta.url);
const {PaymentsController}=require('../../apps/api/dist/payments/payments.controller.js');
const {TripayClient}=require('../../apps/api/dist/payments/tripay-client.js');
require('../../apps/api/dist/config/outbound-network.js').configureOutboundNetwork();
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema public,auth to anon,authenticated,service_role;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());create table auth.identities(user_id uuid,provider text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
for(const file of(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
let creates=0,callbacks=0;
const controller=new PaymentsController();
controller.catalog={list:async()=>({items:[product]})};
controller.tripay=new TripayClient(async(input,init)=>{
 const url=new URL(String(input));assert.equal(url.origin,'https://tripay.co.id');assert.ok(url.pathname.startsWith('/api/'));
 url.pathname=url.pathname.replace(/^\/api\//,'/api-sandbox/');
 if(url.pathname.endsWith('/transaction/create'))creates++;
 return fetch(url,init);
});
const ident=s=>{assert.match(s,/^[a-z_]+$/);return '"'+s+'"';};
controller.store={
 async rpc(name,args){
  const fields={consume_payment_rate:['p_key','p_limit','p_seconds'],reserve_payment:['p_payment'],claim_payment_check:['p_id']}[name];assert.ok(fields);
  const vals=fields.map(k=>typeof args[k]==='object'?JSON.stringify(args[k]):args[k]);
  return(await db.query(`select public.${name}(${vals.map((_,i)=>'$'+(i+1)).join(',')}) as result`,vals)).rows[0].result;
 },
 async request(path,method='GET',body){
  const[table,query='']=path.split('?');assert.ok(['payments','live_transactions'].includes(table));
  const params=new URLSearchParams(query),vals=[],filters=[];
  for(const[key,value]of params){if(['select','order','limit','offset'].includes(key))continue;const m=/^(eq|gte|lt)\.(.*)$/s.exec(value);assert.ok(m);vals.push(m[2]);filters.push(`${ident(key)} ${{eq:'=',gte:'>=',lt:'<'}[m[1]]} $${vals.length}`);}
  const where=filters.length?' where '+filters.join(' and '):'';
  if(method==='PATCH'){const updates=Object.entries(body).map(([k,v])=>{vals.push(v&&typeof v==='object'?JSON.stringify(v):v);return `${ident(k)}=$${vals.length}`;});return(await db.query(`update public.${table} set ${updates.join(',')}${where} returning *`,vals)).rows;}
  assert.equal(method,'GET');let suffix='';
  if(params.has('order')){const[c,d]=params.get('order').split('.');assert.ok(['asc','desc'].includes(d));suffix+=` order by ${ident(c)} ${d}`;}
  for(const k of ['limit','offset'])if(params.has(k)){const n=Number(params.get(k));assert.ok(Number.isSafeInteger(n)&&n>=0);suffix+=` ${k} ${n}`;}
  return(await db.query(`select ${params.get('select')?.split(',').map(ident).join(',')||'*'} from public.${table}${where}${suffix}`,vals)).rows;
 }
};
const server=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://localhost:3000');res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.end();return;}
 const url=new URL(req.url,'http://localhost:4100');
 res.cookie=(name,value)=>res.setHeader('Set-Cookie',`${name}=${value}; HttpOnly; SameSite=Lax; Path=/`);
 try{
  let result;
  if(url.pathname==='/test/status')result={sandboxOnly:true,ephemeralDatabase:true,supplierWorker:false,creates,callbacks,rows:(await db.query('select invoice_number,status,reference from public.payments order by created_at desc')).rows};
  else{
   const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>16384)throw new Error('Oversized body');parts.push(part);}
   req.rawBody=Buffer.concat(parts);req.body=req.rawBody.length?JSON.parse(req.rawBody):{};
   if(req.method==='POST'&&url.pathname==='/v1/payments/session')result=await controller.session(req,res);
   else if(req.method==='GET'&&url.pathname==='/v1/payments/channels')result=await controller.channels(req,res);
   else if(req.method==='POST'&&url.pathname==='/v1/payments/transactions')result=await controller.create(req.body,req,res);
   else if(req.method==='GET'&&url.pathname.startsWith('/v1/payments/transactions/'))result=await controller.detail(decodeURIComponent(url.pathname.split('/').at(-1)),req,res);
   else if(req.method==='GET'&&url.pathname==='/v1/payments/transactions')result=await controller.history('0',req,res);
   else if(req.method==='POST'&&url.pathname==='/v1/payments/callback'){result=await controller.callback(req);callbacks++;}
   else{res.statusCode=404;result={message:'Not found'};}
  }
  res.end(JSON.stringify(result));
 }catch(error){res.statusCode=error.getStatus?.()||500;console.error(JSON.stringify({status:res.statusCode,code:error.code,message:error.getResponse?.()||error.message}));res.end(JSON.stringify({message:error.getResponse?.()||'Isolated test error'}));}
});
server.listen(4100,'127.0.0.1');
await writeFile('output/integration-product.json',JSON.stringify({code:product.code,amount:product.price,productSlug:product.productSlug}));
console.log(JSON.stringify({ready:true,api:'http://localhost:4100/v1',sandboxOnly:true,ephemeralDatabase:true,supplierWorker:false}));
for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>server.close(async()=>{await db.close();process.exit(0);}));
