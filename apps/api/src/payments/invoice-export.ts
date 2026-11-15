import type { PaymentRow } from "./payment-contract";
export function invoiceCsv(rows: PaymentRow[]): string {
 const cell=(value: unknown)=>{
  let text=String(value??"");
  // Prevent spreadsheet formulas from supplier names or customer-entered destinations.
  if (/^\s*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)) text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
 };
 const columns=["Nomor invoice","Tanggal","Produk","Tujuan","Server / zone","Metode pembayaran","Status pembayaran","Harga produk","Total pembayaran","Mode"];
 const data=rows.map(row=>[row.invoice_number??row.id,row.created_at,row.product_name,row.target,row.target_zone??"",row.method,row.status,row.amount,row.details?.amount??row.amount,row.payment_mode??""]);
 return "\uFEFF"+[columns,...data].map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
}
