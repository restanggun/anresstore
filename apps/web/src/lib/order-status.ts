type OrderPayment = {
  status: string; needsReview: boolean; manualPayment?: boolean; manualProofSubmitted?: boolean;
  refund?: {refund_status:string} | null;
  fulfillment?: { status: string; note: string | null } | null;
};
export type OrderStatus = {
  title: string; description: string; paymentLabel: string; deliveryLabel: string;
  tone: "pending" | "paid" | "review"; step: number; needsHelp: boolean; reason?: string;
};
const paymentLabels: Record<string,string> = {
  creating: "Disiapkan", pending: "Menunggu pembayaran", paid: "Lunas", failed: "Gagal",
  expired: "Kedaluwarsa", refunded: "Dikembalikan", unknown: "Sedang diperiksa",
};
const deliveryLabels: Record<string,string> = {
  not_ready: "Belum diproses", ready: "Dalam antrean", dispatching: "Sedang dikirim",
  processing: "Sedang diproses", completed: "Berhasil", failed: "Gagal",
  unknown: "Perlu diperiksa", manual_review: "Ditinjau tim",
};
export function deliveryFailureReason(note: string | null | undefined): string {
  if (/invalid.*(user|zone|server)|invalid.*(player|account).*id/i.test(note || "")) return "ID pemain atau server / zone ditolak penyedia. Cocokkan dengan data akun gamemu.";
  if (/invalid.*(destination|phone|number|target)/i.test(note || "")) return "Nomor atau tujuan layanan tidak valid. Periksa kembali tujuan pada rincian pesanan.";
  if (/out.of.stock|not.available|unavailable|stok.*habis/i.test(note || "")) return "Produk sedang tidak tersedia di penyedia.";
  return "Penyedia belum berhasil menyelesaikan pengiriman. Tim CS dapat membantu memeriksa penyebabnya.";
}
export function orderStatus(payment: OrderPayment): OrderStatus {
  const fulfillment = payment.fulfillment?.status;
  const base = {
    paymentLabel: paymentLabels[payment.status] || "Sedang diperiksa",
    deliveryLabel: payment.status === "paid" ? deliveryLabels[fulfillment || ""] || "Belum tersedia" : "Belum diproses",
    tone: "pending" as const, step: payment.status === "paid" ? 3 : 2, needsHelp: false,
  };
  if (payment.refund?.refund_status === "completed") return {...base,title:"Pengembalian dana dicatat admin",description:"Admin telah mencatat transfer pengembalian. Periksa rekening tujuan dan referensi transfer di tiket. Hubungi CS jika dana belum diterima.",tone:"paid",step:4};
  if (["requested","in_review"].includes(payment.refund?.refund_status || "")) return {...base,title:payment.refund?.refund_status==="requested"?"Pengembalian dana sedang diajukan":"Pengembalian dana diperiksa admin",description:"Pengajuanmu tercatat dalam tiket CS. Dana belum dinyatakan kembali. Pantau tiket untuk hasil pemeriksaan; jangan membuat pembayaran pengganti.",tone:"review",needsHelp:true};
  if (payment.needsReview) return {...base, title:"Pesanan perlu diperiksa", description:"Tim perlu memeriksa transaksi ini. Jangan bayar atau membuat pesanan pengganti. Hubungi CS dengan nomor invoice ini.", tone:"review", needsHelp:true};
  if (payment.status === "paid") {
    switch (fulfillment) {
      case "completed": return {...base,title:"Pesanan berhasil",description:"Pembayaran terverifikasi dan pengiriman produk sudah dinyatakan berhasil oleh penyedia. Periksa akun atau tujuan pesananmu.",tone:"paid",step:4};
      case "failed": return {...base,title:"Pengiriman produk gagal",description:"Pembayaran sudah diterima, tetapi produk gagal dikirim. Hubungi CS dengan nomor invoice ini untuk penanganan lebih lanjut. Jangan bayar ulang.",reason:deliveryFailureReason(payment.fulfillment?.note),tone:"review",needsHelp:true};
      case "unknown": return {...base,title:"Pengiriman perlu diperiksa",description:"Pembayaran sudah diterima, tetapi hasil pengiriman belum dapat dipastikan. Jangan membuat pesanan atau pembayaran pengganti agar produk tidak terkirim dua kali. Hubungi CS untuk pemeriksaan.",tone:"review",needsHelp:true};
      case "manual_review": return {...base,title:"Pesanan dalam pemeriksaan tim",description:"Pembayaran sudah diterima. Tim perlu memeriksa pemrosesan pesanan ini. Hubungi CS dengan nomor invoice; jangan bayar ulang.",tone:"review",needsHelp:true};
      case "dispatching": return {...base,title:"Produk sedang dikirim",description:"Pembayaran sudah diterima. Pesanan sedang diteruskan ke penyedia. Status akan diperbarui otomatis; kamu tidak perlu bayar lagi."};
      case "processing": return {...base,title:"Pesanan sedang diproses",description:"Pembayaran sudah diterima dan penyedia sedang memproses produkmu. Tunggu pembaruan status di invoice ini; tidak perlu membuat pesanan baru."};
      case "ready": case "not_ready": return {...base,title:"Pembayaran lunas, pesanan dalam antrean",description:"Pembayaran sudah diterima. Pesanan menunggu giliran untuk diproses. Status pengiriman akan diperbarui otomatis."};
      default: return {...base,title:"Pembayaran lunas, pengiriman sedang diperiksa",description:"Pembayaran sudah diterima. Status pengiriman belum tersedia. Periksa kembali invoice atau hubungi CS jika belum ada pembaruan."};
    }
  }
  if (payment.manualPayment && payment.status === "pending") return {
    ...base,
    title: payment.manualProofSubmitted ? "Bukti transfer sedang diperiksa" : "Menunggu pembayaran",
    description: payment.manualProofSubmitted ? "Admin sedang mencocokkan bukti transfer. Tunggu pembaruan sebelum membayar lagi." :
      "Ikuti instruksi pembayaran QRIS untuk invoice ini. Pesanan diproses setelah admin memverifikasi pembayaran.",
  };
  const states: Record<string,[string,string]> = {
    creating:["Menyiapkan pembayaran","Invoice sudah dibuat. Rincian pembayaran sedang disiapkan. Jangan membuat pembayaran pengganti."],
    pending:["Menunggu pembayaran","Selesaikan pembayaran melalui Tripay. Produk diproses setelah pembayaran terverifikasi."],
    failed:["Pembayaran gagal","Pembayaran belum berhasil dikonfirmasi dan produk belum diproses. Jika saldo sudah terpotong, hubungi CS sebelum mencoba lagi."],
    expired:["Pembayaran kedaluwarsa","Batas waktu pembayaran sudah lewat dan produk belum diproses. Jika kamu sudah membayar, hubungi CS dengan nomor invoice ini."],
    refunded:["Pembayaran dikembalikan",payment.manualPayment ? "Admin mencatat pengembalian pembayaran ini. Hubungi CS jika dana belum diterima." : "Tripay telah mengonfirmasi pengembalian pembayaran ini. Hubungi CS jika dana belum diterima."],
    unknown:["Pembayaran sedang diperiksa","Hasil pembayaran belum dapat dipastikan. Jangan bayar ulang atau membuat pesanan pengganti. Periksa status atau hubungi CS."],
  };
  const [title,description] = states[payment.status] || states.unknown!;
  const needsHelp = ["unknown","failed","expired","refunded"].includes(payment.status) || !states[payment.status];
  return {...base,title,description,tone:needsHelp?"review":"pending",needsHelp};
}
