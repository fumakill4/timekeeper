# Spesifikasi Perhitungan Jam Kerja — Web App Bot Absensi

**Dokumen untuk:** Antigravity dan Codex  
**Fokus tahap ini:** Logika perhitungan jam kerja, keterlambatan, lembur, libur, dan periode rekap absensi.  
**Status:** Spesifikasi implementasi awal  
**Zona waktu:** `Asia/Makassar` (`UTC+08:00`)

---

## 1. Tujuan

Sistem harus dapat:

1. Menentukan shift kerja karyawan.
2. Menghitung jam masuk, jam keluar, dan total durasi kerja.
3. Menentukan status tepat waktu atau terlambat.
4. Menghitung jumlah dan riwayat keterlambatan.
5. Menentukan apakah karyawan berhak memperoleh lembur.
6. Menghitung jam dan nominal uang lembur.
7. Mencatat status libur melalui perintah WhatsApp Bot.
8. Memasukkan seluruh hasil ke periode rekap absensi yang sesuai.

---

## 2. Aturan Dasar

### 2.1 Jam kerja normal

Jam kerja normal ditetapkan **10 jam per shift**.

### 2.2 Daftar shift

| Kode | Jam Masuk | Jam Keluar Terjadwal | Keterangan |
|---|---:|---:|---|
| `SHIFT_1` | 07.00 | 17.00 | Shift siang, 10 jam |
| `SHIFT_2` | 13.00 | 23.00 | Shift sore, 10 jam |
| `SHIFT_3` | 23.00 | 07.00 hari berikutnya | Shift malam, melewati tengah malam |

> **Catatan implementasi penting:** Jadwal `SHIFT_3` dari pukul 23.00 sampai 07.00 memiliki durasi kalender 8 jam, sedangkan aturan umum menyebut jam kerja normal 10 jam. Untuk tahap awal, sistem harus mengikuti **jam mulai dan jam selesai shift yang tersimpan di database**, sehingga `SHIFT_3` dihitung 8 jam. Nilai ini wajib dibuat configurable agar dapat diubah menjadi 10 jam tanpa mengubah kode inti.

---

## 3. Konfigurasi Utama

Gunakan konfigurasi terpusat, bukan angka yang ditulis berulang di dalam fungsi.

```ts
const ATTENDANCE_CONFIG = {
  timezone: "Asia/Makassar",
  lateToleranceMinutes: 10,
  minimumExtraMinutesForOvertime: 60,
  overtimeRatePerHour: 10_000,
  overtimeRounding: "FULL_HOUR_FLOOR",
  normalWorkHours: 10,
};
```

Daftar shift disimpan di database:

```ts
const SHIFTS = [
  {
    code: "SHIFT_1",
    startTime: "07:00",
    endTime: "17:00",
    crossesMidnight: false,
    scheduledMinutes: 600,
  },
  {
    code: "SHIFT_2",
    startTime: "13:00",
    endTime: "23:00",
    crossesMidnight: false,
    scheduledMinutes: 600,
  },
  {
    code: "SHIFT_3",
    startTime: "23:00",
    endTime: "07:00",
    crossesMidnight: true,
    scheduledMinutes: 480,
  },
];
```

---

## 4. Penyimpanan Waktu

### 4.1 Ketentuan

- Semua waktu diproses menggunakan zona waktu `Asia/Makassar`.
- Simpan timestamp lengkap, bukan hanya teks jam.
- Disarankan menyimpan waktu di database dalam UTC dan mengonversinya ke `Asia/Makassar` untuk perhitungan dan tampilan.
- Setiap record harus memiliki `work_date`, yaitu tanggal operasional saat shift dimulai.

### 4.2 Shift lintas tengah malam

Untuk `SHIFT_3`, waktu keluar terjadwal berada pada hari berikutnya.

Contoh:

```text
work_date              : 2026-07-13
scheduled_check_in_at  : 2026-07-13 23:00 +08:00
scheduled_check_out_at : 2026-07-14 07:00 +08:00
```

