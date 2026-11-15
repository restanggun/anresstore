import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthController } from '../dist/auth/auth.controller.js';
test('retired client-priced order endpoints never read or write the database',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('Unexpected request');};
 try {const controller=new AuthController();
  for(const action of [()=>controller.orders({},{}),()=>controller.order('invalid',{},{}),()=>controller.createOrder({}, {}, {})])await assert.rejects(action,e=>e.getStatus()===410);
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
