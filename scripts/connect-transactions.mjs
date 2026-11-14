import fs from 'node:fs';
function edit(path,from,to){let s=fs.readFileSync(path,'utf8');if(!s.includes(from))throw Error('Missing match '+path+': '+from.slice(0,70));fs.writeFileSync(path,s.replace(from,to));}
edit('apps/api/src/catalog/catalog-mapping.ts','export type CatalogItem = {','export type CatalogItem = {\n  providerCost?: number;');
edit('apps/api/src/catalog/catalog-mapping.ts','items.set(code, { code, name, displayName,','items.set(code, { providerCost: cost, code, name, displayName,');
edit('apps/api/src/admin/admin-store.ts','result.set(code, { code, category:','result.set(code, { ...result.get(code), code, category:');
edit('apps/api/src/payments/payment-contract.ts','id: string; access_hash:','target_zone?: string | null; provider_cost?: number | null;\n  id: string; access_hash:');
edit('apps/api/src/payments/payment-contract.ts','export type PaymentInput = {','export type PaymentInput = { targetZone?: string;');
edit('apps/api/src/payments/payment-contract.ts','[...fields, "expectedAmount"]','[...fields, "expectedAmount", "targetZone"]');
edit('apps/api/src/payments/payment-contract.ts','  return result;','  if (body.targetZone !== undefined) {\n    if (typeof body.targetZone !== "string" || !/^[A-Za-z0-9_-]{0,100}$/.test(body.targetZone) || (result.source !== "game" && body.targetZone)) throw invalid();\n    if (body.targetZone) result.targetZone = body.targetZone;\n  }\n  return result;');
edit('apps/api/src/payments/secure-payments.controller.ts','Param, Post, Req','Param, Post, Query, Req');
edit('apps/api/src/payments/secure-payments.controller.ts','amount: row.amount, status: row.status,','amount: row.amount, status: row.status, target: row.target, targetZone: row.target_zone ?? null,');
edit('apps/api/src/payments/secure-payments.controller.ts','      amount: product.price, method: body.method,','      target_zone: body.targetZone ?? null, provider_cost: product.providerCost ?? null,\n      amount: product.price, method: body.method,');
edit('apps/api/src/payments/secure-payments.controller.ts','[body.source, body.code, body.target]','[body.source, body.code, body.target, body.targetZone ?? ""]');
edit('apps/api/src/payments/secure-payments.controller.ts','    if (product.price !== body.expectedAmount)','    if (product.productSlug === "mobile-legends" && !body.targetZone) throw new HttpException("ID server Mobile Legends wajib diisi terpisah dari ID pemain.", 400);\n    if (product.price !== body.expectedAmount)');
edit('apps/api/src/payments/secure-payments.controller.ts','  @Get("transactions/:id")',`  @Get("transactions")
  async history(@Query("page") page: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store"); this.coarseLimit(req, "history", 60);
    const identity = await this.identities.resolve(req);
    const index = Number(page || 0);
    if (!Number.isSafeInteger(index) || index < 0 || index > 10000) throw new HttpException("Halaman tidak valid.", 400);
    if (!identity.userId && !identity.guestHash) return { payments: [], hasMore: false, userId: null };
    const owner = identity.userId ? "owner_user_id=eq." + identity.userId : "guest_session_hash=eq." + identity.guestHash + "&created_at=gte." + encodeURIComponent(new Date(Date.now()-30*86400000).toISOString());
    const rows = await this.db("?" + owner + "&order=created_at.desc&limit=51&offset=" + index*50);
    return { payments: rows.slice(0,50).filter(row => ownsPayment(row,identity,null)).map(row=>this.publicPayment(row)), hasMore: rows.length>50, userId: identity.userId };
  }
  @Get("transactions/:id")`);
edit('apps/api/src/payments/secure-payments.controller.ts','    return this.publicPayment(refreshed.row, refreshed.delayed);',`    const [fulfillment] = await this.store.request<{ fulfillment_status: string; provider_note: string | null; payment_mode: string }[]>("live_transactions?id=eq." + refreshed.row.id + "&payment_mode=eq.sandbox&select=fulfillment_status,provider_note,payment_mode");
    return { ...this.publicPayment(refreshed.row, refreshed.delayed), fulfillment: fulfillment ? { status: fulfillment.fulfillment_status, note: fulfillment.provider_note, mode: fulfillment.payment_mode } : null };`);
