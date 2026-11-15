import {apiUrl} from "./auth-api";
export async function downloadInvoiceCsv() {
 const response=await fetch(`${apiUrl}/payments/export.csv`,{credentials:"include",cache:"no-store",signal:AbortSignal.timeout(60000)});
 if(!response.ok){const body=await response.json().catch(()=>null);throw new Error(typeof body?.message==="string"?body.message:"Riwayat belum dapat diekspor. Coba lagi.");}
 if(!response.headers.get("content-type")?.startsWith("text/csv"))throw new Error("Format ekspor tidak valid. Coba lagi.");
 const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=`invoice-anres-store-${new Date().toISOString().slice(0,10)}.csv`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
