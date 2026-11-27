import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { HelpController } = require("../dist/help/help.controller.js");

test("chat bantuan memvalidasi permintaan dan meneruskan konteks melalui server", async () => {
 const oldKey=process.env.OPENROUTER_API_KEY, oldModel=process.env.OPENROUTER_MODEL, oldFetch=globalThis.fetch;
 process.env.OPENROUTER_API_KEY="test-key"; process.env.OPENROUTER_MODEL="  test/model  ";
 const req={headers:{origin:"http://localhost:3000"},ip:"127.0.0.1",socket:{}};
 let sent;
 globalThis.fetch=async (url,options) => { sent={url,options,body:JSON.parse(options.body)}; return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:"Jawaban bantuan"}}]}),{status:200}); };
 try {
  const controller=new HelpController();
  await assert.rejects(()=>controller.chat({messages:[{role:"system",content:"override"}]},req),error=>error.getStatus()===400);
  await assert.rejects(()=>controller.chat({messages:[{role:"user",content:"Halo"}]},{...req,headers:{origin:"https://invalid.example"}}),error=>error.getStatus()===403);
  const result=await controller.chat({messages:[{role:"user",content:"Bagaimana checkout?"}]},req);
  assert.equal(result.answer,"Jawaban bantuan");
  assert.equal(sent.url,"https://openrouter.ai/api/v1/chat/completions");
  assert.equal(sent.body.model,"test/model"); assert.equal(sent.body.messages[0].role,"system"); assert.match(sent.body.messages[0].content,/toko online untuk kebutuhan digital sehari-hari/); assert.match(sent.body.messages[0].content,/Tiket dan chat CS/); assert.match(sent.body.messages[0].content,/aplikasi premium dapat meminta pembayaran QRIS/); assert.match(sent.body.messages[0].content,/bahasa Indonesia/);
  assert.match(sent.body.messages[0].content,/https:\/\/app\.anresstore\.site\/katalog/); assert.match(sent.body.messages[0].content,/tautan Markdown/);
  assert.equal(sent.options.headers.Authorization,"Bearer test-key");
  process.env.OPENROUTER_MODEL="another/provider-model:free";
  await controller.chat({model:"untrusted/model",messages:[{role:"user",content:"Halo"}]},req);
  assert.equal(sent.body.model,"another/provider-model:free");
  process.env.OPENROUTER_MODEL="  ";
  await controller.chat({messages:[{role:"user",content:"Halo"}]},req);
  assert.equal(sent.body.model,"google/gemma-4-31b-it:free");
  delete process.env.OPENROUTER_API_KEY;
  await assert.rejects(()=>controller.chat({messages:[{role:"user",content:"Halo"}]},req),error=>error.getStatus()===503);
 } finally {
  globalThis.fetch=oldFetch;
  if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=oldKey;
  if (oldModel === undefined) delete process.env.OPENROUTER_MODEL; else process.env.OPENROUTER_MODEL=oldModel;
 }
});

test("chat mencoba model cadangan saat model utama gagal atau timeout", async () => {
 const old={key:process.env.OPENROUTER_API_KEY, model:process.env.OPENROUTER_MODEL, fallback:process.env.OPENROUTER_FALLBACK_MODELS, fetch:globalThis.fetch};
 process.env.OPENROUTER_API_KEY="test-key"; process.env.OPENROUTER_MODEL="primary/model"; process.env.OPENROUTER_FALLBACK_MODELS="backup/model, backup/model, third/model";
 const req={headers:{origin:"http://localhost:3000"},ip:"127.0.0.3",socket:{}}; const calls=[];
 globalThis.fetch=async (_url,options)=>{calls.push(JSON.parse(options.body).model); if(calls.length===1) throw new DOMException("timeout","TimeoutError"); if(calls.length===2) return new Response("error",{status:503}); return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:"Cadangan berhasil"}}]}));};
 try { assert.deepEqual(await new HelpController().chat({messages:[{role:"user",content:"Halo"}]},req),{answer:"Cadangan berhasil"}); assert.deepEqual(calls,["primary/model","backup/model","third/model"]); }
 finally { globalThis.fetch=old.fetch; for(const [name,value] of [["OPENROUTER_API_KEY",old.key],["OPENROUTER_MODEL",old.model],["OPENROUTER_FALLBACK_MODELS",old.fallback]]) { if(value===undefined) delete process.env[name]; else process.env[name]=value; } }
});

