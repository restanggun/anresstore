# Monitoring dan SOP transaksi

Status: perangkat dan SOP siap di repository; aktivasi VPS, penerima alert dan latihan penanganan insiden belum dilakukan. Sebelum live, pemilik usaha menunjuk PIC operasi, pengganti, dan penanggung jawab persetujuan refund. Catat nama, kontak privat, jadwal jaga dan bukti drill di catatan release. Tanpa penerima alert aktif, jangan buka pembayaran live.

Penetapan awal: pemilik usaha menjadi penanggung jawab dan approver refund; admin utama menjadi PIC operasi. Jika masih dikelola satu orang, pemilik menjalankan kedua peran dengan dua langkah terpisah: dokumentasikan keputusan sebelum mengeksekusi refund, lalu cocokkan bukti provider sesudahnya. Pengganti belum ditetapkan; saat PIC tidak tersedia, tunda pembukaan transaksi live. Kanal awal adalah journal VPS yang diperiksa PIC; kanal ini belum menyediakan notifikasi ke HP dan tidak memenuhi gerbang alert live sampai penerusan notifikasi diuji.

## Aktivasi monitor

### Batas pembelian supplier

Migrasi `20261118090000_fulfillment_spending_limits.sql` menambah batas biaya
supplier Rp250.000/order, Rp500.000/jam, Rp2.000.000/24 jam dan 10 pembelian/jam.
Ini batas awal konservatif untuk biaya supplier. Reservasi biaya dan klaim dispatch
berada dalam transaksi database yang sama dengan lock singleton lintas worker.
Pembelian timeout tetap memakai budget; jangan menghapus reservasi untuk retry.
Batas dihitung rolling. Order melewati batas ditahan dengan review_required;
admin memeriksa sebelum melepas review, dan worker memeriksa limit lagi.
Invoice lunas dapat tertahan; informasikan pelanggan dan ikuti SOP refund.

Pengelola database berwenang dapat mengubah baris `fulfillment_limits` setelah
meninjau saldo/risiko. `paused=true` menghentikan klaim baru secara global.
Jangan beri hak tabel ini ke anon/authenticated atau mengekspos service key.
Saat migrasi hosted, hentikan pembelian baru dan rekonsiliasi order in-flight;
backfill memakai created_at sehingga waktu pembelian historis yang terlambat
tetap perlu dicocokkan manual sebelum melanjutkan pembelian.

`VIPAYMENT_FULFILLMENT_ENABLED=false` kini menghentikan pembelian baru;
polling status dan pendeteksian dispatch macet tetap berjalan. Gunakan
`VIPAYMENT_STATUS_POLLING_ENABLED=false` hanya untuk menghentikan seluruh worker.
Pause tidak membatalkan request yang sudah terkirim atau klaim yang sudah diambil.

Checkout/invoice memakai refresh sesi dan rotasi cookie server yang sama dengan
login. Kegagalan Auth tidak menurunkan transaksi akun menjadi guest.
Pemulihan guest yang kehilangan cookie tetap melalui CS. Email checkout belum
diverifikasi saat pembelian; jangan mengalihkan invoice otomatis berdasarkan
kesamaan email dengan akun. Pemulihan otomatis membutuhkan bukti kepemilikan
tambahan/alur kontak terverifikasi sejak checkout dan belum diaktifkan.

Monitor hanya membaca jumlah baris melalui HEAD/count, tanpa mengambil target pelanggan atau mengubah status. Secret memakai environment API yang sudah ada. Monitor hanya menerima mode live. Hasil JSON hanya berisi nama pemeriksaan, jumlah dan tingkat urgensi.

