import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paymentGroup,channelFee} from './payment-channels.ts';
test('maps actual gateway groups with QRIS separated from wallets and retail translated',()=>{
 for(const [code,group,expected] of [['QRIS2','E-Wallet','QRIS'],['DANA','E-Wallet','E-wallet'],['BRIVA','Virtual Account','Virtual account'],['BCA','E-Banking','Internet banking'],['ALFAMART','Convenience Store','Minimarket'],['NEW','Future Group','Metode lainnya']]) assert.equal(paymentGroup({code,group}),expected);
});
test('customer fee terms handle percentage strings without inventing a final total',()=>{
 assert.equal(channelFee({fee:{flat:750,percent:'0.70'}}),'Biaya Rp750 + 0,7%');
 assert.equal(channelFee({fee:{flat:0,percent:0}}),'Tanpa biaya admin');
 assert.equal(channelFee({fee:{flat:-1,percent:0}}),'Biaya ditampilkan pada invoice');
});
