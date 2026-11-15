import {PGlite} from '@electric-sql/pglite';
import {readdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema public,auth to anon,authenticated,service_role;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());create table auth.identities(user_id uuid,provider text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
 for(const file of files.filter(f=>f<'20261118130000'))await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 const ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
 for(const[index,id]of ids.entries()){
  const p={id,payment_mode:index?'live':'sandbox',access_hash:'a'.repeat(64),request_hash:'b'.repeat(64),source:'game',provider_code:'FF12-S13',product_name:'Free Fire - 12 Diamond',target:'12345',amount:2100,method:'QRIS2',guest_session_hash:String(index+1).repeat(64),checkout_hash:'c'.repeat(64),fulfillment_mode:'manual'};
  await db.query('select public.reserve_payment($1::jsonb)',[JSON.stringify(p)]);
  await db.query("update public.sandbox_payments set status='unknown',revision=revision+1 where id=$1",[id]);
 }
 await db.exec(await readFile('supabase/migrations/20261118130000_invoice_numbers.sql','utf8'));
 const rows=(await db.query('select id,invoice_number,merchant_ref,status,payment_mode from public.sandbox_payments order by id')).rows;
 assert.equal(rows.length,2,'Upgrade must preserve historical invoices');
 assert.notEqual(rows[0].invoice_number,rows[1].invoice_number);
 for(const row of rows){
  assert.match(row.invoice_number,/^ARNS-FF12S13-FREEFIRE-\d{8}-[A-F0-9]{16}$/);
  assert.equal(row.merchant_ref,row.id,'Already sent gateway references must remain unchanged');
  assert.equal(row.status,'unknown','Upgrade cannot claim a successful payment');
  assert.equal((await db.query('select invoice_number from public.live_transactions where id=$1',[row.id])).rows[0].invoice_number,row.invoice_number);
 }
 console.log('Populated invoice upgrade passed: ARNS backfill, unchanged gateway references/statuses, no data loss');
}finally{await db.close();}
