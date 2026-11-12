# Pengujian database

Tambahkan pgTAP bersama migrasi domain: pengguna A tidak dapat membaca order B,
pengguna biasa tidak dapat mengubah role, serta callback duplikat tidak menggandakan
fulfillment. Jalankan `npm run db:test` setelah database lokal aktif.
Belum ada tes SQL karena belum ada tabel aplikasi.
