# API awal

`GET http://localhost:4000/v1/health`

Respons 200: `{ "status": "ok", "service": "anres-api", "timestamp": "<ISO UTC>" }`.
Endpoint liveness publik tanpa data bisnis. Prefix API: `/v1`.
Belum ada endpoint transaksi atau admin. Tambahkan validasi payload, autentikasi,
otorisasi, batas request, dan kontrak kegagalan sebelum mengekspos endpoint tersebut.
