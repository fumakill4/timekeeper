# Firebase setup TimeKeeper

Integrasi yang sudah disiapkan di webapp:

- Google Authentication dengan Firebase Auth.
- Session login dipulihkan otomatis oleh Firebase Auth.
- Profil login ditulis ke `users/{uid}` di Cloud Firestore.
- Firebase Hosting untuk hasil build Vite di folder `dist`.
- SPA rewrite agar route web tidak 404 saat direfresh.
- Firestore Rules awal: user hanya boleh membaca/menulis dokumen profil miliknya sendiri.

## 1. Buat Firebase Web App

1. Buka project `TimeKeeper` di Firebase Console.
2. Klik ikon `</>` / **Add app** lalu pilih **Web**.
3. Beri nickname, misalnya `timekeeper-web`.
4. Copy nilai konfigurasi Web App yang diberikan Firebase.
5. Di root project, jalankan:

```bash
cp .env.example .env.local
```

Isi `.env.local`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Jangan commit `.env.local`. File tersebut sudah masuk `.gitignore`.

## 2. Aktifkan login Gmail

Di Firebase Console:

1. **Authentication** → **Sign-in method**.
2. Pilih **Google**.
3. Aktifkan provider Google.
4. Isi **Project support email**.
5. Simpan.

Tambahkan domain yang dipakai ke **Authentication** → **Settings** → **Authorized domains**:

- `localhost` untuk development.
- `PROJECT_ID.web.app` setelah Hosting aktif.
- `PROJECT_ID.firebaseapp.com` setelah Hosting aktif.
- domain custom setelah DNS custom domain selesai.

## 3. Aktifkan Firestore

1. Buka **Firestore Database** → **Create database**.
2. Pilih lokasi database dengan hati-hati karena lokasi tidak mudah dipindahkan.
3. Jalankan rules project setelah konfigurasi CLI selesai:

```bash
firebase deploy --only firestore:rules
```

Rules awal tidak membuka data publik. Koleksi absensi belum dibuka sampai aturan role admin/supervisor selesai dibuat.

## 4. Jalankan lokal

```bash
npm install
npm run dev
```

Buka URL Vite yang muncul, lalu klik **Masuk dengan Google**. Jika domain belum diizinkan, Firebase akan menampilkan error `auth/unauthorized-domain`; tambahkan hostname yang sedang dipakai ke Authorized domains.

## 5. Hubungkan Firebase Hosting

Install CLI satu kali:

```bash
npm install -g firebase-tools
firebase login
firebase projects:list
```

Dari folder project ini, hubungkan ke project Firebase:

```bash
firebase use --add
```

Pilih project `TimeKeeper` dari daftar. Perintah ini membuat `.firebaserc` lokal; jangan menulis project ID secara tebakan.

Deploy Hosting dan rules:

```bash
npm run build
firebase deploy --only hosting,firestore:rules
```

`firebase.json` sudah diarahkan ke folder `dist`, memakai SPA rewrite, dan menjalankan build sebelum deploy Hosting.

## 6. Sambungkan domain custom

1. Firebase Console → **Hosting** → **Add custom domain**.
2. Masukkan domain atau subdomain, misalnya `app.contoh.com`.
3. Ikuti record DNS yang diberikan Firebase (CNAME/A record).
4. Tunggu verifikasi dan provisioning SSL.
5. Tambahkan domain yang sama di **Authentication → Settings → Authorized domains**.
6. Uji login Gmail di domain custom.

## 7. Urutan pengerjaan berikutnya

Setelah Google login berhasil, baru buka akses data aplikasi secara bertahap:

1. Buat role admin/supervisor pada dokumen `users/{uid}`.
2. Tambahkan rules role-based untuk `employees`, `shifts`, `attendance_records`, dan `attendance_periods`.
3. Pindahkan data mock dashboard ke Firestore secara bertahap.
4. Uji login, logout, refresh session, dan akses tanpa izin sebelum deploy produksi.

Service account JSON, private key, dan credential server tidak boleh dimasukkan ke folder frontend atau `.env.local`.