// Mocks keep database calls isolated from real services.
edit('apps/api/test/payments.test.mjs','controller.store={rpc:','controller.store={request:async()=>[],rpc:');
edit('apps/web/src/components/storefront/payment-checkout.tsx','target, amount, contact, customer }:','target, targetZone = "", amount, contact, customer }:');
edit('apps/web/src/components/storefront/payment-checkout.tsx','code: string; target: string; amount:','code: string; target: string; targetZone?: string; amount:');
edit('apps/web/src/components/storefront/payment-checkout.tsx','{ source, code, target, method,','{ source, code, target, targetZone, method,');
edit('apps/web/src/components/storefront/payment-checkout.tsx','export type SandboxPayment = {','export type SandboxPayment = { target?: string; targetZone?: string | null; fulfillment?: {status: string; note: string | null; mode: string} | null;');
edit('apps/web/src/components/storefront/payment-checkout.tsx','<p><strong>Pembayaran Tripay</strong></p>','<p><strong>Pembayaran Tripay sandbox</strong></p><p>Transaksi uji tanpa pengiriman produk sungguhan.</p>');
edit('apps/web/src/components/storefront/payment-checkout.tsx','    {payment && <><h2>','    {payment && <><p>Mode sandbox — tidak ada pembelian produk VIPayment.</p><h2>');
edit('apps/web/src/components/storefront/payment-checkout.tsx','      {payment.lastVerifiedAt &&',`      {payment.fulfillment && <section aria-label="Status pemrosesan"><h3>Pemrosesan pesanan (simulasi)</h3><p>{({not_ready:"Menunggu pembayaran",ready:"Menunggu pemrosesan",processing:"Sedang diproses",completed:"Simulasi selesai",failed:"Pemrosesan gagal",unknown:"Perlu pemeriksaan",manual_review:"Perlu pemeriksaan manual",dispatching:"Sedang dikirim"} as Record<string,string>)[payment.fulfillment.status] ?? payment.fulfillment.status}</p>{payment.fulfillment.note && <p>{payment.fulfillment.note}</p>}</section>}
      {payment.lastVerifiedAt &&`);
edit('apps/web/src/components/storefront/payment-checkout.tsx','  useEffect(() => { void refresh(); }, [id]);',`  useEffect(() => { void refresh(); }, [id]);
  useEffect(() => { if (!payment || ["failed","expired","refunded"].includes(payment.status) || payment.fulfillment?.status === "completed") return; const timer = setInterval(() => { if (!document.hidden && !busy) void refresh(); }, 30000); return () => clearInterval(timer); }, [id, payment, busy]);`);
edit('apps/web/src/components/storefront/catalog.tsx','const [target, setTarget] = useState("");','const [target, setTarget] = useState(""); const [targetZone, setTargetZone] = useState("");');
edit('apps/web/src/components/storefront/catalog.tsx','"ID pemain / ID server"','"ID pemain"');
edit('apps/web/src/components/storefront/catalog.tsx','"Masukkan ID pemain dan server"','"Masukkan ID pemain"');
edit('apps/web/src/components/storefront/catalog.tsx','<label>Nama pelanggan<Input','{product !== "Roblox" && <label>ID server / zone {product === "Mobile Legends" ? "(wajib)" : "(jika diperlukan)"}<Input value={targetZone} maxLength={100} onChange={e=>setTargetZone(e.target.value.replace(/[^A-Za-z0-9_-]/g,""))} placeholder="Contoh: 1234"/></label>}<label>Nama pelanggan<Input');
edit('apps/web/src/components/storefront/catalog.tsx','code={selectedLive.code} target={target}','code={selectedLive.code} target={target} targetZone={gameFlow ? targetZone : ""}');
edit('apps/web/src/components/storefront/catalog.tsx','<dd>{target}</dd>','<dd>{target}{gameFlow && targetZone ? ` / server ${targetZone}` : ""}</dd>');