Jangan menghitung waktu keluar pukul 07.00 sebagai lebih awal daripada waktu masuk pukul 23.00.

---

## 5. Proses Absen Masuk

Saat karyawan mengirim perintah absen masuk, sistem harus:

1. Mengenali karyawan berdasarkan nomor WhatsApp yang telah terdaftar.
2. Mengambil shift yang ditugaskan untuk `work_date` tersebut.
3. Membentuk `scheduled_check_in_at` dan `scheduled_check_out_at`.
4. Menyimpan timestamp aktual sebagai `actual_check_in_at`.
5. Menghitung keterlambatan.
6. Menolak absen masuk kedua pada shift yang sama, kecuali admin melakukan koreksi.

### 5.1 Rumus keterlambatan

```text
late_threshold = scheduled_check_in_at + 10 menit
```

```text
Jika actual_check_in_at <= late_threshold:
    status = ON_TIME
    late_minutes = 0

Jika actual_check_in_at > late_threshold:
    status = LATE
    late_minutes = selisih menit antara actual_check_in_at dan scheduled_check_in_at
```

> `late_minutes` dihitung dari jam masuk terjadwal, bukan hanya dari waktu setelah toleransi.

### 5.2 Contoh Shift 1

| Jam Absen Masuk | Status | Menit Terlambat |
|---:|---|---:|
| 06.55 | Tepat waktu | 0 |
| 07.00 | Tepat waktu | 0 |
| 07.10 | Tepat waktu | 0 |
| 07.11 | Terlambat | 11 |
| 07.30 | Terlambat | 30 |

### 5.3 Riwayat keterlambatan

Setiap kejadian terlambat harus tersimpan secara permanen dengan data:

- ID karyawan
- Nama karyawan saat kejadian
- Hari dan tanggal
- Shift
- Lokasi toko
- Jam masuk terjadwal
- Jam masuk aktual
- Jumlah menit keterlambatan
- ID periode absensi

Jumlah keterlambatan dihitung berdasarkan **jumlah kejadian**, bukan akumulasi menit.

---

## 6. Proses Absen Keluar

Saat karyawan mengirim perintah absen keluar, sistem harus:

1. Mencari record absensi aktif yang belum memiliki jam keluar.
2. Menyimpan timestamp aktual sebagai `actual_check_out_at`.
3. Menghitung total durasi kerja aktual.
4. Menghitung waktu tambahan setelah jam keluar terjadwal.
5. Menentukan status lembur.
6. Menghitung jam lembur yang dibayar.
7. Menghitung nominal uang lembur.
8. Menentukan tipe lembur.

### 6.1 Total durasi kerja

```text
total_worked_minutes = actual_check_out_at - actual_check_in_at
```

Untuk tampilan:

```text
total_worked_hours = total_worked_minutes / 60
```

Simpan nilai utama dalam menit untuk menghindari kesalahan pembulatan angka desimal.

---

## 7. Perhitungan Lembur

### 7.1 Syarat lembur

Lembur dihitung berdasarkan waktu keluar aktual yang melewati waktu keluar terjadwal.

```text
extra_minutes = actual_check_out_at - scheduled_check_out_at
```

Aturannya:

```text
Jika extra_minutes <= 60:
    overtime_eligible = false
    paid_overtime_hours = 0

Jika extra_minutes > 60:
    overtime_eligible = true
    paid_overtime_hours = floor(extra_minutes / 60)
```

Dengan aturan ini:

| Tambahan Waktu | Jam Lembur Dibayar |
|---:|---:|
| 30 menit | 0 jam |
| 60 menit | 0 jam |
| 61 menit | 1 jam |
| 1 jam 59 menit | 1 jam |
| 2 jam | 2 jam |
| 2 jam 45 menit | 2 jam |

> Frasa “jika melebihi 1 jam, baru dihitung lembur” diterapkan secara ketat: tepat 60 menit belum memperoleh lembur; mulai 61 menit memperoleh lembur berdasarkan jam penuh.

