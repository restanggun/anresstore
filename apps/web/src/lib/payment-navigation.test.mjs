import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoicePath, tripayCheckoutUrl } from './payment-navigation.ts';
const id = 'f623c4ef-1eb2-49fb-ae0d-123456789012';
const payment = { id, status: 'pending', needsReview: false, checkoutUrl: 'https://tripay.co.id/checkout/T123PAY' };
test('checkout opens Tripay only for pending payments with a trusted URL', () => {
  assert.equal(tripayCheckoutUrl(payment), payment.checkoutUrl);
  for (const status of ['creating', 'unknown', 'paid', 'failed', 'expired', 'refunded']) assert.equal(tripayCheckoutUrl({ ...payment, status }), null);
  assert.equal(tripayCheckoutUrl({ ...payment, needsReview: true }), null);
  for (const checkoutUrl of [null, 'javascript:alert(1)', 'https://tripay.co.id.evil.test/checkout/T123PAY', 'https://user@tripay.co.id/checkout/T123PAY', 'https://tripay.co.id/checkout/T123PAY?redirect=evil', 'https://tripay.co.id/other']) assert.equal(tripayCheckoutUrl({ ...payment, checkoutUrl }), null);
});
test('invoice destination contains only a validated payment ID', () => {
  assert.equal(invoicePath(id), `/invoice/${id}`);
  const number = 'ARNS-ML5-MOBILELEGEND-20261115-1234567890ABCDEF';
  assert.equal(invoicePath(id, 'ARNS-261115-7E3074A1BFBC4A'), '/invoice/ARNS-261115-7E3074A1BFBC4A');
  assert.equal(invoicePath(id, number), `/invoice/${number}`);
  assert.equal(invoicePath(number), `/invoice/${number}`);
  assert.throws(() => invoicePath('../other'));
});
