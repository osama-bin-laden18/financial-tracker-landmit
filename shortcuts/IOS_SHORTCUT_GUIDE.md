# ⚡ Panduan Apple Shortcuts (Input Pengeluaran 3 Detik di iPhone)

Selain menggunakan aplikasi PWA di Home Screen, Anda bisa membuat **Apple Shortcut** bawaan iPhone agar cukup **ketuk belakang iPhone 2x (Back Tap)**, tekan **Action Button**, atau panggil **Siri** (*"Hey Siri, Catat Pengeluaran"*) untuk langsung mengirim pengeluaran ke Google Spreadsheet Anda!

---

## Prasyarat
- Sudah menyelesaikan **Langkah 1** di `README.md` dan memiliki:
  - **Web App URL:** `https://script.google.com/macros/s/XXXX/exec`
  - **Token Rahasia (`API_TOKEN`):** contoh `landmit2026rahasiaku`

---

## Langkah Membuat Shortcut di iPhone

1. Buka aplikasi **Shortcuts (Pintasan)** di iPhone → ketuk tombol **`+`** di pojok kanan atas.
2. Beri nama shortcut: **`Catat Pengeluaran`**.
3. Tambahkan aksi-aksi berikut secara berurutan:

### Aksi 1 — Tanya Nominal
- Cari aksi: **Ask for Input**
- Ubah `Text` menjadi **`Number`**
- Prompt: `Berapa nominalnya (Rp)?`

### Aksi 2 — Pilih Kategori
- Cari aksi: **List** → isi daftar kategori favorit Anda (sesuai persis dengan nama di Spreadsheet):
  - `Pangan`
  - `Kopi`
  - `Grocery`
  - `BBM`
  - `Transportasi`
  - `Nongki`
  - `Bayar Tagihan`
  - `Hadiah/Sedekah`
  - `Lain-lain`
- Tambahkan aksi **Choose from List** (Prompt: `Kategori apa?`).

### Aksi 3 — Pilih Rekening Debit
- Cari aksi: **List** → isi rekening yang sering dipakai di HP ini:
  - `BCA (Olan)`
  - `Cash (Olan)`
  - `Ovo (Olan)`
  - `BRI`
  - `BCA (Mitry)`
  - `Cash (Mitry)`
  - `Ovo (Mitry)`
- Tambahkan aksi **Choose from List** (Prompt: `Bayar pakai apa?`).

### Aksi 4 — Tanya Catatan (Notes)
- Cari aksi: **Ask for Input** (Type: **`Text`**)
- Prompt: `Catatan / beli apa?`

### Aksi 5 — Kirim ke Google Sheets via Apps Script
- Cari aksi: **Get Contents of URL**
- **URL:** tempel Web App URL Anda (`https://script.google.com/macros/s/XXXX/exec`)
- Ketuk tanda panah **`>`** untuk membuka detail:
  - **Method:** `POST`
  - **Request Body:** `JSON`
  - Tambahkan field-field berikut (**Add new field**):
    | Key | Type | Value |
    | :--- | :--- | :--- |
    | `action` | Text | `addExpense` |
    | `token` | Text | *(isi API_TOKEN rahasia Anda)* |
    | `amount` | Number | *(pilih Magic Variable: **Provided Input** dari Aksi 1)* |
    | `category` | Text | *(pilih Magic Variable: **Chosen Item** dari Aksi 2)* |
    | `wallet` | Text | *(pilih Magic Variable: **Chosen Item** dari Aksi 3)* |
    | `notes` | Text | *(pilih Magic Variable: **Provided Input** dari Aksi 4)* |
    | `classification` | Text | `Kebutuhan` |
    | `owner` | Text | `Olan` *(atau `Mitry` di HP Mitry, atau `Bersama`)* |

> **Catatan:** Tanggal tidak perlu diisi jika transaksi hari ini — `Code.gs` otomatis mengisi tanggal hari ini dan sheet bulan berjalan!

### Aksi 6 — Tampilkan Notifikasi Sukses
- Cari aksi: **Get Dictionary Value**
  - Key: `ok`
  - Dictionary: **Contents of URL**
- Cari aksi: **If** (`Dictionary Value` is `true` / `1`):
  - **Show Notification:** `✅ Tercatat di Google Sheets!`
- **Otherwise:**
  - **Show Notification:** `❌ Gagal kirim — cek koneksi/token`

---

## 🎯 Pasang ke Back Tap / Lock Screen / Action Button

- **Back Tap (Ketuk Belakang iPhone 2x):**
  Buka **Settings → Accessibility → Touch → Back Tap → Double Tap** → pilih shortcut **`Catat Pengeluaran`**.
- **Action Button (iPhone 15 Pro / 16 series):**
  Buka **Settings → Action Button → Shortcut** → pilih **`Catat Pengeluaran`**.
- **Lock Screen Widget / Control Center (iOS 18+):**
  Tahan layar Lock Screen → *Customize* → tambahkan widget **Shortcuts** → pilih **`Catat Pengeluaran`**.
- **Siri:**
  Cukup ucapkan: *"Hey Siri, Catat Pengeluaran"*.
