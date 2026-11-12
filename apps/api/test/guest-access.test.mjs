import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuestAccess, verifyGuestAccess } from '../dist/payments/guest-access.js';

test('guest order access uses a unique 256-bit secret and stores a digest', () => {
  const first = createGuestAccess(), second = createGuestAccess();
  assert.equal(Buffer.from(first.token, 'base64url').length, 32);
  assert.notEqual(first.token, second.token);
  assert.equal(first.digest.length, 32);
  assert.equal(verifyGuestAccess(first.token, first.digest), true);
  assert.equal(verifyGuestAccess(second.token, first.digest), false);
  assert.equal(verifyGuestAccess(first.token + 'x', first.digest), false);
  assert.equal(verifyGuestAccess(first.token, Buffer.alloc(0)), false);
});
