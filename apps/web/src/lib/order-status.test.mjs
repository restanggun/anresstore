import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderStatus,deliveryFailureReason} from './order-status.ts';
const payment={status:'paid',needsReview:false};
test('paid invoice never hides failed delivery behind payment success',()=>{
 const result=orderStatus({...payment,fulfillment:{status:'failed',note:'Invalid User ID or Zone ID '}});
 assert.equal(result.paymentLabel,'Lunas');assert.equal(result.deliveryLabel,'Gagal');assert.equal(result.tone,'review');assert.equal(result.step,3);assert.match(result.reason,/ID pemain/);assert.match(result.description,/Jangan bayar ulang/);
});
test('unknown delivery prevents duplicate purchase and completed is the only product success',()=>{
 assert.match(orderStatus({...payment,fulfillment:{status:'unknown',note:null}}).description,/dua kali/);
 for(const status of ['ready','not_ready','dispatching','processing'])assert.notEqual(orderStatus({...payment,fulfillment:{status,note:null}}).step,4);
 assert.equal(orderStatus({...payment,fulfillment:{status:'completed',note:null}}).step,4);
 assert.equal(orderStatus(payment).deliveryLabel,'Belum tersedia');
});
test('payment failures and refund requests stay separate from delivery and returned funds',()=>{
 assert.equal(orderStatus({status:'failed',needsReview:false}).deliveryLabel,'Belum diproses');
 assert.match(orderStatus({...payment,refund:{refund_status:'requested'}}).description,/Dana belum/);
 assert.match(orderStatus({...payment,refund:{refund_status:'completed'}}).title,/dicatat admin/);
 assert.ok(!deliveryFailureReason('secret provider error').includes('secret'));
});
