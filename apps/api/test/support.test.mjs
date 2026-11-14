import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ConversationsController} from '../dist/help/conversations.controller.js';
import {AdminController} from '../dist/admin/admin.controller.js';
const customer='aaaaaaaa-0000-4000-8000-000000000001',id='bbbbbbbb-0000-4000-8000-000000000001';
const req={},res={setHeader(){}};
async function isolated(fn){const oldFetch=global.fetch,env={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://support.example',SUPABASE_SECRET_KEY:'sb_secret_test'});try{await fn();}finally{global.fetch=oldFetch;process.env=env;}}
function admin(){const controller=new AdminController();controller.authorize=async()=>({id:customer,permissions:['support.read','support.write'],categories:['game','prepaid','apps','social','tasks'],productSlugs:[]});controller.audit=async()=>{};return controller;}
test('customer ticket creation stores context atomically and uses authenticated owner',()=>isolated(async()=>{
 const controller=new ConversationsController();controller.user=async()=>customer;const calls=[];
 global.fetch=async(url,options)=>{calls.push([String(url),options]);return Response.json(String(url).includes('/rpc/')?[{id}]:[]);};
 assert.deepEqual(await controller.create({id,subject:'Bantuan pesanan',body:'AI: konteks',user_id:'forged'},req,res),{id});
 const rpc=calls.find(([url])=>url.includes('/rpc/create_support_ticket'));
 assert.deepEqual(JSON.parse(rpc[1].body),{p_id:id,p_user:customer,p_subject:'Bantuan pesanan',p_body:'AI: konteks'});
}));
test('customer cannot read another account ticket',()=>isolated(async()=>{
 const controller=new ConversationsController();controller.user=async()=>customer;
 global.fetch=async(url)=>{assert.ok(String(url).includes(`user_id=eq.${customer}`));return Response.json([]);};
 await assert.rejects(controller.messages(id,'0',req,res),e=>e.getStatus()===404);
}));
test('staff must accept a waiting ticket before replying',()=>isolated(async()=>{
 global.fetch=async()=>Response.json([{status:'new'}]);
 await assert.rejects(admin().reply(id,{id:customer,body:'Halo'},req,res),e=>e.getStatus()===409);
}));
test('ticket rejection requires a reason and records it',()=>isolated(async()=>{
 const controller=admin();await assert.rejects(controller.conversationStatus(id,{status:'rejected'},req,res),e=>e.getStatus()===400);
 global.fetch=async(url,options)=>{assert.equal(options.method,'PATCH');assert.equal(JSON.parse(options.body).rejection_reason,'Duplikat');return Response.json([{id,status:'rejected'}]);};
 assert.equal((await controller.conversationStatus(id,{status:'rejected',reason:' Duplikat '},req,res)).status,'rejected');
}));
test('admin creation validates customer existence',()=>isolated(async()=>{
 global.fetch=async()=>Response.json([]);
 await assert.rejects(admin().createConversation({id,user_id:customer,subject:'Bantuan'},req,res),e=>e.getStatus()===404);
}));
