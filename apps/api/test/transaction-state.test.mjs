import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPaymentEvent, applyDispatchResult } from '../dist/payments/transaction-state.js';

test('payment events are idempotent and conflicting events do not requeue fulfillment', () => {
  const pending = {payment:'pending', fulfillment:'not_ready'};
  const paid = applyPaymentEvent(pending, 'PAID');
  assert.deepEqual(paid, {state:{payment:'paid',fulfillment:'ready'},outcome:'changed'});
  assert.equal(applyPaymentEvent(paid.state, 'PAID').outcome, 'duplicate');
  const completed = {payment:'paid',fulfillment:'completed'};
  assert.deepEqual(applyPaymentEvent(completed, 'EXPIRED'), {state:completed,outcome:'review'});
  assert.equal(applyPaymentEvent(pending, 'REFUND').outcome, 'review');
  assert.deepEqual(applyPaymentEvent(paid.state, 'REFUND').state, {payment:'refunded',fulfillment:'manual_review'});
});

test('ambiguous dispatch stays unknown and cannot be retried via state transition', () => {
  const dispatching = {payment:'paid',fulfillment:'dispatching'};
  const unknown = applyDispatchResult(dispatching, 'uncertain');
  assert.equal(unknown.fulfillment, 'unknown');
  assert.throws(() => applyDispatchResult(unknown, 'accepted'));
  assert.throws(() => applyDispatchResult({payment:'pending',fulfillment:'dispatching'}, 'accepted'));
});
