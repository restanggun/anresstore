import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePayment} from '../dist/payments/payment-contract.js';
const input={id:'f623c4ef-1eb2-49fb-ae0d-123456789012',source:'game',code:'SKU',target:'12345',targetZone:'1234',method:'BRIVA',expectedAmount:20000};
test('game schema defers email requirement until identity is verified',()=>{
 for(const contact of [{},{name:'',email:'',phone:''}]){
  const result=parsePayment({...input,...contact});
  assert.equal(result.name,'Pelanggan');
  assert.equal(result.email,'');
  assert.equal(result.phone,'');
 }
});
test('optional game contacts reject invalid supplied values',()=>{
 for(const contact of [{email:'wrong'},{phone:'123'},{email:42},{phone:null}]) assert.throws(()=>parsePayment({...input,...contact}));
});
test('other checkout sources still require customer contact',()=>{
 for(const source of ['prepaid','apps','social','tasks']) assert.throws(()=>parsePayment({...input,source}));
});
