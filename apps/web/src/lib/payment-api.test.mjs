import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const auth=moduleUrl(compile(await readFile(new URL('./auth-api.ts',import.meta.url),'utf8')));
const source=compile((await readFile(new URL('./payment-api.ts',import.meta.url),'utf8')).replace('"./auth-api"',JSON.stringify(auth)));
const {submitPayment,forgetPaymentIntent}=await import(moduleUrl(source));
class MemoryStorage{getItem(key){return this[key]??null;}setItem(key,value){this[key]=String(value);}removeItem(key){delete this[key];}}
test('checkout recovers paid intents, retries absent reservations with the same ID and creates a new intent only after explicit reset',async()=>{
 const original={fetch:globalThis.fetch,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),storage:Object.getOwnPropertyDescriptor(globalThis,'localStorage')};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name,callback)=>callback()}}});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:new MemoryStorage()});
 let status='missing',rejectCreate=true;const posts=[];
 const body={source:'game',code:'SKU',target:'12345',method:'QRIS',email:'test@example.com',expectedAmount:2100};
 globalThis.fetch=async(url,init)=>{
  const path=new URL(url).pathname;
  if(path.endsWith('/session'))return Response.json({mode:'guest',scope:'a'.repeat(64)});
  if(init.method==='POST'){const sent=JSON.parse(init.body);posts.push(sent.id);if(rejectCreate)return Response.json({message:'Catalog unavailable'},{status:503});status='pending';return Response.json({id:sent.id,status:'pending'});}
  if(status==='missing')return Response.json({message:'Not found'},{status:404});
  if(status==='outage')return Response.json({message:'Unavailable'},{status:503});
  return Response.json({id:posts.at(-1),status,fulfillment:{status:'failed'}});
 };
 try{
  await assert.rejects(submitPayment(body,()=>{}),e=>e.status===503);
  rejectCreate=false;const first=await submitPayment(body,()=>{});
  assert.equal(posts.length,2);assert.equal(posts[0],posts[1]);assert.equal(first.status,'pending');
  await submitPayment(body,()=>{});assert.equal(posts.length,2);
  status='paid';assert.equal((await submitPayment(body,()=>{})).status,'paid');assert.equal(posts.length,2);
  status='outage';await assert.rejects(submitPayment(body,()=>{}),e=>e.status===503);assert.equal(posts.length,2);
  forgetPaymentIntent(first.id);const second=await submitPayment(body,()=>{});assert.notEqual(second.id,first.id);assert.equal(posts.length,3);
 }finally{globalThis.fetch=original.fetch;for(const [name,descriptor] of [['navigator',original.navigator],['localStorage',original.storage]]){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