### 7.2 Nominal lembur

```text
overtime_amount = paid_overtime_hours × Rp10.000
```

Contoh:

| Jam Lembur Dibayar | Nominal |
|---:|---:|
| 1 jam | Rp10.000 |
| 2 jam | Rp20.000 |
| 6 jam | Rp60.000 |
| 14 jam | Rp140.000 |

### 7.3 Pembayaran lembur

Uang lembur dibayarkan tunai di toko tempat karyawan lembur. Sistem tetap mencatat:

- Nominal hak lembur
- Lokasi toko pembayaran
- Status pembayaran
- Waktu pembayaran
- Admin yang mengonfirmasi

Status pembayaran:

```text
UNPAID
PAID_CASH
CANCELLED
```

Perhitungan payroll tidak boleh membayar ulang lembur yang telah berstatus `PAID_CASH`.

---

## 8. Tipe Lembur

Tipe lembur ditentukan dari total durasi kerja aktual dalam satu sesi absensi.

| Tipe | Total Durasi Kerja | Acuan Jam Lembur dari 10 Jam Normal |
|---|---:|---:|
| `OVERTIME_12H` | Minimal 12 jam dan kurang dari 16 jam | Mulai 2 jam tambahan |
| `OVERTIME_16H` | Minimal 16 jam dan kurang dari 24 jam | Mulai 6 jam tambahan |
| `OVERTIME_24H` | Minimal 24 jam | Mulai 14 jam tambahan |
| `REGULAR_OVERTIME` | Memenuhi syarat lembur tetapi belum 12 jam total | Berdasarkan jam penuh |
| `NO_OVERTIME` | Tidak memenuhi syarat | 0 jam |

Pseudocode:

```ts
function determineOvertimeType(totalWorkedMinutes: number, paidOvertimeHours: number) {
  if (paidOvertimeHours <= 0) return "NO_OVERTIME";
  if (totalWorkedMinutes >= 24 * 60) return "OVERTIME_24H";
  if (totalWorkedMinutes >= 16 * 60) return "OVERTIME_16H";
  if (totalWorkedMinutes >= 12 * 60) return "OVERTIME_12H";
  return "REGULAR_OVERTIME";
}
```

> Tipe lembur merupakan kategori laporan. Nominal tetap dihitung dari `paid_overtime_hours × Rp10.000`, bukan dari nama tipenya.

---

## 9. Status Libur

### 9.1 Perintah WhatsApp

Ketika admin mengirim:

```text
libur
Libur
LIBUR
```

bot harus menganggap seluruh variasi tersebut sebagai perintah yang sama dengan melakukan normalisasi:

```ts
normalizedCommand = message.trim().toLowerCase();
```

### 9.2 Hasil pencatatan

Sistem membuat record dengan:

```text
attendance_status = DAY_OFF
work_date          = tanggal operasional yang ditentukan
check_in_at        = null
check_out_at       = null
worked_minutes     = 0
late_minutes       = 0
overtime_hours     = 0
overtime_amount    = 0
```

Status libur tidak boleh dihitung sebagai:

- Hadir
- Terlambat
- Tidak hadir tanpa keterangan
- Lembur

### 9.3 Otorisasi

Perintah `libur` hanya boleh diproses dari nomor WhatsApp yang memiliki role admin atau supervisor. Karyawan biasa tidak boleh menetapkan status liburnya sendiri.

---

## 10. Periode Rekap Absensi

Sistem memiliki dua periode rekap:

| Kode | Rentang |
|---|---|
| `PERIOD_11_25` | Tanggal 11 sampai 25 pada bulan yang sama |
| `PERIOD_26_10` | Tanggal 26 sampai tanggal 10 bulan berikutnya |

### 10.1 Contoh

