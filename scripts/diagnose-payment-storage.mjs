import { config } from 'dotenv';
config({ path: 'apps/api/.env', quiet: true });
const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!key || !process.env.SUPABASE_URL) throw new Error('Storage configuration missing');
const headers = { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' };
for (const [path, body] of [
  ['rpc/consume_payment_rate', { p_key: `diagnostic:${Date.now()}`, p_limit: 2, p_seconds: 60 }],
  ['payments?select=id,invoice_number,merchant_ref,payment_mode,guest_session_hash,checkout_hash,provider_cost,target_zone&limit=0'],
  ['live_transactions?select=id,invoice_number,fulfillment_status,payment_mode&limit=0'],
]) {
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, { headers, method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  console.log(JSON.stringify({ probe: path, status: response.status, code: result?.code, message: response.ok ? undefined : result?.message }));
  if (!response.ok) process.exitCode = 1;
}
