import {config} from 'dotenv';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
config({path:fileURLToPath(new URL('../apps/api/.env',import.meta.url)),quiet:true});
const require=createRequire(import.meta.url);
const {PaymentStore}=require('../apps/api/dist/payments/payment-store.js');
const store=new PaymentStore();
const hash=value=>createHash('sha256').update(value).digest('hex');

// Opt-in remote DB regression checks. Creates synthetic SANDBOX SECURITY TEST rows;
// never contacts a payment/product provider and never prints secrets or personal data.
async function main() {
 if(!process.argv.includes('--run'))throw new Error('Pass --run to execute sandbox database checks.');
 const run=randomUUID(),guest=hash(run),id=randomUUID();let createdId;
 try {
  const rates=await Promise.all(Array.from({length:40},()=>store.rpc('consume_payment_rate',{p_key:`security-test:${run}`,p_limit:7,p_seconds:86400})));
  assert.equal(rates.filter(Boolean).length,7);console.log('PASS: shared rate limit is atomic across 40 concurrent requests');
  const payment={id,access_hash:hash(`cap:${run}`),request_hash:hash(`request:${run}`),source:'game',product_name:'SANDBOX SECURITY TEST - NO GATEWAY',provider_code:'SECURITY-TEST',target:`SECURITY-TEST-${run}`,amount:10000,method:'QRIS2',owner_user_id:null,guest_session_hash:guest,checkout_hash:hash(`checkout:${run}`)};
  const reservations=await Promise.all(Array.from({length:12},(_,index)=>store.rpc('reserve_sandbox_payment',{p_payment:{...payment,id:index%2?id:randomUUID()}})));
  assert.equal(reservations.filter(result=>result.claimed).length,1);
  assert.equal(new Set(reservations.map(result=>result.payment.id)).size,1);
  createdId=reservations[0].payment.id;
  console.log('PASS: 12 concurrent same/different IDs yield one database reservation');
  const duplicate=await store.rpc('reserve_sandbox_payment',{p_payment:{...payment,id:randomUUID(),method:'BCAVA',request_hash:hash(`other:${run}`)}});
  assert.equal(duplicate.claimed,false);assert.equal(duplicate.payment.id,createdId);
  await assert.rejects(store.rpc('reserve_sandbox_payment',{p_payment:{...payment,id:createdId,guest_session_hash:hash(`stranger:${run}`)}}));
  await assert.rejects(store.rpc('reserve_sandbox_payment',{p_payment:{...payment,id:createdId,request_hash:hash('tampered')}}));
  console.log('PASS: active payment deduplication and owner/request conflict protection');
  const winners=await Promise.all(['pending','unknown'].map(status=>store.request(`sandbox_payments?id=eq.${createdId}&revision=eq.0`,'PATCH',{status,revision:1})));
  assert.equal(winners.filter(rows=>rows.length===1).length,1);
  let [row]=await store.request(`sandbox_payments?id=eq.${createdId}`);
  assert.equal(row.revision,1);
  if(row.status!=='unknown')[row]=await store.request(`sandbox_payments?id=eq.${createdId}&revision=eq.${row.revision}`,'PATCH',{status:'unknown',revision:row.revision+1});
  assert.equal(await store.rpc('claim_sandbox_payment_check',{p_id:createdId}),true,'Lost-reference recovery lease migration must be installed');
  await store.request(`sandbox_payments?id=eq.${createdId}`,'PATCH',{provider_check_until:'2000-01-01T00:00:00Z'});
  console.log('PASS: unknown payments without a reference can claim a shared recovery lease');
  const ref=`SECURITY-TEST-${run}`;
  [row]=await store.request(`sandbox_payments?id=eq.${createdId}&revision=eq.${row.revision}`,'PATCH',{status:'paid',reference:ref,revision:row.revision+1});
  const leases=await Promise.all(Array.from({length:12},()=>store.rpc('claim_sandbox_payment_check',{p_id:createdId})));
  assert.equal(leases.filter(Boolean).length,1);
  await assert.rejects(store.request(`sandbox_payments?id=eq.${createdId}`,'PATCH',{status:'pending',revision:row.revision+1}));
  await assert.rejects(store.request(`sandbox_payments?id=eq.${createdId}`,'PATCH',{amount:1,revision:row.revision+1}));
  await assert.rejects(store.request(`sandbox_payments?id=eq.${createdId}`,'PATCH',{guest_session_hash:hash('attacker'),revision:row.revision+1}));
  await assert.rejects(store.request(`sandbox_payments?id=eq.${createdId}`,'PATCH',{reference:'OTHER',revision:row.revision+1}));
  console.log('PASS: concurrent writes, polling leases, monotonic state and immutable order fields');
  [row]=await store.request(`sandbox_payments?id=eq.${createdId}&revision=eq.${row.revision}`,'PATCH',{status:'refunded',revision:row.revision+1});
  const events=await store.request(`payment_audit_events?payment_id=eq.${createdId}&select=next_status,revision&order=id.asc`);
  assert.equal(events[0].next_status,'creating');assert.equal(events.at(-1).next_status,'refunded');assert.ok(events.length>=4);
  console.log('PASS: payment transitions leave durable audit records');
  const publicKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  for(const path of ['sandbox_payments?select=id&limit=1','payment_audit_events?select=id&limit=1','rpc/reserve_sandbox_payment']) {
   const response=await fetch(`${process.env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/${path}`,{method:path.startsWith('rpc/')?'POST':'GET',headers:{apikey:publicKey,...(publicKey.startsWith('sb_publishable_')?{}:{Authorization:`Bearer ${publicKey}`}), 'Content-Type':'application/json'},...(path.startsWith('rpc/')?{body:JSON.stringify({p_payment:payment})}:{}),signal:AbortSignal.timeout(10000)});
   assert.ok(!response.ok,`Anonymous access must be denied: ${path}`);
  }
  console.log('PASS: anonymous clients cannot read payment/audit data or reserve orders directly');
  console.log('All remote sandbox database security checks passed. Synthetic test records retained for audit.');
 } finally {
  if(createdId) {
   const [row]=await store.request(`sandbox_payments?id=eq.${createdId}`);
   if(row&&['creating','pending','unknown','paid'].includes(row.status))await store.request(`sandbox_payments?id=eq.${createdId}&revision=eq.${row.revision}`,'PATCH',{status:row.status==='paid'?'refunded':'failed',revision:row.revision+1});
  }
 }
}
main().catch(error=>{console.error(error?.getResponse?.()||error.message||'Security database check failed.');process.exitCode=1;});
