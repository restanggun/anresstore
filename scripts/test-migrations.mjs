import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema public,auth to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
    create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant execute on function auth.uid() to public;`);
  const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
  assert.equal(new Set(files.map(f=>f.split('_')[0])).size,files.length,'Duplicate migration versions');
  for(const file of files) {
    if (file === '20261118140000_production_only.sql') await db.exec(await readFile('supabase/tests/production-cutover-fixtures.sql','utf8'));
    try { await db.exec(await readFile('supabase/migrations/'+file,'utf8')); }
    catch(error) { throw new Error('Migration failed: '+file,{cause:error}); }
    if (file === '20261118150000_remove_nonproduction_history.sql') {
      await db.exec(await readFile('supabase/tests/production-cutover.sql','utf8'));
      console.log('Production cutover preserves real invoices and audit, removes nonproduction data and retires old RPCs');
    }
  }
  console.log(`Replayed ${files.length} migrations on a clean PostgreSQL database`);
  await db.exec(await readFile('supabase/tests/invoice-numbers.sql','utf8'));
  console.log('ANRS invoice format, date, uniqueness, replay, projection and immutability passed');
  if (process.argv.includes('--snapshot')) {
    const snapshot = await db.query(await readFile('scripts/schema-snapshot.sql','utf8'));
    await writeFile('output/schema-expected.json',JSON.stringify(snapshot.rows,null,2));
  }
  await db.exec(await readFile('supabase/tests/payment-pipeline.sql','utf8'));
  console.log('Production reservations, immutable metadata, RLS and fulfillment tests passed');
  await db.exec(await readFile('supabase/tests/catalog-checkout.sql','utf8'));
  await db.exec(await readFile('supabase/tests/product-cost-profit.sql','utf8'));
  await db.exec(await readFile('supabase/tests/task-pricing.sql','utf8'));
  console.log('Catalog revisions reject stale checkout and preserve reserved invoice snapshots');
  await db.exec(await readFile('supabase/tests/fulfillment-limits.sql','utf8'));
  console.log('Fulfillment pause, per-order/hour/day budgets, count limits and durable reservations passed');
  await db.exec(await readFile('supabase/tests/support-workflow.sql','utf8'));
  console.log('Support tickets: waiting, acceptance, rejection, privacy and idempotent chat tests passed');
  await db.exec(await readFile('supabase/tests/support-delivery.sql','utf8'));
  console.log('Support unread counts, status-only email queue, exclusive claims and append-only audit passed');
  await db.exec(await readFile('supabase/tests/refund-requests.sql','utf8'));
  console.log('Refund ownership, duplicate protection, 50k threshold, sandbox exclusion, review/evidence and gateway-state integrity passed');
  await db.exec(await readFile('supabase/tests/invoice-account-claims.sql','utf8'));
  console.log('Guest linking, verified email/cookie isolation, account projection, pending-intent deduplication and recovery attempt/expiry/replay protection passed');
  await db.exec(await readFile('supabase/tests/ai-help-sessions.sql','utf8'));
  console.log('AI sessions: history, ownership, idempotent turns and complete atomic CS handoff passed');
} finally { await db.close(); }
