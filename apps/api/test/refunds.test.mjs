import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PaymentsController} from '../dist/payments/payments.controller.js';
import {AdminController} from '../dist/admin/admin.controller.js';
const owner='aaaaaaaa-1111-4111-8111-111111111111',id='eeeeeeee-1111-4111-8111-111111111111',ticket='dddddddd-1111-4111-8111-111111111111';
const body={reason:'Produk gagal dikirim',bank:'BCA',accountName:'Pemilik rekening',accountNumber:'1234567890'};
const req={headers:{origin:'http://localhost:3000'},socket:{remoteAddress:'127.0.0.1'}},res={setHeader(){}};
test('refund request verifies identity, ownership, body allowlist and real payment before atomic ticket creation',async()=>{
 const env={...process.env};Object.assign(process.env,{CORS_ORIGINS:'http://localhost:3000'});
 const c=new PaymentsController(),identity={userId:owner,guestHash:null},payment={id,owner_user_id:owner,status:'paid',payment_mode:'live',created_at:new Date().toISOString()};
 let calls=[];c.identities={resolve:async()=>identity};c.row=async()=>payment;c.throttle=async()=>{};
 c.store={request:async(path,method,payload)=>{calls.push({path,method,payload});return [{id:ticket}];}};
 try{
  assert.equal((await c.requestRefund(id,body,req,res)).ticket.id,ticket);
  assert.equal(calls[0].path,'rpc/request_payment_refund');assert.equal(calls[0].payload.p_user,owner);assert.ok(!('p_amount' in calls[0].payload));
  await assert.rejects(c.requestRefund(id,{...body,amount:1},req,res),e=>e.getStatus()===400);
  await assert.rejects(c.requestRefund(id,body,{...req,headers:{origin:'https://evil.example'}},res),e=>e.getStatus()===403);
  identity.userId='bbbbbbbb-1111-4111-8111-111111111111';await assert.rejects(c.requestRefund(id,body,req,res),e=>e.getStatus()===404);
  identity.userId=null;await assert.rejects(c.requestRefund(id,body,req,res),e=>e.getStatus()===401);
  identity.userId=owner;payment.payment_mode='sandbox';await assert.rejects(c.requestRefund(id,body,req,res),e=>e.getStatus()===409);
  assert.equal(calls.length,1);
 }finally{process.env=env;}
});
test('only verified full admins can attest refunds; evidence and audit are mandatory',async()=>{
 const env={...process.env},original=global.fetch;
 Object.assign(process.env,{SUPABASE_URL:'https://refund.example',SUPABASE_SECRET_KEY:'sb_secret_test'});
 const c=new AdminController();let full=false,writes=0,audited=false;
 c.authorize=async()=>({id:owner,superAdmin:full});c.audit=async()=>{audited=true;};
 global.fetch=async(url,options)=>{assert.ok(audited);assert.match(String(url),/rpc\/review_payment_refund$/);writes++;return Response.json([{id:ticket}]);};
 try{
  await assert.rejects(c.reviewRefund(ticket,{status:'in_review',resolution:'Periksa kegagalan supplier'},req,res),e=>e.getStatus()===403);
  full=true;await assert.rejects(c.reviewRefund(ticket,{status:'completed',resolution:'Transfer sudah dilakukan'},req,res),e=>e.getStatus()===400);
  assert.equal(writes,0);
  await c.reviewRefund(ticket,{status:'completed',resolution:'Transfer sudah dilakukan',reference:'BANK-12345'},req,res);assert.equal(writes,1);
  c.audit=async()=>{throw new Error('Audit unavailable');};await assert.rejects(c.reviewRefund(ticket,{status:'in_review',resolution:'Periksa kegagalan supplier'},req,res));assert.equal(writes,1);
 }finally{global.fetch=original;process.env=env;}
});
