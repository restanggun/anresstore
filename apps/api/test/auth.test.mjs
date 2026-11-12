import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
test("auth API menangani login, sesi, logout, origin, dan callback PKCE", async () => {
 let calls=[];
 const mock=createServer(async (req,res)=>{ let body=""; for await (const part of req) body+=part; calls.push({url:req.url,body:body && JSON.parse(body)}); res.setHeader("Content-Type","application/json"); if(req.url.startsWith("/auth/v1/token")) res.end(JSON.stringify({access_token:"access",refresh_token:"refresh",user:{id:"user-123",email:"uji@example.com"}})); else if(req.url==="/auth/v1/user") res.end(JSON.stringify({id:"user-123",email:"uji@example.com",user_metadata:{full_name:"Nama Awal"}})); else if(req.url.startsWith("/rest/v1/profiles")) res.end(JSON.stringify([{full_name:req.method === "POST" ? JSON.parse(body).full_name : "Nama Awal"}])); else res.end("{}"); });
 await new Promise(resolve=>mock.listen(0,"127.0.0.1",resolve)); const mockPort=mock.address().port;
 const server=spawn(process.execPath,["dist/main.js"],{env:{...process.env,PORT:"4149",SUPABASE_URL:`http://127.0.0.1:${mockPort}`,SUPABASE_PUBLISHABLE_KEY:"test-key",AUTH_API_ORIGIN:"http://localhost:4149",AUTH_WEB_ORIGIN:"http://localhost:3000"},stdio:"ignore"});
 try { let ready=false; for(let i=0;i<60;i++){ try { await fetch("http://127.0.0.1:4149/v1/auth/session"); ready=true; break; } catch { await delay(100); } } assert.ok(ready,"API tidak dimulai");
 const base="http://127.0.0.1:4149/v1/auth"; const headers={"Content-Type":"application/json",Origin:"http://localhost:3000"};
 const denied=await fetch(`${base}/login`,{method:"POST",headers:{...headers,Origin:"http://evil.example"},body:JSON.stringify({email:"uji@example.com",password:"password"})}); assert.equal(denied.status,403);
 const login=await fetch(`${base}/login`,{method:"POST",headers,body:JSON.stringify({email:"uji@example.com",password:"password"})}); assert.equal(login.status,201); const cookies=login.headers.getSetCookie(); assert.ok(cookies.some(x=>x.includes("HttpOnly"))); const cookie=cookies.map(x=>x.split(";")[0]).join("; ");
 const session=await fetch(`${base}/session`,{headers:{cookie}}); assert.equal((await session.json()).user.email,"uji@example.com");
 const noProfile=await fetch(`${base}/profile`); assert.equal(noProfile.status,401);
 const profile=await fetch(`${base}/profile`,{headers:{cookie}}); assert.equal((await profile.json()).fullName,"Nama Awal");
 const deniedProfile=await fetch(`${base}/profile`,{method:"POST",headers:{...headers,cookie,Origin:"http://evil.example"},body:JSON.stringify({fullName:"Nama Baru"})}); assert.equal(deniedProfile.status,403);
 const updated=await fetch(`${base}/profile`,{method:"POST",headers:{...headers,cookie},body:JSON.stringify({fullName:"Nama Baru",id:"other-user"})}); assert.equal((await updated.json()).fullName,"Nama Baru"); assert.ok(calls.some(x=>x.url.startsWith("/rest/v1/profiles?on_conflict") && x.body.id === "user-123"));
 const logout=await fetch(`${base}/logout`,{method:"POST",headers:{...headers,cookie},body:"{}"}); assert.equal(logout.status,201); assert.ok(logout.headers.getSetCookie().some(x=>x.includes("anres_access=;")));
 const signup=await fetch(`${base}/register`,{method:"POST",headers,body:JSON.stringify({email:"baru@example.com",password:"password123",name:"Pengguna Uji"})}); assert.equal(signup.status,201); assert.ok(calls.some(x=>x.url.startsWith("/auth/v1/signup?") && x.body.code_challenge));
 const recovery=await fetch(`${base}/recover`,{method:"POST",headers,body:JSON.stringify({email:"uji@example.com"})}); assert.equal(recovery.status,201); const recoveryCookies=recovery.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ");
 const resetDenied=await fetch(`${base}/reset-password`,{method:"POST",headers:{...headers,cookie},body:JSON.stringify({password:"newpassword"})}); assert.equal(resetDenied.status,403);
 const recoveryCallback=await fetch(`${base}/callback?code=recovery`,{headers:{cookie:recoveryCookies},redirect:"manual"}); assert.equal(recoveryCallback.headers.get("location"),"http://localhost:3000/auth/reset-password");
 const google=await fetch(`${base}/google`,{redirect:"manual"}); assert.equal(google.status,302); assert.ok(google.headers.get("location").includes("code_challenge=")); const pkce=google.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ");
 const cb=await fetch(`${base}/callback?code=test`,{headers:{cookie:pkce},redirect:"manual"}); assert.equal(cb.status,302); assert.equal(cb.headers.get("location"),"http://localhost:3000/"); assert.ok(calls.some(x=>x.url.includes("grant_type=pkce") && x.body.code_verifier));
 } finally { server.kill(); await new Promise(resolve=>mock.close(resolve)); }
});
