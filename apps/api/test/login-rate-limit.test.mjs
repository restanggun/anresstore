import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthController } from '../dist/auth/auth.controller.js';

test('password login and signup confirmation limit repeated attempts per IP', async () => {
  const controller = new AuthController();
  const req = {headers:{origin:'http://localhost:3000'},ip:'192.0.2.1',socket:{}};
  for (let i = 0; i < 10; i++) {
    await assert.rejects(() => controller.login({}, req, {}), error => error.getStatus() === 400);
  }
  await assert.rejects(() => controller.login({}, req, {}), error => error.getStatus() === 429);
  await assert.rejects(() => controller.confirmSignup({}, req, {}), error => error.getStatus() === 429);
});
