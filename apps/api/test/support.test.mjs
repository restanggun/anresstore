import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ConversationsController} from '../dist/help/conversations.controller.js';
import {AdminController} from '../dist/admin/admin.controller.js';
import {AiSessionsController} from '../dist/help/ai-sessions.controller.js';
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
test('explicit AI handoff stays available when the AI provider is unavailable',()=>isolated(async()=>{
 const controller=new AiSessionsController();
 const room={id,owner_key:'a'.repeat(64),user_id:customer,subject:'Bantuan',messages:[],ticket_id:null};
 controller.owner=async()=>({key:room.owner_key,keys:[room.owner_key],userId:customer});controller.room=async()=>room;
 controller.ai.chat=async()=>{throw Error('Handoff must not call AI provider');};
 global.fetch=async(url,options)=>{assert.ok(String(url).includes('append_ai_help_turn'));const body=JSON.parse(options.body);assert.ok(body.p_answer.includes('mengalihkan'));return Response.json([{...room,messages:[{id:customer,role:'user',content:body.p_question}]}]);};
 const saved=await controller.send(id,{id:customer,content:'AI kurang membantu, hubungkan saya ke CS'},req,res);
 assert.equal(saved.messages[0].content,'AI kurang membantu, hubungkan saya ke CS');
}));

test('CS requires login and accepts a refresh-only customer session',()=>isolated(async()=>{
 const controller=new ConversationsController();
 await assert.rejects(controller.list('0',{headers:{}},res),error=>error.getStatus()===401);

 process.env.SUPABASE_PUBLISHABLE_KEY='test-key';
 const cookies=[];
 const response={setHeader(){},cookie(name,value){cookies.push([name,value]);}};
 global.fetch=async(url,options)=>{
  const path=new URL(url).pathname;
  if(path==='/auth/v1/token'){
   assert.equal(JSON.parse(options.body).refresh_token,'previous-refresh');
   return Response.json({access_token:'renewed-access',refresh_token:'renewed-refresh',expires_in:3600});
  }
  if(path==='/auth/v1/user'){
   assert.equal(options.headers.Authorization,'Bearer renewed-access');
   return Response.json({id:customer});
  }
  assert.equal(path,'/rest/v1/support_conversations');
  assert.equal(new URL(url).searchParams.get('user_id'),'eq.'+customer);
  return Response.json([{id}]);
 };
 assert.deepEqual(await controller.list('0',{headers:{cookie:'anres_refresh=previous-refresh'}},response),{rows:[{id}],hasMore:false});
 assert.deepEqual(cookies,[['anres_access','renewed-access'],['anres_refresh','renewed-refresh']]);
}));
