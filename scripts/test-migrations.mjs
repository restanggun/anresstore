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
    try { await db.exec(await readFile('supabase/migrations/'+file,'utf8')); }
    catch(error) { throw new Error('Migration failed: '+file,{cause:error}); }
  }
  console.log(`Replayed ${files.length} migrations on a clean PostgreSQL database`);
  if (process.argv.includes('--snapshot')) {
    const snapshot = await db.query(await readFile('scripts/schema-snapshot.sql','utf8'));
    await writeFile('output/schema-expected.json',JSON.stringify(snapshot.rows,null,2));
  }
  await db.exec(await readFile('supabase/tests/payment-pipeline.sql','utf8'));
  console.log('Payment modes, reservation, immutable metadata, RLS and fulfillment tests passed');
  await db.exec(await readFile('supabase/tests/support-workflow.sql','utf8'));
  console.log('Support tickets: waiting, acceptance, rejection, privacy and idempotent chat tests passed');
  await db.exec(await readFile('supabase/tests/ai-help-sessions.sql','utf8'));
  console.log('AI sessions: history, ownership, idempotent turns and complete atomic CS handoff passed');
} finally { await db.close(); }
