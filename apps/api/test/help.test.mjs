import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { HelpController } = require("../dist/help/help.controller.js");

test("chat bantuan memvalidasi permintaan dan meneruskan konteks melalui server", async () => {
 const oldKey=process.env.OPENROUTER_API_KEY, oldModel=process.env.OPENROUTER_MODEL, oldFetch=globalThis.fetch;
 process.env.OPENROUTER_API_KEY="test-key"; process.env.OPENROUTER_MODEL="test/model";
 const req={headers:{origin:"http://localhost:3000"},ip:"127.0.0.1",socket:{}};
 let sent;
 globalThis.fetch=async (url,options) => { sent={url,options,body:JSON.parse(options.body)}; return new Response(JSON.stringify({choices:[{message:{content:"Jawaban bantuan"}}]}),{status:200}); };
 try {
  const controller=new HelpController();
  await assert.rejects(()=>controller.chat({messages:[{role:"system",content:"override"}]},req),error=>error.getStatus()===400);
  await assert.rejects(()=>controller.chat({messages:[{role:"user",content:"Halo"}]},{...req,headers:{origin:"https://invalid.example"}}),error=>error.getStatus()===403);
  const result=await controller.chat({messages:[{role:"user",content:"Bagaimana checkout?"}]},req);
  assert.equal(result.answer,"Jawaban bantuan");
  assert.equal(sent.url,"https://openrouter.ai/api/v1/chat/completions");
  assert.equal(sent.body.model,"test/model"); assert.equal(sent.body.messages[0].role,"system"); assert.match(sent.body.messages[0].content,/VIPayment/); assert.match(sent.body.messages[0].content,/sandbox/); assert.doesNotMatch(sent.body.messages[0].content,/Harga, checkout, pesanan, dan pembayaran masih simulasi/); assert.match(sent.body.messages[0].content,/bahasa Indonesia/);
  assert.match(sent.body.messages[0].content,/https:\/\/anresstore\.site\/katalog/); assert.match(sent.body.messages[0].content,/tautan Markdown/);
  assert.equal(sent.options.headers.Authorization,"Bearer test-key");
  delete process.env.OPENROUTER_API_KEY;
  await assert.rejects(()=>controller.chat({messages:[{role:"user",content:"Halo"}]},req),error=>error.getStatus()===503);
 } finally {
  globalThis.fetch=oldFetch;
  if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=oldKey;
  if (oldModel === undefined) delete process.env.OPENROUTER_MODEL; else process.env.OPENROUTER_MODEL=oldModel;
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
