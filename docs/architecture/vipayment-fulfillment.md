# Pemenuhan pesanan VIPayment

Worker membaca live_transactions yang lunas dan siap diproses. RPC claim_live_fulfillment mengklaim pesanan secara atomik; hanya satu worker dapat mengirimnya. Batas nominal dan anggaran diperiksa database sebelum klaim.

VIPAYMENT_FULFILLMENT_ENABLED=true mengizinkan pembelian produk. Nilai false menjeda pembelian baru, sementara VIPAYMENT_STATUS_POLLING_ENABLED=true tetap memeriksa pesanan yang sudah dikirim. Hasil ambigu tidak otomatis dikirim ulang.

Identitas SKU, tujuan, zona, jumlah paket dan biaya provider berasal dari snapshot server. Hasil provider diperiksa terhadap identitas pesanan. Status pembayaran dan pemenuhan adalah dua status terpisah; lunas belum berarti produk terkirim.

Layanan manual tidak dikirim ke supplier. Admin mencatat pengerjaan setelah pembayaran terverifikasi. Operasi memerlukan rekonsiliasi pembayaran/provider dan penanganan status unknown atau manual_review.
