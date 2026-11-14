export const api=(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1").replace(/\/$/,"");
export async function adminRequest(path:string,method="GET",body?:unknown){
 const response=await fetch(`${api}/admin/${path}`,{method,credentials:"include",cache:"no-store",signal:AbortSignal.timeout(20000),headers:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(typeof data?.message==="string"?data.message:"Permintaan gagal. Coba lagi.");return data;
}
export const rupiah=(n:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);
export const stateLabel=(state:string)=>({new:"Menunggu CS",rejected:"Ditolak",in_progress:"Terhubung dengan CS",closed:"Selesai",not_ready:"Menunggu pembayaran",ready:"Antre pengiriman",dispatching:"Mengirim",processing:"Diproses provider",completed:"Selesai",failed:"Gagal",unknown:"Perlu diperiksa",manual_review:"Tinjauan manual",paid:"Lunas",pending:"Menunggu pembayaran",expired:"Kedaluwarsa",refunded:"Dana dikembalikan",creating:"Membuat pembayaran"}[state] || state);
