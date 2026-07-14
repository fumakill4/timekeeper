# TimeKeeper WhatsApp Bot

Service ini menerima laporan absensi dari WhatsApp, membalas konfirmasi, dan menyimpan hasil normalisasi ke Firestore koleksi `timekeeperAttendance`.

## Format pesan yang didukung

Format utama untuk mencatat jam masuk (4 baris):

```text
Cuci Dewe
Rizky
27 Juli
Masuk 07.00
```

Jam pulang boleh ditambahkan pada baris keempat bila sudah tersedia, misalnya `Masuk 07.00 / Pulang 19.00`. Jika belum ada jam pulang, TimeKeeper hanya menyimpan jam masuk dan belum menampilkan perhitungan lembur.

Untuk membatalkan input terakhir dari pengirim yang sama, kirim salah satu command berikut:

```text
batal
hapus
delete
```

Command tidak membedakan huruf besar-kecil. Pembatalan hanya mengubah absensi terakhir milik nomor WhatsApp admin yang mengirim command tersebut; master outlet dan karyawan tidak ikut dihapus.

## Laporan karyawan dan Excel

Kirim nama karyawan saja untuk melihat data pada periode berjalan. Periode mengikuti aturan kerja:

- tanggal 11–25: dari tanggal 11 sampai hari ini;
- tanggal 26–akhir bulan: dari tanggal 26 sampai hari ini;
- tanggal 1–10: dari tanggal 26 bulan sebelumnya sampai hari ini.

Contoh, bila hari ini 1 September, kirim:

```text
Rizky
```

Bot akan membalas daftar tanggal 26 Agustus–1 September. Hari tanpa record ditampilkan sebagai `Tidak Masuk/Libur`; sistem belum membedakan keduanya sampai ada input status libur khusus. Keterlambatan 1–2 kali memakai `⚠️`, sedangkan lebih dari 2 kali memakai `⚠️‼️`.

Untuk membuat Excel dari data Firestore, kirim salah satu:

```text
rekapan 26-10
rekapan 11-25
```

Bot akan membuat file dari template TimeKeeper, mengisi sheet `Input Absensi`, mempertahankan formula/template outlet, lalu membalas signed link yang berlaku sementara. Bucket Cloud Storage pada `TIMEKEEPER_WA_SESSION_BUCKET` dipakai untuk menyimpan file export.

```text
nama outlet -> Cuci Dewe
nama karyawan -> Rizky
tanggal dan jam kerja -> 27 Juli 7 pagi / 7 malam
```

Hasilnya disimpan sebagai tanggal `2026-07-27`, jam masuk `07.00`, dan jam pulang `19.00`. `1 siang` menjadi `13.00`. Outlet Selatan sudah mencakup `KLIN WASH` dan `LONDRI DEWE`.

## Jalankan lokal

1. Salin `.env.example` menjadi `.env`.
2. Pastikan Firebase Admin SDK memakai Application Default Credentials. Jangan menaruh service-account JSON atau folder `sessions` ke Git.
3. Isi `TIMEKEEPER_ALLOWED_SENDERS` dengan nomor yang memang diberi izin. Hanya nomor yang tercantum pada variabel ini yang boleh mengirim pesan; bila variabel kosong, semua pengirim akan ditolak sebagai pengaman.
4. Isi `TIMEKEEPER_WA_SESSION_BUCKET` dengan bucket Cloud Storage khusus TimeKeeper. Bucket ini harus berbeda dari project JCL Kiki.
5. Jalankan:

```bash
npm install
npm test
npm start
```

Buka card WhatsApp Bot di Settings TimeKeeper setelah QR tersedia. QR akan diperbarui otomatis oleh Baileys; web hanya melakukan polling status setiap 3 detik.

## Hubungkan webapp

Di `.env.local` project web, isi:

```env
VITE_TIMEKEEPER_WA_API_URL=https://URL-CLOUD-RUN-TIMEKEEPER
```

Lalu build dan deploy hosting web. Jangan menaruh credential Firebase Admin atau credential WhatsApp di `.env.local` web.

## Deploy Cloud Run

Gunakan satu service dan satu instance untuk satu session WhatsApp. Jangan menjalankan bot lokal bersamaan dengan service Cloud Run yang memakai session sama.

```bash
gcloud run deploy your-wa-service \
  --source . \
  --project YOUR_FIREBASE_PROJECT_ID \
  --region asia-southeast2 \
  --min 1 \
  --max 1 \
  --no-cpu-throttling \
  --set-env-vars 'FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID,TIMEKEEPER_WA_SESSION_BUCKET=YOUR_SESSION_BUCKET,TIMEKEEPER_ALLOWED_SENDERS=AUTHORIZED_NUMBER_1,AUTHORIZED_NUMBER_2,TIMEKEEPER_ALLOWED_ORIGIN=https://YOUR_HOSTING_DOMAIN.web.app,https://YOUR_HOSTING_DOMAIN.firebaseapp.com'
```

Service account Cloud Run perlu akses Firestore dan Storage. Sesi hanya dibackup ke bucket yang dikonfigurasi; bila bucket kosong atau belum diberi permission, bot tetap bisa berjalan lokal tetapi QR dapat diminta ulang saat instance dibuat ulang.

## Catatan reliability

- Baileys dipatok ke `7.0.0-rc13`, mengikuti perbaikan JCL Kiki untuk format chat WhatsApp modern `@lid`.
- Resolver balasan memprioritaskan nomor HP `@s.whatsapp.net`; `@lid` hanya fallback.
- Untuk chat `@lid`, balasan tidak memakai quoted message agar tidak silent fail.
- `max=1` mencegah dua instance berebut satu session WhatsApp.
- Status `Connected` baru ditampilkan jika backend benar-benar mengirim status `open`; frontend tidak memalsukan status connected.
- Validasi akhir tetap harus dilakukan sampai balasan terlihat di HP, bukan hanya dari log server.