```text
PERIOD_11_25
11 Juli 2026 00:00:00 sampai 25 Juli 2026 23:59:59

PERIOD_26_10
26 Juli 2026 00:00:00 sampai 10 Agustus 2026 23:59:59
```

### 10.2 Penentuan periode dari work_date

```ts
function resolveAttendancePeriod(workDate: LocalDate) {
  const day = workDate.day;

  if (day >= 11 && day <= 25) {
    return {
      type: "PERIOD_11_25",
      startDate: date(workDate.year, workDate.month, 11),
      endDate: date(workDate.year, workDate.month, 25),
    };
  }

  if (day >= 26) {
    return {
      type: "PERIOD_26_10",
      startDate: date(workDate.year, workDate.month, 26),
      endDate: dateOfNextMonth(workDate.year, workDate.month, 10),
    };
  }

  return {
    type: "PERIOD_26_10",
    startDate: dateOfPreviousMonth(workDate.year, workDate.month, 26),
    endDate: date(workDate.year, workDate.month, 10),
  };
}
```

Untuk shift malam, periode ditentukan berdasarkan `work_date` atau tanggal masuk shift, bukan tanggal keluar.

Contoh:

```text
Masuk 25 Juli pukul 23.00
Keluar 26 Juli pukul 07.00
Masuk ke periode 11–25 Juli
```

---

## 11. Model Data Minimum

### 11.1 `shifts`

```ts
interface Shift {
  id: string;
  code: "SHIFT_1" | "SHIFT_2" | "SHIFT_3";
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  scheduled_minutes: number;
  is_active: boolean;
}
```

### 11.2 `attendance_records`

```ts
interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name_snapshot: string;
  store_id: string;
  shift_id: string;
  work_date: string;

  scheduled_check_in_at: string;
  scheduled_check_out_at: string;
  actual_check_in_at: string | null;
  actual_check_out_at: string | null;

  attendance_status:
    | "PRESENT"
    | "DAY_OFF"
    | "ABSENT"
    | "INCOMPLETE";

  punctuality_status: "ON_TIME" | "LATE" | "NOT_APPLICABLE";
  late_minutes: number;

  scheduled_minutes: number;
  worked_minutes: number;
  extra_minutes: number;

  overtime_eligible: boolean;
  paid_overtime_hours: number;
  overtime_rate: number;
  overtime_amount: number;
  overtime_type:
    | "NO_OVERTIME"
    | "REGULAR_OVERTIME"
    | "OVERTIME_12H"
    | "OVERTIME_16H"
    | "OVERTIME_24H";

  overtime_payment_status: "UNPAID" | "PAID_CASH" | "CANCELLED";
  overtime_paid_at: string | null;
  overtime_paid_store_id: string | null;
  overtime_confirmed_by: string | null;

  attendance_period_id: string;
  created_at: string;
  updated_at: string;
}
```

### 11.3 `attendance_periods`

```ts
interface AttendancePeriod {
  id: string;
  type: "PERIOD_11_25" | "PERIOD_26_10";
  start_date: string;
  end_date: string;
  status: "OPEN" | "LOCKED";
  locked_at: string | null;
  locked_by: string | null;
}
```

---

## 12. Fungsi Inti yang Harus Dibuat

```ts
buildScheduledDateTimes(workDate, shift, timezone)
calculateLateStatus(actualCheckIn, scheduledCheckIn, toleranceMinutes)
calculateWorkedMinutes(actualCheckIn, actualCheckOut)
calculateExtraMinutes(actualCheckOut, scheduledCheckOut)
calculatePaidOvertimeHours(extraMinutes, minimumExtraMinutes)
calculateOvertimeAmount(paidOvertimeHours, ratePerHour)
determineOvertimeType(totalWorkedMinutes, paidOvertimeHours)
resolveAttendancePeriod(workDate)
normalizeBotCommand(message)
```

### 12.1 Contoh fungsi perhitungan lembur

```ts
function calculatePaidOvertimeHours(
  extraMinutes: number,
  minimumExtraMinutes = 60,
): number {
  if (extraMinutes <= minimumExtraMinutes) return 0;
  return Math.floor(extraMinutes / 60);
}
```

