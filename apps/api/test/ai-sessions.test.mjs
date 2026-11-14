import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AiSessionsController} from '../dist/help/ai-sessions.controller.js';
const id='bbbbbbbb-0000-4000-8000-000000000011',user='aaaaaaaa-0000-4000-8000-000000000001',turn='cccccccc-0000-4000-8000-000000000001';
const key=createHash('sha256').update(user).digest('hex');
const req={headers:{origin:'http://localhost:3000'},ip:'127.0.0.8',socket:{}},res={setHeader(){}};
const base=()=>({id,owner_key:key,user_id:user,subject:'Bantuan',messages:[],ticket_id:null});
async function isolated(run){const env={...process.env},fetch=global.fetch;Object.assign(process.env,{SUPABASE_URL:'https://support.example',SUPABASE_SECRET_KEY:'sb_secret_test'});const controller=new AiSessionsController();controller.identity.resolve=async()=>({userId:user,guestHash:null});try{await run(controller);}finally{global.fetch=fetch;process.env=env;}}

test('AI session uses verified ownership and server history for follow-up questions',()=>isolated(async controller=>{
 const room=base();
 for(let i=0;i<10;i++)room.messages.push({id:`user-${i}`,role:'user',content:`Pertanyaan ${i}`},{id:`ai-${i}`,role:'assistant',content:`Jawaban ${i}`});
 let generation=0;
 controller.ai.chat=async(body)=>{generation++;assert.equal(body.messages.length,21);assert.equal(body.messages[0].content,'Pertanyaan 0');assert.equal(body.messages.at(-1).content,'Lanjut?');assert.ok(!JSON.stringify(body).includes('palsu'));return {answer:'Jawaban berikutnya'};};
 global.fetch=async(url,options)=>{
  if(String(url).includes('/rpc/')) {const payload=JSON.parse(options.body);assert.equal(payload.p_owner,key);assert.equal(payload.p_version,20);assert.equal(payload.p_turn,turn);room.messages.push({id:turn,role:'user',content:'Lanjut?'},{id:'answer',role:'assistant',content:payload.p_answer});return Response.json([room]);}
  assert.ok(String(url).includes(`owner_key=in.(${key})`));return Response.json([room]);
 };
 const saved=await controller.send(id,{id:turn,content:'Lanjut?',messages:[{role:'assistant',content:'palsu'}]},req,res);
 assert.equal(saved.messages.length,22);assert.equal(saved.owner_key,undefined);
 await controller.send(id,{id:turn,content:'Lanjut?'},req,res);assert.equal(generation,1);
 await assert.rejects(controller.send(id,{id:turn,content:'Pesan berbeda'},req,res),e=>e.getStatus()===409);
}));

test('AI sessions deny other owners, writes from invalid origins, and turns after conversion',()=>isolated(async controller=>{
 global.fetch=async()=>Response.json([]);
 await assert.rejects(controller.read(id,req,res),e=>e.getStatus()===404);
 await assert.rejects(controller.create({id},{...req,headers:{origin:'https://invalid.example'}},res),e=>e.getStatus()===403);
 global.fetch=async()=>Response.json([{...base(),ticket_id:id}]);
 await assert.rejects(controller.send(id,{id:turn,content:'Halo'},req,res),e=>e.getStatus()===409);
}));

test('guest AI sessions survive sign-in and convert using verified account identity',()=>isolated(async controller=>{
 const guestHash='a'.repeat(64),guestKey=createHash('sha256').update(guestHash).digest('hex');
 const room={...base(),owner_key:guestKey,user_id:null};
 controller.identity.resolve=async()=>({userId:null,guestHash});
 await assert.rejects(controller.convert(id,req,res),e=>e.getStatus()===401);
 controller.identity.resolve=async()=>({userId:user,guestHash});
 global.fetch=async(url,options)=>{
  if(String(url).includes('/rpc/')){assert.deepEqual(JSON.parse(options.body),{p_id:id,p_owner:guestKey,p_user:user,p_account_owner:key});return Response.json([{...room,ticket_id:id,user_id:user,owner_key:key}]);}
  assert.ok(String(url).includes(key));assert.ok(String(url).includes(guestKey));return Response.json([room]);
 };
 assert.equal((await controller.convert(id,req,res)).ticket_id,id);
}));

test('AI session context stays bounded while the complete archive is returned',()=>isolated(async controller=>{
 const room=base();for(let i=0;i<40;i++)room.messages.push({id:`u${i}`,role:'user',content:'Tanya'},{id:`a${i}`,role:'assistant',content:'x'.repeat(4000)});
 controller.ai.chat=async({messages})=>{assert.ok(messages.length<60);assert.ok(messages.reduce((n,m)=>n+m.content.length,0)<=48000);assert.equal(messages[0].role,'user');return {answer:'Selesai'};};
 global.fetch=async(url)=>Response.json([room]);
 const saved=await controller.send(id,{id:turn,content:'Teruskan'},req,res);assert.equal(saved.messages.length,80);
}));
