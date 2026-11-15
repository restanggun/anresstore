import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveSession,writeSession} from '../dist/auth/session.js';
import {AdminController} from '../dist/admin/admin.controller.js';
import {PaymentIdentityService} from '../dist/payments/payment-identity.js';
const id='f623c4ef-1eb2-49fb-ae0d-123456789012';
const jwt=(aal='aal2')=>`header.${Buffer.from(JSON.stringify({sub:id,aal,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.signature`;
const response=()=>({cookies:[],setHeader(){},cookie(...args){this.cookies.push(args);}});

test('checkout refreshes expired access and never downgrades revoked account sessions to guest',()=>isolated(async()=>{
 const token=jwt();let refresh=0;
 global.fetch=async(url,options)=>{
  if(String(url).includes('grant_type=refresh_token')){refresh++;return Response.json({access_token:token,refresh_token:'rotated'});}
  return options.headers.Authorization===`Bearer ${token}`?Response.json({id}):Response.json({}, {status:401});
 };
 const identity=new PaymentIdentityService(),res=response();
 assert.equal((await identity.resolve({headers:{cookie:'anres_access=expired; anres_refresh=valid'}},res)).userId,id);
 assert.equal(refresh,1);assert.equal(res.cookies.length,2);
 global.fetch=async()=>Response.json({}, {status:401});
 await assert.rejects(identity.resolve({headers:{cookie:'anres_refresh=revoked'}},response()),e=>e.getStatus()===401);
 global.fetch=async()=>{throw new Error('offline');};
 await assert.rejects(identity.resolve({headers:{cookie:'anres_access=existing'}},response()));
}));
async function isolated(fn){const env={...process.env},fetch=global.fetch;Object.assign(process.env,{ADMIN_USER_IDS:id,SUPABASE_URL:'https://session.example',SUPABASE_PUBLISHABLE_KEY:'public-key',ADMIN_REQUIRE_MFA:'true'});try{await fn();}finally{process.env=env;global.fetch=fetch;}}
test('expired admin access refreshes a verified AAL2 session and rotates persistent HttpOnly cookies',()=>isolated(async()=>{
 const token=jwt();let refresh=0;
 global.fetch=async(url,options)=>{if(String(url).includes('grant_type=refresh_token')){refresh++;return Response.json({access_token:token,refresh_token:'new-refresh',expires_in:1800});}return options.headers.Authorization===`Bearer ${token}`?Response.json({id}):Response.json({}, {status:401});};
 const req={headers:{cookie:'anres_access=expired; anres_refresh=old-refresh'}},res=response();
 assert.equal((await new AdminController().session(req,res)).id,id);
 assert.equal(refresh,1);assert.equal(res.cookies[0][1],token);assert.equal(res.cookies[0][2].maxAge,1800000);assert.equal(res.cookies[1][1],'new-refresh');assert.ok(res.cookies.every(c=>c[2].httpOnly));
}));
test('a refreshed AAL1 session never restores MFA admin access',()=>isolated(async()=>{
 const token=jwt('aal1');global.fetch=async(url)=>String(url).includes('grant_type=refresh_token')?Response.json({access_token:token,refresh_token:'rotated'}):Response.json({id});
 const req={headers:{cookie:'anres_refresh=not-mfa'}},res=response();
 await assert.rejects(new AdminController().session(req,res),e=>e.getStatus()===403);
}));
test('parallel requests sharing a refresh token rotate it once',()=>isolated(async()=>{
 let count=0;global.fetch=async(url)=>{if(String(url).includes('grant_type=refresh_token')){count++;await new Promise(r=>setTimeout(r,20));return Response.json({access_token:jwt(),refresh_token:'rotated'});}return Response.json({id});};
 await Promise.all([1,2,3].map(()=>resolveSession({headers:{cookie:'anres_refresh=concurrent'}},response())));
 assert.equal(count,1);
}));
test('session-only MFA cookies keep their retention preference through refresh',()=>isolated(async()=>{
 const res=response();writeSession({headers:{}},res,{access_token:jwt(),refresh_token:'temporary'},false);
 assert.equal(res.cookies.length,3);assert.ok(res.cookies.every(c=>c[2].maxAge===undefined));assert.equal(res.cookies[2][1],'0');
 global.fetch=async(url)=>String(url).includes('grant_type=refresh_token')?Response.json({access_token:jwt(),refresh_token:'rotated'}):Response.json({id});
 const refreshed=response();await resolveSession({headers:{cookie:'anres_refresh=temporary; anres_persist=0'}},refreshed);
 assert.ok(refreshed.cookies.every(c=>c[2].maxAge===undefined));
}));
test('revoked refresh tokens and auth outages never restore a session',()=>isolated(async()=>{
 global.fetch=async()=>Response.json({},{status:400});const res=response();
 await assert.rejects(resolveSession({headers:{cookie:'anres_refresh=revoked'}},res),e=>e.getStatus()===401);assert.equal(res.cookies.length,0);
 global.fetch=async()=>Response.json({},{status:503});
 await assert.rejects(resolveSession({headers:{cookie:'anres_access=unverified; anres_refresh=unavailable'}},response()),e=>e.getStatus()===503);
}));