### 12.2 Contoh fungsi keterlambatan

```ts
function calculateLateStatus(
  actualCheckIn: DateTime,
  scheduledCheckIn: DateTime,
  toleranceMinutes = 10,
) {
  const threshold = scheduledCheckIn.plus({ minutes: toleranceMinutes });

  if (actualCheckIn <= threshold) {
    return {
      punctualityStatus: "ON_TIME",
      lateMinutes: 0,
    };
  }

  return {
    punctualityStatus: "LATE",
    lateMinutes: Math.floor(
      actualCheckIn.diff(scheduledCheckIn, "minutes").minutes,
    ),
  };
}
```

---

## 13. Validasi dan Kondisi Khusus

### 13.1 Absen keluar tanpa absen masuk

- Tolak proses otomatis.
- Beri pesan bahwa data absen masuk tidak ditemukan.
- Sediakan koreksi manual oleh admin.

### 13.2 Absen masuk dua kali

- Jangan membuat record baru.
- Kembalikan data absen aktif yang sudah ada.
- Catat percobaan duplikat dalam audit log bila diperlukan.

### 13.3 Jam keluar lebih awal

Jika `actual_check_out_at < scheduled_check_out_at`:

```text
extra_minutes = 0
overtime_eligible = false
paid_overtime_hours = 0
```

Sistem tetap menyimpan `worked_minutes` aktual.

### 13.4 Jam keluar sangat lama

Durasi 16 atau 24 jam harus diterima sebagai lembur valid, tetapi perubahan manual dan durasi ekstrem wajib memiliki audit trail.

Rekomendasi:

```text
Jika total kerja > 24 jam:
- tandai NEEDS_REVIEW
- jangan menghapus data
- minta admin memverifikasi
```

### 13.5 Perubahan data oleh admin

Setiap perubahan manual harus menyimpan:

- Nilai sebelum perubahan
- Nilai setelah perubahan
- Alasan perubahan
- ID admin
- Timestamp perubahan

### 13.6 Periode terkunci

Saat periode berstatus `LOCKED`:

- Record tidak dapat diubah langsung.
- Koreksi hanya melalui proses khusus dengan audit log.
- Rekap historis tidak boleh berubah diam-diam.

---

## 14. Skenario Uji Wajib

### 14.1 Keterlambatan

| Kasus | Shift | Masuk Aktual | Hasil |
|---|---|---:|---|
| Tepat waktu | 07.00 | 07.00 | `ON_TIME`, 0 menit |
| Batas toleransi | 07.00 | 07.10 | `ON_TIME`, 0 menit |
| Lewat toleransi | 07.00 | 07.11 | `LATE`, 11 menit |
| Shift sore terlambat | 13.00 | 13.25 | `LATE`, 25 menit |
| Shift malam terlambat | 23.00 | 23.15 | `LATE`, 15 menit |

### 14.2 Lembur Shift 1

| Masuk | Keluar Terjadwal | Keluar Aktual | Hasil |
|---:|---:|---:|---|
| 07.00 | 17.00 | 17.45 | 0 jam, Rp0 |
| 07.00 | 17.00 | 18.00 | 0 jam, Rp0 |
| 07.00 | 17.00 | 18.01 | 1 jam, Rp10.000 |
| 07.00 | 17.00 | 19.00 | 2 jam, Rp20.000, `OVERTIME_12H` |
| 07.00 | 17.00 | 23.00 | 6 jam, Rp60.000, `OVERTIME_16H` |
| 07.00 | 17.00 | 07.00 hari berikutnya | 14 jam, Rp140.000, `OVERTIME_24H` |

### 14.3 Shift malam

```text
Shift             : 23.00–07.00
Tanggal kerja     : 13 Juli 2026
Masuk aktual      : 13 Juli 2026 23.00
Keluar aktual     : 14 Juli 2026 07.00
Total kerja       : 480 menit
Status lembur     : Tidak lembur
Periode           : Berdasarkan 13 Juli 2026
```

