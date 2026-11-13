import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PaymentIdentityService,paymentCookies} from '../dist/payments/payment-identity.js';

test('guest identity is server generated and stored in an HttpOnly SameSite cookie',async()=>{
 const service=new PaymentIdentityService();let issued;
 const result=await service.establish({headers:{}},{cookie:(name,value,options)=>{issued={name,value,options};}});
 assert.equal(result.mode,'guest');assert.match(result.scope,/^[a-f0-9]{64}$/);
 assert.match(issued.value,/^[A-Za-z0-9_-]{43}$/);assert.equal(issued.options.httpOnly,true);assert.equal(issued.options.sameSite,'lax');assert.equal(issued.options.path,'/');
 const identity=await service.resolve({headers:{cookie:`${issued.name}=${issued.value}`}});
 assert.match(identity.guestHash,/^[a-f0-9]{64}$/);assert.equal(identity.userId,null);assert.notEqual(identity.guestHash,issued.value);
});
test('cookie parser rejects ambiguity and malformed encoding without prototype pollution',()=>{
 assert.throws(()=>paymentCookies({headers:{cookie:'anres_access=a; anres_access=b'}}));
 assert.throws(()=>paymentCookies({headers:{cookie:'anres_access=%XX'}}));
 const parsed=paymentCookies({headers:{cookie:'__proto__=bad; anres_access=ok'}});
 assert.equal(Object.getPrototypeOf(parsed),null);assert.equal(parsed.anres_access,'ok');
});
test('verified auth user is authoritative; expired or unavailable auth never becomes a guest purchase',async()=>{
 const original=globalThis.fetch;const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY};
 process.env.SUPABASE_URL='https://auth.example';process.env.SUPABASE_PUBLISHABLE_KEY='public-test';
 const service=new PaymentIdentityService(),req={headers:{cookie:'anres_access=test-jwt; anres_refresh=test-refresh'}};
 try {
  const userId=randomUUID();globalThis.fetch=async()=>Response.json({id:userId});
  assert.equal((await service.resolve(req)).userId,userId);
  globalThis.fetch=async()=>Response.json({error:'expired'},{status:401});
  await assert.rejects(service.resolve(req),error=>error.getStatus()===401);
  globalThis.fetch=async()=>{throw new Error('network secret');};
  await assert.rejects(service.resolve(req),error=>error.getStatus()===503&&!error.message.includes('secret'));
  await assert.rejects(service.resolve({headers:{cookie:'anres_refresh=refresh-only'}}),error=>error.getStatus()===401);
 } finally {globalThis.fetch=original;for(const [key,value] of [['SUPABASE_URL',previous.url],['SUPABASE_PUBLISHABLE_KEY',previous.key]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('production guest cookie uses Secure and __Host scope',async()=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';let issued;
 try {await new PaymentIdentityService().establish({headers:{}},{cookie:(name,value,options)=>{issued={name,options};}});assert.equal(issued.name,'__Host-anres_payment_guest');assert.equal(issued.options.secure,true);assert.equal(issued.options.domain,undefined);}
 finally {if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});
