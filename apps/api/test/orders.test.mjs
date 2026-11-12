import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const {AuthController}=require("../dist/auth/auth.controller.js");

test("invoice menggunakan sesi, memvalidasi input dan membatasi pencarian ke pemilik",async()=>{
 const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,fetch:globalThis.fetch};
 process.env.SUPABASE_URL="https://example.supabase.co"; process.env.SUPABASE_PUBLISHABLE_KEY="test-key";
 const calls=[];
 globalThis.fetch=async(url,options={})=>{calls.push({url,options}); if(url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({id:"user-123"}),{status:200}); if(options.method === "POST") return new Response(null,{status:201}); return new Response("[]",{status:200});};
 const req={headers:{origin:"http://localhost:3000",cookie:"anres_access=access"},socket:{}};
 const id="8b7deb06-7ad3-4b8d-9e6e-3cf68eaf8066";
 const item={id:"item",product:"Artikel",category:"Format tugas",details:"5 halaman",target:"tugas",contact:"kontak",price:10000,quantity:1,status:"completed"};
 try {
  const controller=new AuthController();
  await assert.rejects(()=>controller.order("invalid",req,{}),error=>error.getStatus()===400);
  assert.deepEqual(await controller.order(id,req,{}),{userId:"user-123",order:null});
  const read=calls.find(call=>call.url.includes("/rest/v1/orders?id=")); assert.match(read.url,/user_id=eq.user-123/); assert.equal(read.options.headers.Authorization,"Bearer access");
  await assert.rejects(()=>controller.createOrder({id,userId:"other",paymentMethod:"QRIS",items:[item]},req,{}),error=>error.getStatus()===409);
  await assert.rejects(()=>controller.createOrder({id,userId:"user-123",paymentMethod:"QRIS",items:[{...item,quantity:-1}]},req,{}),error=>error.getStatus()===400);
  assert.deepEqual(await controller.createOrder({id,userId:"user-123",paymentMethod:"QRIS",items:[item]},req,{}),{id});
  const write=calls.find(call=>call.options.method==="POST" && call.url.includes("/rest/v1/orders")); const data=JSON.parse(write.options.body);
  assert.equal(data.user_id,"user-123"); assert.equal(data.items[0].status,"awaiting_payment");
 } finally { globalThis.fetch=previous.fetch; if(previous.url===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=previous.url; if(previous.key===undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY=previous.key; }
});