### 14.4 Libur

```text
Pesan admin       : "Libur"
Hasil              : DAY_OFF
Jam kerja          : 0
Keterlambatan      : 0
Lembur             : 0
```

### 14.5 Periode lintas bulan

| Work Date | Periode |
|---|---|
| 10 Agustus 2026 | 26 Juli–10 Agustus 2026 |
| 11 Agustus 2026 | 11–25 Agustus 2026 |
| 25 Agustus 2026 | 11–25 Agustus 2026 |
| 26 Agustus 2026 | 26 Agustus–10 September 2026 |

---

## 15. Data yang Ditampilkan di Dashboard

Untuk setiap karyawan dan periode:

- Total hari hadir
- Total hari libur
- Total menit kerja
- Total jam kerja dalam format mudah dibaca
- Jumlah keterlambatan
- Total menit keterlambatan
- Daftar hari dan tanggal keterlambatan
- Total sesi lembur
- Total jam lembur dibayar
- Total nominal lembur
- Rincian lembur 12 jam, 16 jam, dan 24 jam
- Status pembayaran tunai lembur

Contoh ringkasan:

```text
Nama                 : Budi Santoso
Periode              : 11–25 Juli 2026
Hadir                : 13 hari
Libur                : 2 hari
Total kerja          : 130 jam
Terlambat            : 2 kali / 33 menit
Jam lembur dibayar   : 8 jam
Hak uang lembur      : Rp80.000
Sudah dibayar tunai  : Rp60.000
Belum dibayar        : Rp20.000
```

---

## 16. Acceptance Criteria

Implementasi dianggap selesai untuk tahap perhitungan jam kerja apabila:

1. Ketiga shift dapat dihitung dengan benar.
2. Shift yang melewati tengah malam tidak menghasilkan durasi negatif.
3. Toleransi masuk 10 menit diterapkan secara konsisten.
4. Jam masuk pada menit ke-11 ditandai terlambat.
5. Riwayat hari dan tanggal keterlambatan tersimpan.
6. Tambahan waktu sampai tepat 60 menit tidak dihitung lembur.
7. Tambahan waktu mulai 61 menit menghasilkan minimal 1 jam lembur.
8. Nominal lembur dihitung Rp10.000 per jam penuh.
9. Tipe lembur 12, 16, dan 24 jam terklasifikasi.
10. Status pembayaran tunai lembur tersimpan dan tidak dibayar ulang melalui payroll.
11. Perintah `libur` tidak sensitif terhadap huruf besar/kecil.
12. Periode 11–25 dan 26–10 ditentukan berdasarkan `work_date`.
13. Semua perubahan manual memiliki audit trail.
14. Seluruh skenario uji pada dokumen ini lulus.

---

## 17. Keputusan Implementasi Tahap Ini

Untuk mencegah perbedaan hasil antara Antigravity, Codex, frontend, backend, dan bot WhatsApp, gunakan keputusan berikut:

- Satuan perhitungan utama: **menit**.
- Zona waktu operasional: **Asia/Makassar**.
- Batas tepat waktu: sampai dengan menit ke-10.
- Terlambat: mulai menit ke-11.
- Hak lembur: waktu tambahan harus lebih dari 60 menit.
- Pembulatan lembur: ke bawah berdasarkan jam penuh.
- Tarif lembur: Rp10.000 per jam.
- Tipe 12/16/24 jam: berdasarkan total durasi kerja aktual.
- Tanggal shift malam: mengikuti tanggal saat shift dimulai.
- Durasi `SHIFT_3` sementara: 8 jam sesuai jadwal 23.00–07.00 dan dibuat configurable.
- Status libur hanya dapat ditetapkan oleh admin/supervisor.
- Lembur tunai harus mempunyai status pembayaran agar tidak terjadi pembayaran ganda.

