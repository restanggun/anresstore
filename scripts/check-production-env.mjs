import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';

// Offline check: never executes env contents or prints credential values.
const args = process.argv.slice(2);
const file = args.find(arg => !arg.startsWith('--')) || 'apps/api/.env.production';
let env;
try { env = parse(await readFile(file)); }
catch { console.error('FAIL: environment file tidak dapat dibaca.'); process.exit(1); }
const errors = [];
const requireValue = name => {
  const value = env[name]?.trim();
  if (!value || /^(change.?me|replace.?me|your[_-]|<)/i.test(value)) errors.push(`${name} wajib diisi dengan nilai nyata.`);
  return value;
};
for (const name of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'VIPAYMENT_API_ID', 'VIPAYMENT_API_KEY', 'TRIPAY_API_KEY', 'TRIPAY_PRIVATE_KEY', 'TRIPAY_MERCHANT_CODE', 'ADMIN_USER_IDS']) requireValue(name);
try {
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
} catch { errors.push('SUPABASE_URL harus origin HTTPS.'); }
if (!(env.ADMIN_USER_IDS || '').split(',').every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim()))) errors.push('ADMIN_USER_IDS harus UUID, dipisahkan koma.');
if (env.ADMIN_REQUIRE_MFA !== 'true') errors.push('ADMIN_REQUIRE_MFA harus true.');
if (env.ADMIN_MFA_ENROLLMENT_USER_IDS?.trim()) errors.push('Kosongkan ADMIN_MFA_ENROLLMENT_USER_IDS setelah enrollment admin selesai.');
if (env.ADMIN_CATALOG_ENABLED !== 'true') errors.push('ADMIN_CATALOG_ENABLED harus true setelah migrasi katalog diverifikasi.');
if (env.PAYMENT_RECONCILIATION_ENABLED !== 'true') errors.push('PAYMENT_RECONCILIATION_ENABLED harus true.');
const mode = env.TRIPAY_MODE;
if (mode !== 'live') errors.push('TRIPAY_MODE harus live.');
if (env.TRIPAY_BASE_URL !== 'https://tripay.co.id/api') errors.push('TRIPAY_BASE_URL tidak sesuai mode.');
if (env.TRIPAY_CALLBACK_URL !== 'https://api.anresstore.site/v1/payments/callback') errors.push('TRIPAY_CALLBACK_URL harus endpoint callback domain API produksi.');
try {
  const url = new URL(env.TRIPAY_RETURN_URL);
  if (!['https://anresstore.site', 'https://app.anresstore.site'].includes(url.origin) || url.username || url.password || url.hash) throw new Error();
} catch { errors.push('TRIPAY_RETURN_URL harus URL HTTPS storefront/customer yang dipercaya.'); }
if (mode === 'live') {
  if (env.VIPAYMENT_STATUS_POLLING_ENABLED !== 'true') errors.push('Mode live memerlukan VIPAYMENT_STATUS_POLLING_ENABLED=true.');
  if (env.VIPAYMENT_FULFILLMENT_ENABLED !== 'true') errors.push('Mode live memerlukan VIPAYMENT_FULFILLMENT_ENABLED=true.');
}
for (const error of errors) console.error(`FAIL: ${error}`);
if (errors.length) process.exitCode = 1;
else console.log(`PASS: konfigurasi file ${mode}; origin/CORS/proxy disediakan compose.production.yaml. Tidak menguji kredensial, database, DNS, atau provider.`);
