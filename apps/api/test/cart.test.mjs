import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

test("keranjang memakai identitas sesi dan menolak akses atau data yang tidak valid", async () => {
 const calls = [];
 const mock = createServer(async (req, res) => {
  let body = ""; for await (const part of req) body += part;
  calls.push({url:req.url, method:req.method, authorization:req.headers.authorization, body:body ? JSON.parse(body) : null});
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/v1/user") res.end(JSON.stringify({id:"user-123"}));
  else if (req.url === "/rest/v1/rpc/apply_cart") res.end(JSON.stringify({items:[],version:0,conflict:false}));
  else { res.statusCode = 204; res.end(); }
 });
 await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
 const server = spawn(process.execPath, ["dist/main.js"], {env:{...process.env,PORT:"4150",SUPABASE_URL:`http://127.0.0.1:${mock.address().port}`,SUPABASE_PUBLISHABLE_KEY:"test-key"},stdio:"ignore"});
 try {
  const base = "http://127.0.0.1:4150/v1/auth/cart";
  let ready = false; for (let i=0;i<300;i++) { try { await fetch(base); ready=true; break; } catch { await delay(100); } } assert.ok(ready);
  assert.equal((await fetch(base)).status, 401);
  const headers = {cookie:"anres_access=access", Origin:"http://localhost:3000", "Content-Type":"application/json"};
  const item = {id:"a",product:"Produk",category:"Game",details:"50",target:"123",contact:"email",price:5000,quantity:1};
  const read = await fetch(base,{headers}); assert.deepEqual(await read.json(),{items:[],version:0,conflict:false,userId:"user-123"});
  const denied = await fetch(base,{method:"POST",headers:{...headers,Origin:"http://evil.example"},body:JSON.stringify({action:"save",userId:"user-123",version:0,items:[item]})}); assert.equal(denied.status,403);
  const invalid = await fetch(base,{method:"POST",headers,body:JSON.stringify({action:"save",userId:"user-123",version:0,items:[{...item,quantity:-1}]})}); assert.equal(invalid.status,400);
  const wrongUser = await fetch(base,{method:"POST",headers,body:JSON.stringify({action:"save",userId:"other-user",version:0,items:[item]})}); assert.equal(wrongUser.status,409);
  const saved = await fetch(base,{method:"POST",headers,body:JSON.stringify({action:"save",userId:"user-123",version:0,items:[item]})}); assert.equal(saved.status,201);
  const write = calls.find(call => call.url === "/rest/v1/rpc/apply_cart" && call.body.p_action === "save");
  assert.equal(write.authorization,"Bearer access"); assert.deepEqual(write.body.p_items,[item]); assert.equal(write.body.p_version,0);
 } finally { server.kill(); await new Promise(resolve => mock.close(resolve)); }
});
