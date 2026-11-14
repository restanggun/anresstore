import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checks, run} from './monitor-operations.mjs';
const env = {SUPABASE_URL: 'https://example.test', SUPABASE_SECRET_KEY: 'sb_secret_test'};
test('counts are read-only, mode isolated and do not expose credentials', async () => {
  const result = await run(env, async (url, options) => {
    assert.equal(options.method, 'HEAD'); assert.match(url, /payment_mode=eq.live/);
    assert.equal(options.redirect, 'error');
    return new Response(null, {headers: {'content-range': '0-0/1'}});
  });
  assert.equal(result.status, 'attention'); assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SECRET_KEY));
  assert.ok(checks(0, 'sandbox').every(c => c.filter.includes('payment_mode=eq.sandbox')));
});
test('empty queues are healthy; failed or incomplete queries fail closed', async () => {
  assert.equal((await run(env, async () => new Response(null, {headers: {'content-range': '*/0'}}))).status, 'ok');
  await assert.rejects(run(env, async () => new Response(null, {status: 503})));
  await assert.rejects(run(env, async () => new Response(null)));
  await assert.rejects(run({...env, OPERATIONS_PAYMENT_MODE: 'invalid'}));
});
