import {test} from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {adminDb} from '../dist/admin/admin-store.js';
import {SupportEmailWorker,supportEmailContent} from '../dist/help/support-email-worker.js';
import {AdminNotificationEmailWorker} from '../dist/admin/admin-notification-email-worker.js';
const id='eeeeeeee-0000-4000-8000-000000000001',user='dddddddd-0000-4000-8000-000000000001';
async function isolated(fn){const env={...process.env},fetch=global.fetch,transport=nodemailer.createTransport;Object.assign(process.env,{SUPABASE_URL:'https://support.example',SUPABASE_SECRET_KEY:'sb_secret_test',SUPPORT_EMAIL_ENABLED:'true',SMTP_HOST:'smtp.example',SMTP_USER:'user',SMTP_PASSWORD:'secret',SMTP_FROM:'Anres <support@example.com>',SUPPORT_CS_EMAILS:'cs@example.com',AUTH_ADMIN_ORIGIN:'https://admin.example',AUTH_APP_ORIGIN:'https://app.example'});try{await fn();}finally{process.env=env;global.fetch=fetch;nodemailer.createTransport=transport;}}
test('audit inserts omit upsert preference while normal writes retain it',()=>isolated(async()=>{
 const headers=[];global.fetch=async(_url,options)=>{headers.push(options.headers.Prefer);return Response.json([]);};
 await adminDb('admin_audit_log','','POST',{actor_id:user,action:'support.status',target:id});
 await adminDb('admin_roles','','POST',{id:user});
 assert.equal(headers[0],'return=representation');assert.ok(headers[1].includes('resolution=merge-duplicates'));
}));
test('disabled SMTP does not claim jobs or send messages',()=>isolated(async()=>{process.env.SUPPORT_EMAIL_ENABLED='false';global.fetch=async()=>{throw Error('Unexpected network');};nodemailer.createTransport=()=>{throw Error('Unexpected SMTP');};await new SupportEmailWorker().run();}));
test('SMTP sends queued ticket events and acknowledges the exact claim',()=>isolated(async()=>{
 const sent=[],saved=[],worker=new SupportEmailWorker();worker.createTransport=()=>({sendMail:async msg=>{sent.push(msg);return {messageId:'smtp-id',rejected:[]};},close(){}});
 global.fetch=async(url,options)=>{if(String(url).includes('claim_support_emails'))return Response.json([{id,claim_token:user,conversation_id:id,event:'new',recipient_role:'staff',subject:'Bantuan pesanan'}]);saved.push(JSON.parse(options.body));return Response.json([]);};
 await worker.run();assert.deepEqual(sent[0].to,['cs@example.com']);assert.ok(sent[0].text.includes('https://admin.example/'));assert.equal(saved[0].p_claim,user);assert.equal(saved[0].p_success,true);
}));
test('customer lifecycle email uses verified account email and failure remains retryable',()=>isolated(async()=>{
 const acknowledgements=[];let attempts=0;const worker=new SupportEmailWorker();worker.createTransport=()=>({sendMail:async msg=>{attempts++;assert.deepEqual(msg.to,['customer@example.com']);throw Error('SMTP unavailable with secret details');},close(){}});
 global.fetch=async(url,options)=>{if(String(url).includes('claim_support_emails'))return Response.json([{id,claim_token:user,conversation_id:id,event:'rejected',recipient_role:'customer',recipient_user_id:user,subject:'Bantuan',rejection_reason:'Duplikat'}]);if(String(url).includes('/auth/v1/admin/users/'))return Response.json({email:'customer@example.com',email_confirmed_at:new Date().toISOString()});acknowledgements.push(JSON.parse(options.body));return Response.json([]);};
 await worker.run();assert.equal(attempts,1);assert.equal(acknowledgements[0].p_success,false);assert.ok(!acknowledgements[0].p_error.includes('secret'));
}));
test('lifecycle email contains status and reason without chat transcript',()=>{
 const mail=supportEmailContent({id,conversation_id:id,event:'rejected',recipient_role:'customer',subject:'Bantuan',rejection_reason:'Tiket duplikat'},'https://app.example');
 assert.ok(mail.subject.includes('ditolak'));assert.ok(mail.text.includes('Tiket duplikat'));assert.ok(mail.text.includes('/profil#support-inbox'));
});

test('admin alerts claim only staff events and keep rejected SMTP deliveries retryable', () => isolated(async () => {
  const sent = [];
  const acknowledgements = [];
  const worker = new AdminNotificationEmailWorker();
  worker.createTransport = () => ({
    sendMail: async message => {
      sent.push(message);
      return {messageId:'smtp-id', rejected: sent.length === 1 ? [] : ['orders@example.com']};
    },
    close() {},
  });
  const job = {id, claim_token:user, event:'admin', subject:'ANRS-ORDER-123 · Paket uji'};
  global.fetch = async (url, options) => {
    if (String(url).endsWith('/claim_support_emails')) {
      assert.deepEqual(JSON.parse(options.body), {p_channel:'resend'});
      return Response.json([
        {...job, admin_title:'Pesanan baru'},
        {...job, id:user, admin_title:'Periksa bukti pembayaran aplikasi premium'},
      ]);
    }
    assert.ok(String(url).endsWith('/finish_support_email'));
    acknowledgements.push(JSON.parse(options.body));
    return Response.json([]);
  };
  process.env.ADMIN_NOTIFICATION_EMAIL_ENABLED = 'false';
  await worker.run();
  assert.deepEqual(sent, []);
  process.env.ADMIN_NOTIFICATION_EMAIL_ENABLED = 'true';
  process.env.ADMIN_NOTIFICATION_EMAILS = 'orders@example.com';
  await worker.run();
  assert.deepEqual(sent.map(message => message.to), [['orders@example.com'], ['orders@example.com']]);
  assert.match(sent[0].subject, /Pesanan baru/);
  assert.match(sent[0].text, /ANRS-ORDER-123/);
  assert.match(sent[0].text, /https:\/\/admin\.example\//);
  assert.match(sent[1].subject, /Periksa bukti pembayaran aplikasi premium/);
  assert.deepEqual(acknowledgements, [
    {p_id:id, p_claim:user, p_success:true, p_provider:'smtp-id', p_error:null},
    {p_id:user, p_claim:user, p_success:false, p_provider:null, p_error:'SMTP delivery unavailable'},
  ]);
}));

test('support worker claims only customer events while admin SMTP handles staff alerts', () => isolated(async () => {
  process.env.ADMIN_NOTIFICATION_EMAIL_ENABLED = 'true';
  const worker = new SupportEmailWorker();
  worker.createTransport = () => ({close() {}});
  global.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/claim_support_emails'));
    assert.deepEqual(JSON.parse(options.body), {p_channel:'customer'});
    return Response.json([]);
  };
  await worker.run();
}));