Di VPS dengan repository pada `/opt/anres-store`, salin kedua file `infra/monitor/anres-operations.*` ke `/etc/systemd/system/`, lalu:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now anres-operations.timer
sudo systemctl start anres-operations.service
sudo journalctl -u anres-operations.service -n 20 --no-pager
sudo systemctl list-timers anres-operations.timer
```

Sesuaikan WorkingDirectory jika path berbeda. Service memakai Docker host dan kredensial tetap berada di container. Exit 0 berarti antrean bersih; 1 berarti perlu ditinjau; 2 berarti pemeriksaan gagal. Timer menjalankan ulang service yang gagal pada siklus berikutnya. Hubungkan status service gagal dan journal ke kanal alert privat milik PIC melalui sistem monitoring VPS; repository ini belum mengirim pesan ke pihak mana pun. Uji penerimaan alert dengan menjalankan monitor terhadap fixture staging yang diketahui bermasalah. Alarm yang hanya tercatat di journal belum dianggap aktif secara operasional.

Ambang awal: creating >5 menit, pending >60 menit, ready >15 menit, processing >60 menit, dispatching tanpa perubahan >3 menit. Unknown dan paid+failed langsung critical; manual_review dan review_required warning. Usia ready/processing dihitung sejak pembuatan order agar update polling tidak menyembunyikan antrean lama; dapat memberi peringatan konservatif pada pembayaran terlambat. Pending lama adalah sinyal pemeriksaan, bukan bukti gagal bayar. Sesuaikan SLA layanan social/tasks secara terdokumentasi.

Pasang pula pemeriksaan HTTPS eksternal kelima domain tiap menit, notifikasi setelah 3 kegagalan; alert sertifikat tersisa <14 hari, disk >80%, RAM >90% selama 5 menit, container unhealthy/restart berulang dan monitor tidak menghasilkan laporan >3 menit. Pantau log `payment.reconciliation_unavailable`, `fulfillment.reconciliation_unavailable`, `fulfillment.order_requires_check`. Health HTTP tidak membuktikan provider/database sehat. Uji alert kehilangan koneksi database di staging dan reboot VPS. Pemantauan eksternal wajib supaya VPS mati tetap terdeteksi.

## Respons insiden dan timeout supplier

PIC acknowledge critical dalam 5 menit dan warning dalam 30 menit pada jam operasi; sebelum live tetapkan penjagaan di luar jam itu. Buat catatan insiden: waktu UTC, mode, invoice/order ID, referensi gateway/supplier, status sebelum/sesudah, bukti provider yang disunting, tindakan dan operator. Jangan mencatat secret, guest token, atau data target penuh.

1. Verifikasi pemilik melalui sesi akun/order atau bukti kepemilikan yang diverifikasi tim support. Jangan membagikan invoice berdasarkan ID saja.
2. Jika pembelian supplier unknown/dispatching macet, tandai review di admin untuk order paid. Flag review tidak membatalkan request yang sudah terkirim. Untuk insiden luas, nonaktifkan `VIPAYMENT_FULFILLMENT_ENABLED` lalu recreate API; pertahankan `VIPAYMENT_STATUS_POLLING_ENABLED=true` agar order yang sudah dikirim tetap dipantau. Jangan ganti mode Tripay sebagai tombol stop.
3. Cocokkan referensi order dan provider, cek status di portal/API status supplier. Worker tidak mengambil unknown untuk pembelian ulang. Timeout dapat terjadi setelah supplier menerima request; jangan reset ke ready atau membuat invoice/pembelian pengganti.
4. Jika processing, tunggu sesuai SLA dan cek status kembali. Jika completed, simpan bukti; jika failed, pastikan tidak ada pengiriman/biaya tertunda sebelum refund. Jika hasil tidak pasti, eskalasi supplier dan pertahankan review.
5. UI pembaruan manual hanya untuk fulfillment_mode=manual. Koreksi order supplier harus ditangani teknis lewat prosedur terkontrol dengan snapshot status, bukti provider, persetujuan PIC dan pencatatan audit; belum tersedia tombol retry/koreksi supplier otomatis. Jangan menulis SQL ad hoc.
6. Informasikan pelanggan status yang sudah terverifikasi dan waktu pembaruan berikutnya. Tutup insiden setelah saldo, invoice dan fulfillment cocok; retry pesan pelanggan terpisah dari pembelian.

## Rekonsiliasi harian

Setiap hari pukul 09:00 Asia/Bangkok, PIC mencocokkan hari kalender sebelumnya (02:00 UTC hari sebelumnya sampai 02:00 UTC hari berjalan) dan seluruh kasus terbuka hari sebelumnya. Gunakan ekspor privat gateway, laporan supplier dan daftar transaksi admin; paginasi seluruh hasil. Monitor jumlah bukan laporan keuangan lengkap.

Cocokkan invoice/reference, nominal, fee, status pembayaran, pembelian supplier, biaya supplier dan refund. Periksa pembayaran paid tanpa fulfillment, unknown/manual_review, duplikat reference, satu invoice dengan lebih dari satu pembelian, serta selisih settlement. Cocokkan saldo awal + pemasukan/topup - pengeluaran/refund/fee = saldo akhir, terpisah gateway dan supplier. Status paid tidak selalu berarti dana sudah settled. Buat daftar selisih dengan PIC dan tenggat; eskalasi selisih uang atau pembelian ganda segera. Simpan laporan privat dengan tanggal, total jumlah/nominal, bukti, operator dan reviewer; reviewer menandatangani meski selisih nol.

## Refund

Refund bukan sekadar mengubah status database. Belum ada endpoint admin untuk transfer refund; lakukan melalui kanal merchant/provider yang sah.

1. Support membuat kasus, verifikasi pemilik, invoice paid, nominal/currency, alasan dan refund terdahulu. Jangan refund otomatis untuk unknown, partial, atau order yang sudah terkirim.
2. PIC memastikan hasil supplier final dan biaya aktual. Untuk partial/manual_review, tentukan nominal berdasarkan bukti dan kebijakan usaha yang disepakati, lalu minta persetujuan pemilik/penanggung jawab refund.
3. Operator menjalankan refund satu kali setelah persetujuan, menggunakan reference kasus unik dan kanal pembayaran asal bila tersedia. Gunakan operator berbeda dari approver bila tim tersedia; untuk usaha satu orang ikuti pencatatan dua langkah di atas. Jika timeout refund, cari transaksi dengan reference itu sebelum mencoba lagi.
4. Simpan ID refund provider, nominal, fee, waktu dan bukti tersunting. Status pembayaran harus mengikuti hasil gateway terverifikasi; jangan paksa paid/refunded melalui SQL. Jika gateway tidak mengirim callback REFUND, eskalasi teknis untuk rekonsiliasi terkontrol; simpan kasus tetap terbuka sampai tampilan dan ledger cocok.
5. Konfirmasi ke pelanggan, masukkan laporan harian, tutup setelah bukti dana dan status konsisten. Refund tidak memicu pembelian supplier baru.

## Bukti wajib sebelum live

Catat release SHA, PIC/pengganti/approver, penerima alert dan hasil drill: transaksi unknown, supplier timeout setelah accept, callback ganda, database unavailable, monitor berhenti, VPS mati dan refund timeout. Masing-masing mencatat waktu deteksi/acknowledge, satu pembelian per invoice, dan penyelesaian. SOP tertulis saja belum memenuhi aktivasi produksi.
