import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apiAbuseMiddleware} from '../dist/common/api-abuse.js';
import {AuthController} from '../dist/auth/auth.controller.js';
import {boundedFetch} from '../dist/common/bounded-fetch.js';

function response(){return {statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};}
test('auth and OTP abuse budgets are shared and do not store raw emails or IPs in bucket keys',async()=>{
 const calls=[],counts=new Map();const middleware=apiAbuseMiddleware({rpc:async(name,args)=>{calls.push(args);const count=(counts.get(args.p_key)||0)+1;counts.set(args.p_key,count);return count<=args.p_limit;}});
 const req={path:'/v1/auth/recover',method:'POST',ip:'203.0.113.1',headers:{origin:'http://localhost:3000'},body:{email:'private@example.com'}};
 let passed=0;
 for(let i=0;i<5;i++)await middleware(req,response(),()=>{passed++;});
 const limited=response();await middleware(req,limited,()=>{passed++;});
 assert.equal(passed,5);assert.equal(limited.statusCode,429);assert.equal(limited.headers['Retry-After'],'900');
 for(const call of calls)assert.doesNotMatch(call.p_key,/private@example.com|203\.0\.113\.1/);
});
test('auth protection fails closed during datastore outages and covers PATCH admin writes',async()=>{
 const middleware=apiAbuseMiddleware({rpc:async()=>{throw new Error('database key');}});
 for(const req of [{path:'/v1/auth/login',method:'POST',body:{}},{path:'/v1/admin/support/id',method:'PATCH',body:{}}]) {
  const res=response();let passed=false;await middleware({...req,headers:{origin:'http://localhost:3000'}},res,()=>{passed=true;});assert.equal(passed,false);assert.equal(res.statusCode,503);assert.doesNotMatch(JSON.stringify(res.body),/database key/);
 }
 let healthPassed=false;await middleware({path:'/v1/health',method:'GET'},response(),()=>{healthPassed=true;});assert.equal(healthPassed,true);
});
test('bounded auth transport disables redirects and returns a sanitized outage error',async()=>{
 const original=global.fetch;
 try {
  global.fetch=async(url,options)=>{assert.equal(options.redirect,'error');assert.ok(options.signal);throw new Error('password-and-token');};
  await assert.rejects(boundedFetch('https://auth.example'),error=>error.getStatus()===503&&!error.message.includes('password'));
 } finally {global.fetch=original;}
});
test('legacy client-priced simulated orders are blocked in production before any auth or DB request',async()=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
 try {await assert.rejects(new AuthController().createOrder({}, {}, {}),error=>error.getStatus()===503);}
 finally {if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});
