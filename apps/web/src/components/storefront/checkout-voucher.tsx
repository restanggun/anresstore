"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { paymentRequest } from "@/lib/payment-api";
import { money } from "@/lib/catalog";
import "./checkout-voucher.css";

export type VoucherReference = { code: string } | { id: string };
export type VoucherOffer = {
  id: string; name: string; kind: "percent" | "fixed" | "gift";
  baseAmount: number; discount: number; amount: number; endsAt: string;
};
export type AppliedVoucher = VoucherOffer & { reference: VoucherReference; scope: string };
export type VoucherProduct = {
  source: string; code: string; amount: number; expectedQuantity?: number;
  task?: { pricing_unit?: string; pages: number; deadline_days: number; revisions: number };
};
export type AccountVoucher = { id: string; name: string; ends_at: string };
export const voucherDate = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
});

export function voucherScope(product: VoucherProduct) {
  return JSON.stringify(product);
}

export function CheckoutVoucher({ product, applied, onApply, onChecking, disabled }: {
  product: VoucherProduct;
  applied: AppliedVoucher | null;
  onApply: (offer: AppliedVoucher | null) => void;
  onChecking: (scope: string, active: boolean) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [accounts, setAccounts] = useState<{ signedIn: boolean; rows: AccountVoucher[] }>();
  const [accountError, setAccountError] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const request = useRef<AbortController | null>(null);
  const scope = voucherScope(product);
  useEffect(() => () => request.current?.abort(), []);
  async function check(reference: VoucherReference) {
    if (request.current || disabled) return;
    const controller = new AbortController();
    request.current = controller;
    setChecking(true);
    onChecking(scope, true);
    setMessage("");
    try {
      const result = await paymentRequest<VoucherOffer>("voucher-quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...product, voucher: reference }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      });
      if (controller.signal.aborted) return;
      if (result.baseAmount !== product.amount) throw new Error("Harga produk berubah. Muat ulang katalog sebelum memakai voucher.");
      onApply({ ...result, reference, scope });
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Voucher belum dapat diperiksa.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setChecking(false);
      onChecking(scope, false);
    }
  }
  async function loadAccounts() {
    if (loadingAccounts) return;
    setAccountError("");
    setLoadingAccounts(true);
    try {
      setAccounts(await paymentRequest("vouchers"));
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Voucher akun belum dapat dimuat.");
    } finally {
      setLoadingAccounts(false);
    }
  }

  return <section className="checkout-voucher" aria-labelledby={id + "-heading"}>
    <h3 id={id + "-heading"}><Ticket size={18} aria-hidden="true"/>Voucher (Opsional)</h3>
    {applied ? <>
      <p role="status"><strong>{applied.name}</strong> diterapkan. Hemat {money(applied.discount)}.</p>
      <p>Total produk setelah voucher <strong>{money(applied.amount)}</strong></p>
      <button type="button" className="shop-text-button" disabled={disabled || checking}
        onClick={() => { onApply(null); setMessage(""); }}>Lepas voucher</button>
    </> : <>
      <label htmlFor={id + "-code"} className="sr-only">Kode voucher</label>
      <div className="checkout-voucher-entry">
        <Input id={id + "-code"} name="voucher-code" maxLength={64} autoComplete="off" autoCapitalize="characters"
          autoCorrect="off" spellCheck={false} aria-describedby={message ? id + "-error" : undefined}
          aria-invalid={!!message}
          value={code} disabled={disabled || checking} onChange={event => { setCode(event.target.value); setMessage(""); }}
          placeholder="Masukkan kode voucher"
          onKeyDown={event => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (code.trim()) void check({ code });
            }
          }}/>
        <button type="button" disabled={!code.trim() || checking || disabled} onClick={() => void check({ code })}>Periksa</button>
      </div>
      <details className="checkout-voucher-list" onToggle={event => {
        if (event.currentTarget.open && !accounts) void loadAccounts();
      }}>
        <summary>Pilih voucher akun <ChevronDown size={16} aria-hidden="true"/></summary>
        <div>
          {loadingAccounts && <p role="status">Memuat voucher akun…</p>}
          {accountError && <p role="alert">{accountError} <button className="shop-text-button" type="button"
            onClick={() => void loadAccounts()}>Coba lagi</button></p>}
          {accounts && (!accounts.signedIn ? <p>Masuk dengan akun terverifikasi untuk melihat voucher akun.</p>
            : accounts.rows.length ? <ul>{accounts.rows.map(row => <li key={row.id}>
              <button className="shop-text-button" type="button" disabled={checking || disabled}
                onClick={() => void check({ id: row.id })}>{row.name}</button>
              <small> Berlaku sampai {voucherDate.format(new Date(row.ends_at))} WIB</small>
            </li>)}</ul> : <p>Belum ada voucher aktif di akun ini.</p>)}
        </div>
      </details>
    </>}
    {checking && <p role="status">Memeriksa voucher…</p>}
    {message && <p id={id + "-error"} role="alert">{message}</p>}
  </section>;
}
