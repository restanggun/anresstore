import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

test('login and dashboard history connect through HTTP API with account-isolated database queries',async()=>{
 const userId='aaaaaaaa-0000-4000-8000-000000000021',invoice='bbbbbbbb-0000-4000-8000-000000000021';
 const user={id:userId,email:'dashboard-test@example.com',user_metadata:{full_name:'Pengguna Uji'}};
 const payment={id:invoice,owner_user_id:userId,guest_session_hash:null,access_hash:'private',request_hash:'private',created_at:new Date().toISOString(),product_name:'Mobile Legends · 86 Diamonds',amount:20000,method:'BRIVA',status:'paid',reference:'TEST-INVOICE',details:{amount:20500,fee_customer:500},review_required:false,payment_mode:'sandbox'};
 const queries=[];let unavailable=false;
 const database=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  res.setHeader('Content-Type','application/json');
  if(req.url==='/rest/v1/rpc/consume_payment_rate')return res.end('true');
  if(req.url.startsWith('/auth/v1/token'))return res.end(JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',user,expires_in:3600}));
  if(req.url==='/auth/v1/user'){
   if(req.headers.authorization!=='Bearer test-access'){res.statusCode=401;return res.end('{}');}
   return res.end(JSON.stringify(user));
  }
  if(req.url.startsWith('/rest/v1/users'))return res.end(JSON.stringify([{full_name:'Pengguna Uji'}]));
  if(req.url.startsWith('/rest/v1/payments')){
   queries.push(req.url);
   if(unavailable){res.statusCode=503;return res.end('{}');}
   // Even a misbehaving datastore must not expose another account's row.
   return res.end(JSON.stringify([payment,{...payment,id:'cccccccc-0000-4000-8000-000000000021',owner_user_id:'dddddddd-0000-4000-8000-000000000021'}]));
  }
  res.end('[]');
 });
 await new Promise(resolve=>database.listen(0,'127.0.0.1',resolve));
 const server=spawn(process.execPath,['dist/main.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'test',PORT:'4156',SUPABASE_URL:`http://127.0.0.1:${database.address().port}`,SUPABASE_PUBLISHABLE_KEY:'public-test',SUPABASE_SECRET_KEY:'sb_secret_test',CORS_ORIGINS:'http://localhost:3000',PAYMENT_RECONCILIATION_ENABLED:'false',VIPAYMENT_FULFILLMENT_ENABLED:'false'},stdio:'ignore'});
 const base='http://127.0.0.1:4156/v1';
 try {
  let ready=false;for(let i=0;i<300;i++){try{if((await fetch(`${base}/health`)).ok){ready=true;break;}}catch{}await delay(100);}
  assert.ok(ready,'API did not start');
  const login=await fetch(`${base}/auth/login`,{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:'test-password'})});
  assert.equal(login.status,201);
  const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const response=await fetch(`${base}/payments/transactions?page=0&scope=account&userId=forged`,{headers:{cookie}});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const history=await response.json();assert.equal(history.userId,userId);assert.equal(history.payments.length,1);assert.equal(history.payments[0].id,invoice);assert.equal(history.payments[0].status,'paid');assert.equal(history.payments[0].total,20500);
  assert.ok(queries[0].includes(`owner_user_id.eq.${userId}`));assert.ok(!queries[0].includes('forged'));
  assert.doesNotMatch(JSON.stringify(history.payments),/access_hash|request_hash|owner_user_id/);
  const guest=await fetch(`${base}/payments/transactions?scope=account`);assert.equal(guest.status,401);
  const expired=await fetch(`${base}/payments/transactions?scope=account`,{headers:{cookie:'anres_access=expired'}});assert.equal(expired.status,401);
  unavailable=true;
  const failed=await fetch(`${base}/payments/transactions?scope=account`,{headers:{cookie}});assert.equal(failed.status,503);
 } finally {server.kill();await new Promise(resolve=>database.close(resolve));}
});
