import test from 'node:test';
import assert from 'node:assert/strict';
import { sellingPrice, CatalogController } from '../dist/catalog/catalog.controller.js';

test('markup follows the existing top-up price tiers', () => {
  assert.equal(sellingPrice(5000), 6300);
  assert.equal(sellingPrice(10000), 12000);
  assert.equal(sellingPrice(30000), 34500);
  assert.equal(sellingPrice(60000), 66000);
  assert.equal(sellingPrice(100000), 105000);
});

test('catalog fails closed when provider credentials are missing', async () => {
  const oldId = process.env.VIPAYMENT_API_ID, oldKey = process.env.VIPAYMENT_API_KEY;
  delete process.env.VIPAYMENT_API_ID; delete process.env.VIPAYMENT_API_KEY;
  try { await assert.rejects(() => new CatalogController().list('game'), error => error.getStatus() === 503); }
  finally { if (oldId !== undefined) process.env.VIPAYMENT_API_ID = oldId; if (oldKey !== undefined) process.env.VIPAYMENT_API_KEY = oldKey; }
});
