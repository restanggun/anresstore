import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {setDefaultResultOrder} from 'node:dns';
import {setDefaultAutoSelectFamily} from 'node:net';

config({path:fileURLToPath(new URL('../apps/api/.env',import.meta.url)),quiet:true});
if(process.env.API_OUTBOUND_IPV4_ONLY==='true'){setDefaultResultOrder('ipv4first');setDefaultAutoSelectFamily(false);}
const require=createRequire(import.meta.url);
const {mapCatalog}=require('../apps/api/dist/catalog/catalog-mapping.js');

// Read-only diagnostics: never logs credentials, signatures, balances or customer data.
async function main() {
 const id=process.env.VIPAYMENT_API_ID?.trim(),key=process.env.VIPAYMENT_API_KEY?.trim();
 if(!id||!key) throw new Error('Isi VIPAYMENT_API_ID dan VIPAYMENT_API_KEY pada apps/api/.env.');
 const sign=createHash('md5').update(id+key).digest('hex');
 for(const source of ['game','prepaid']) {
  const response=await fetch(`https://vip-reseller.co.id/api/${source==='game'?'game-feature':'prepaid'}`,{
   method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({key,sign,type:'services'}),signal:AbortSignal.timeout(20000),
  });
  const data=await response.json();
  if(!response.ok||data.result!==true||!Array.isArray(data.data)) {
   const message=String(data.message||'Respons penyedia tidak valid').split(key).join('[redacted]').split(id).join('[redacted]').split(sign).join('[redacted]').slice(0,300);
   throw new Error(`VIPayment ${source}: ${message}`);
  }
  const items=mapCatalog(source,data.data);
  const products=[...new Set(items.map(item=>item.product))];
  const categories=Object.fromEntries(['game','apps','prepaid'].map(category=>[category,items.filter(item=>item.category===category).length]));
  const counts=Object.fromEntries(products.map(product=>[product,items.filter(item=>item.product===product).length]));
  console.log(JSON.stringify({source,received:data.data.length,available:data.data.filter(item=>item.status==='available').length,mapped:items.length,categories,products:counts},null,2));
 }
}
main().catch(error=>{console.error(error instanceof Error && !error.cause ? error.message : 'Koneksi katalog VIPayment gagal. Periksa jaringan dan whitelist IP.');process.exitCode=1;});
