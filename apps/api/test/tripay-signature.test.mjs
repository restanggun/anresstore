import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyTripayCallback } from '../dist/payments/tripay-signature.js';

test('Tripay signature authenticates the exact raw callback bytes', () => {
  const key = 'test-secret', raw = Buffer.from('{ "status": "PAID" }');
  const signature = createHmac('sha256', key).update(raw).digest('hex');
  assert.equal(verifyTripayCallback(raw, signature, key), true);
  assert.equal(verifyTripayCallback(Buffer.from('{"status":"PAID"}'), signature, key), false);
  assert.equal(verifyTripayCallback(raw, signature, 'other'), false);
  assert.equal(verifyTripayCallback(raw, signature.slice(1), key), false);
  assert.equal(verifyTripayCallback(raw, signature, ''), false);
});
