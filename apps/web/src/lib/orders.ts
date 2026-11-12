import { apiUrl } from "./auth-api";
import type { CartItem } from "./cart";

export type OrderStatus = "awaiting_payment" | "processing" | "delivered" | "revision" | "completed" | "cancelled";
export type OrderItem = CartItem & {status:OrderStatus};
export type Order = {id:string;created_at:string;payment_method:string;items:OrderItem[]};
export const statusLabels:Record<OrderStatus,string> = {awaiting_payment:"Menunggu pembayaran",processing:"Diproses",delivered:"Terkirim",revision:"Revisi",completed:"Selesai",cancelled:"Dibatalkan"};
export function statusSteps(category:string):OrderStatus[] {
 return category === "Format tugas" ? ["awaiting_payment","processing","delivered","revision","completed"] : ["awaiting_payment","processing","delivered","completed"];
}
const key="anres-simulated-orders";
function guestOrders():Order[] { try { const value=JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
export async function loadOrders():Promise<{orders:Order[];userId:string|null}> {
 const response=await fetch(`${apiUrl}/auth/orders`,{credentials:"include"});
 if(response.status === 401) return {orders:guestOrders(),userId:null};
 if(!response.ok) throw new Error("Riwayat pesanan tidak dapat dimuat. Coba lagi.");
 return response.json();
}
export async function loadOrder(id:string):Promise<{order:Order|null;userId:string|null}> {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return {order:null,userId:null};
 const response=await fetch(`${apiUrl}/auth/orders/${encodeURIComponent(id)}`,{credentials:"include"});
 if(response.status === 401) return {order:guestOrders().find(order=>order.id===id) || null,userId:null};
 if(!response.ok) throw new Error("Invoice tidak dapat dimuat. Coba lagi.");
 return response.json();
}
export async function createOrder(id:string, paymentMethod:string, items:CartItem[]) {
 const {userId}=await loadOrders();
 if(userId) {
  const response=await fetch(`${apiUrl}/auth/orders`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,userId,paymentMethod,items})});
  if(!response.ok) throw new Error(response.status === 409 ? "Sesi berubah. Muat ulang halaman." : "Pesanan belum dapat disimpan. Coba lagi.");
 } else {
  if(!navigator.locks) throw new Error("Browser ini tidak mendukung penyimpanan pesanan yang aman antar tab.");
  await navigator.locks.request("anres-simulated-orders",() => {
   const orders=guestOrders();
   if(!orders.some(order=>order.id===id)) localStorage.setItem(key,JSON.stringify([{id,created_at:new Date().toISOString(),payment_method:paymentMethod,items:items.map(item=>({...item,status:"awaiting_payment" as const}))},...orders]));
  });
 }
}
