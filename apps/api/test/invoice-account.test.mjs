import {test} from 'node:test';
import assert from 'node:assert/strict';
import {InvoiceAccountService} from '../dist/payments/invoice-account-service.js';
import {invoiceCsv} from '../dist/payments/invoice-export.js';
import {ownsPayment} from '../dist/payments/payment-contract.js';
const user='aaaaaaaa-0000-4000-8000-000000000001';
const challenge='bbbbbbbb-0000-4000-8000-000000000001';
const invoice='ANRS-261115-ABCDEF12345678';
const identity={userId:user,email:'buyer@example.com',emailVerified:true,guestHash:'a'.repeat(64)};
test('guest linking requires verified account and original browser identity',async()=>{
 let calls=0;const service=new InvoiceAccountService({request:async()=>{calls++;return 1;}});
 assert.equal(await service.attach({...identity,emailVerified:false}),0);
 assert.equal(await service.attach({...identity,userId:null}),0);
 assert.equal(await service.attach({...identity,guestHash:null}),0);
 assert.equal(calls,0);assert.equal(await service.attach(identity),1);
});
test('recovery requires matching email proof and does not expose session tokens',async()=>{
 const calls=[];let allowed=true,proofUser=user;
 const service=new InvoiceAccountService({request:async(path,method,body)=>{
  calls.push({path,body});if(path.endsWith('consume_invoice_recovery_attempt'))return allowed;
  if(path.endsWith('complete_invoice_recovery'))return invoice;
 }});
 const auth=[];service.auth=async(path,body)=>{auth.push({path,body});return {access_token:'private-token',user:{id:proofUser,email:identity.email,email_confirmed_at:'2026-01-01'}};};
 const request=await service.request(identity,invoice);
 assert.equal(request.expiresIn,600);assert.deepEqual(auth[0],{path:'otp',body:{email:identity.email,create_user:false}});
 allowed=false;await assert.rejects(service.verify(identity,challenge,'123456'));assert.equal(auth.length,1);
 allowed=true;proofUser='other-user';let rotated=false;
 await assert.rejects(service.verify(identity,challenge,'123456',()=>{rotated=true;}));
 assert.equal(rotated,false);assert.equal(calls.filter(c=>c.path.endsWith('complete_invoice_recovery')).length,0);
 proofUser=user;const result=await service.verify(identity,challenge,'123456',()=>{rotated=true;});
 assert.equal(rotated,true);assert.deepEqual(result,{invoiceNumber:invoice});assert.doesNotMatch(JSON.stringify(result),/private-token/);
});
test('claim disables guest-cookie access and isolates account ownership',()=>{
 const row={owner_user_id:null,claimed_user_id:user,guest_session_hash:identity.guestHash,created_at:new Date().toISOString()};
 assert.equal(ownsPayment(row,{...identity,userId:null}),false);
 assert.equal(ownsPayment(row,{...identity,userId:'other-user'}),false);
 assert.equal(ownsPayment(row,{...identity,guestHash:null}),true);
});
test('CSV neutralizes spreadsheet formulas and excludes private identifiers',()=>{
 const csv=invoiceCsv([{id:challenge,invoice_number:invoice,product_name:'=SUM(1)',target:'+12345',owner_user_id:'private-owner',guest_session_hash:'private-cookie',access_hash:'secret',amount:1000,details:null}]);
 assert.equal(csv.charCodeAt(0),0xfeff);assert.ok(csv.includes("'=SUM(1)"));assert.ok(csv.includes("'+12345"));
 assert.doesNotMatch(csv,/private-owner|private-cookie|secret/);
});
