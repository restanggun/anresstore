import { apiUrl } from "./auth-api";
export type CartItem = { id: string; product: string; category: string; details: string; target: string; contact: string; price: number; quantity: number };
type AccountCart = { items: CartItem[]; version: number; userId: string; conflict: boolean };
const key = "anres-cart";
let items: CartItem[] = [];
let mode: "guest" | "account" | null = null;
let version = 0;
let userId = "";
let loading: Promise<void> | null = null;
let saving = false;
function guestCart(): CartItem[] { try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function notify() { window.dispatchEvent(new Event("anres-cart-change")); }
async function guestLock<T>(operation: () => Promise<T> | T): Promise<T> {
 if (!navigator.locks) throw new Error("Browser ini tidak mendukung sinkronisasi keranjang antar tab.");
 return navigator.locks.request("anres-guest-cart", operation);
}
async function accountRequest(action: "merge" | "save", next: CartItem[], expectedVersion?: number): Promise<AccountCart> {
 const response = await fetch(`${apiUrl}/auth/cart`, {method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action,items:next,version:expectedVersion,userId})});
 if (!response.ok) throw new Error(response.status === 409 ? "Sesi berubah. Muat ulang halaman." : "Keranjang gagal disimpan. Coba lagi.");
 return response.json() as Promise<AccountCart>;
}
function applyAccount(data: AccountCart) { items = data.items; version = data.version; userId = data.userId; notify(); }
export function initCart(): Promise<void> {
 if (mode) return Promise.resolve();
 if (loading) return loading;
 loading = (async () => {
  const response = await fetch(`${apiUrl}/auth/cart`, {credentials:"include"});
  if (response.status === 401) { mode = "guest"; items = guestCart(); }
  else {
   if (!response.ok) throw new Error("Keranjang tidak dapat dimuat. Coba muat ulang halaman.");
   const account = await response.json() as AccountCart;
   userId = account.userId;
   const merged = await guestLock(async () => {
    const guest = guestCart();
    if (!guest.length) return account;
    const result = await accountRequest("merge", guest);
    localStorage.removeItem(key);
    return result;
   });
   applyAccount(merged); mode = "account";
  }
  notify();
 })().catch(error => { loading = null; throw error; });
 return loading;
}
export function readCart(): CartItem[] { return items.map(item => ({...item})); }
export async function writeCart(next: CartItem[]) {
 await initCart();
 if (saving) throw new Error("Perubahan keranjang sedang disimpan. Coba lagi.");
 saving = true;
 try {
  if (mode === "account") {
   const result = await accountRequest("save", next, version);
   applyAccount(result);
   if (result.conflict) throw new Error("Keranjang berubah di perangkat atau tab lain. Data terbaru sudah dimuat; coba lagi.");
  } else {
   await guestLock(() => {
    if (JSON.stringify(guestCart()) !== JSON.stringify(items)) {
     items = guestCart(); notify();
     throw new Error("Keranjang berubah di tab lain. Data terbaru sudah dimuat; coba lagi.");
    }
    localStorage.setItem(key, JSON.stringify(next)); items = next.map(item => ({...item})); notify();
   });
  }
 } finally { saving = false; }
}
export function refreshGuestCart() { if (mode === "guest") { items = guestCart(); notify(); } }