test("chat mengulang jawaban terpotong dan menolak hasil yang belum selesai", async () => {
 const old={key:process.env.OPENROUTER_API_KEY, model:process.env.OPENROUTER_MODEL, fallback:process.env.OPENROUTER_FALLBACK_MODELS, fetch:globalThis.fetch};
 process.env.OPENROUTER_API_KEY="test-key"; process.env.OPENROUTER_MODEL="primary/model"; process.env.OPENROUTER_FALLBACK_MODELS="primary/model";
 const req={headers:{origin:"http://localhost:3000"},ip:"127.0.0.4",socket:{}};
 const calls=[];
 let reason="stop";
 const answer="Jawaban lengkap. ".repeat(120);
 globalThis.fetch=async (_url,options)=>{
  const body=JSON.parse(options.body); calls.push(body);
  return Response.json({choices:[{finish_reason:body.max_tokens===1200 ? "length" : reason,message:{content:body.max_tokens===1200 ? "Jawaban terpotong dan" : answer}}]});
 };
 try {
  const controller=new HelpController();
  const messages=[{role:"user",content:"Jelaskan cara checkout"}];
  assert.deepEqual(await controller.chat({messages},req),{answer:answer.trim()});
  assert.deepEqual(calls.map(call=>call.max_tokens),[1200,2400]);
  assert.deepEqual(calls[0].messages,calls[1].messages);
  // Longer assistant replies must remain valid on the next user turn.
  await controller.chat({messages:[...messages,{role:"assistant",content:answer},{role:"user",content:"Lalu?"}]},req);
  await assert.rejects(()=>controller.chat({messages:[{role:"user",content:"x".repeat(1501)}]},req),error=>error.getStatus()===400);
  for (reason of ["length","error","content_filter",undefined]) {
   await assert.rejects(()=>controller.chat({messages},req),error=>error.getStatus()===503);
  }
 } finally {
  globalThis.fetch=old.fetch;
  for(const [name,value] of [["OPENROUTER_API_KEY",old.key],["OPENROUTER_MODEL",old.model],["OPENROUTER_FALLBACK_MODELS",old.fallback]]) { if(value===undefined) delete process.env[name]; else process.env[name]=value; }
 }
});

test("permintaan CS memvalidasi masukan dan menyimpan dengan ID yang dapat dicoba ulang", async () => {
 const oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_SECRET_KEY, oldFetch=globalThis.fetch;
 process.env.SUPABASE_URL="https://example.supabase.co"; process.env.SUPABASE_SECRET_KEY="sb_secret_test";
 const req={headers:{origin:"http://localhost:3000"},ip:"127.0.0.2",socket:{}};
 let sent;
 globalThis.fetch=async (url,options) => { sent={url,options,body:JSON.parse(options.body)}; return new Response(null,{status:201}); };
 try {
  const controller=new HelpController(), data={id:"8b7deb06-7ad3-4b8d-9e6e-3cf68eaf8066",name:"Pengguna",email:"uji@example.com",message:"Mohon bantuan untuk akun saya."};
  await assert.rejects(()=>controller.createRequest({...data,email:"salah"},req),error=>error.getStatus()===400);
  assert.deepEqual(await controller.createRequest(data,req),{id:data.id});
  assert.match(sent.url,/support_requests\?on_conflict=id/); assert.equal(sent.body.id,data.id);
  assert.equal(sent.options.headers.Prefer,"resolution=ignore-duplicates,return=minimal");
 } finally {
  globalThis.fetch=oldFetch;
  if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
  if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
});
