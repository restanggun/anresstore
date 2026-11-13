import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import {setDefaultResultOrder} from 'node:dns';
import {setDefaultAutoSelectFamily} from 'node:net';
config({path:fileURLToPath(new URL('../apps/api/.env',import.meta.url)),quiet:true});
if(process.env.API_OUTBOUND_IPV4_ONLY==='true'){setDefaultResultOrder('ipv4first');setDefaultAutoSelectFamily(false);}
const require=createRequire(import.meta.url);
const {TripayClient,tripayConfig}=require('../apps/api/dist/payments/tripay-client.js');

// Default is read-only. --create-test explicitly creates one dummy sandbox payment.
async function main() {
  tripayConfig();
  const channels=await new TripayClient().channels();
  console.log(JSON.stringify({sandbox:true,activeChannels:channels.map(({code,name,minimum_amount,maximum_amount})=>({code,name,minimum:minimum_amount,maximum:maximum_amount})),storageConfigured:!!(process.env.SUPABASE_SECRET_KEY?.trim()||process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),callbackConfigured:!!process.env.TRIPAY_CALLBACK_URL?.trim()},null,2));
  const secret=process.env.SUPABASE_SECRET_KEY?.trim()||process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if(secret&&process.env.SUPABASE_URL) {
    const response=await fetch(`${process.env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/sandbox_payments?select=id&limit=0`,{headers:{apikey:secret,...(secret.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${secret}`})},signal:AbortSignal.timeout(10000)});
    console.log(JSON.stringify({storageReady:response.ok,storageHttpStatus:response.status}));
  }
  if(process.argv.includes('--create-test')) {
    const channel=channels.find(item=>item.code==='QRIS2')??channels.find(item=>item.minimum_amount<=10000&&item.maximum_amount>=10000);
    if(!channel||!process.env.TRIPAY_CALLBACK_URL) throw new Error('Channel atau callback belum siap.');
    const client=new TripayClient();
    const payment=await client.create({id:randomUUID(),method:channel.code,amount:10000,name:'Sandbox Integration Test',email:'sandbox@example.com',phone:'081234567890',product:'Sandbox test - no fulfillment',code:'SANDBOX-TEST',callback:process.env.TRIPAY_CALLBACK_URL,returnUrl:process.env.TRIPAY_RETURN_URL||'http://localhost:3000'});
    const verified=await client.detail(payment.reference);
    if(verified.reference!==payment.reference||verified.merchant_ref!==payment.merchant_ref||verified.status!=='UNPAID') throw new Error('Detail sandbox tidak sesuai.');
    console.log(JSON.stringify({testPayment:{reference:verified.reference,method:verified.payment_method,amount:verified.amount,fee:verified.fee_customer,status:verified.status,detailVerified:true,storedInApp:false}},null,2));
  }
}
main().catch(error=>{console.error(error?.getResponse?.() || 'Koneksi Tripay sandbox gagal. Periksa jaringan dan konfigurasi.');process.exitCode=1;});
