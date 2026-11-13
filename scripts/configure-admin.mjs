import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
config({path:'apps/api/.env',quiet:true});
const email=process.argv[2];
if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email required');
const url=process.env.SUPABASE_URL?.replace(/\/$/,''), key=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url || !key) throw new Error('Server database config missing');
let account;
for(let page=1;page<=100;page++){
 const response=await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`,{headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`})},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Account lookup failed: HTTP ${response.status}`);
 const data=await response.json();
 account=data.users?.find(user=>user.email?.toLowerCase()===email.toLowerCase());
 if(account || !data.users?.length || data.users.length<1000)break;
}
if(!account)throw new Error('Account not found; sign up on website first.');
if(!account.email_confirmed_at)throw new Error('Confirm account email before granting administrator access.');
const path='apps/api/.env';let content=readFileSync(path,'utf8');
const ids=[...new Set([...(process.env.ADMIN_USER_IDS || '').split(',').map(v=>v.trim()).filter(Boolean),account.id])].join(',');
content=/^ADMIN_USER_IDS=.*$/m.test(content)?content.replace(/^ADMIN_USER_IDS=.*$/m,`ADMIN_USER_IDS=${ids}`):`${content.trimEnd()}\nADMIN_USER_IDS=${ids}\n`;
writeFileSync(path,content);
const probe=await fetch(`${url}/rest/v1/managed_products?select=id&limit=1`,{headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`})},signal:AbortSignal.timeout(15000)});
console.log(JSON.stringify({adminEmail:email,configured:true,catalogTableAvailable:probe.ok,catalogTableStatus:probe.status}));
