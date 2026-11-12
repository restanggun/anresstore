export type CartItem = { id: string; product: string; category: string; details: string; target: string; contact: string; price: number; quantity: number };
const key = "anres-cart";
export function readCart(): CartItem[] { try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
export function writeCart(items: CartItem[]) { localStorage.setItem(key, JSON.stringify(items)); window.dispatchEvent(new Event("anres-cart-change")); }
