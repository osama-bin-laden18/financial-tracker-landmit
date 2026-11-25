# 📱 Land & Mit — Budgeting Tracker (iOS PWA + Google Sheets)

Aplikasi mobile bergaya iOS yang terhubung otomatis **2 arah (real-time)** ke Google Spreadsheet **Budgeting Tracker** tanpa mengubah rumus, validasi data, maupun layout sheet yang sudah ada.

## ✨ Fitur Utama
- **Dashboard & Rekon Malam:** Sisa Uang, Pemasukan vs Pengeluaran, saldo 7 rekening (`Cash`, `Ovo`, `BRI`, `BCA` Olan & Mitry), dan indikator **Selisih Rekon** sebelum tidur.
- **Input Cepat (3 Mode):**
  - **Pengeluaran** (17 kategori, Kebutuhan/Keinginan, Olan/Mitry/Bersama, 7 rekening, Notes).
  - **Pemasukan** (Gaji, Uang jajan, Uang Kaget, dll.).
  - **Transfer / Distribusi Duit** (cukup isi 1 form → otomatis menulis 2 baris `-Nominal` dan `+Nominal` di tabel Pemasukan, plus opsi catat otomatis biaya admin TF!).
- **Riwayat & Tagihan Mandatory:** Filter & cari transaksi terbaru, hapus baris secara aman (tanpa merusak rumus sebelahnya), serta **checklist Tagihan Wajib** (`B56:B66`) langsung dari HP.
- **Tab Tabungan (`NEW TABUNGAN`):** Pantau komposisi Emas/Uang/Saham, saldo 5 rekening tabungan (`Mandiri`, `BSI`, `Emas`, `Reksadana`), dan catat masuk/keluar tabungan.
- **Multi-iPhone (Olan & Mitry):** Bisa dipasang di 2 iPhone sekaligus dengan profil default masing-masing, dilindungi `LockService` agar input bersamaan tidak bentrok baris.
- **Integrasi Apple Shortcuts:** Lihat [shortcuts/IOS_SHORTCUT_GUIDE.md](./shortcuts/IOS_SHORTCUT_GUIDE.md).

---

## 🚀 Panduan Instalasi (Sekitar 5–10 Menit)

### Langkah 1 — Pasang Backend di Google Spreadsheet (Apps Script)
1. Buka Google Spreadsheet **Budgeting Tracker** Anda di browser laptop/PC.
2. Klik menu **Extensions → Apps Script**.
3. Hapus kode bawaan di file `Code.gs`, lalu salin-tempel seluruh isi file [`apps-script/Code.gs`](./apps-script/Code.gs).
4. Pada baris awal `CONFIG`, ubah `API_TOKEN` menjadi kode rahasia milik Anda berdua (contoh: `'landmit2026rahasiaku'`):
   ```js
   const CONFIG = {
     API_TOKEN: 'landmit2026rahasiaku',
     ...
   };
   ```
5. Klik tombol **Save** (ikon disket / `Ctrl+S`).
6. Klik tombol biru **Deploy → New deployment**:
   - Klik ikon gear di sebelah *Select type* → pilih **Web app**.
   - **Description:** `Budget Tracker API v1`
   - **Execute as:** `Me` *(akun pemilik spreadsheet)*
   - **Who has access:** `Anyone` *(tenang, tetap aman karena setiap request wajib menyertakan `API_TOKEN` rahasia Anda!)*
   - Klik **Deploy** → klik **Authorize access** → pilih akun Google Anda → jika muncul layar *"Google hasn't verified this app"*, klik **Advanced → Go to ... (unsafe) → Allow**.
7. **Salin Web App URL** yang berakhiran `/exec` (contoh: `https://script.google.com/macros/s/AKfycb.../exec`).

> **🔒 PENTING — Keamanan:**
> Setelah Apps Script berhasil di-deploy, **kembalikan pengaturan Share Google Spreadsheet Anda menjadi *Restricted / Private*** (hanya akun Anda & pasangan). Aplikasi iOS tetap bisa membaca & menulis lewat Apps Script dengan aman!

---

### Langkah 2 — Hosting Gratis Folder `web/` (PWA)
Pilih salah satu hosting statis gratis berikut (semuanya gratis & mendukung HTTPS wajib iOS PWA):

#### Cara Termudah (Tanpa Git — Drag & Drop): **Cloudflare Pages** atau **Netlify Drop**
1. Buka [https://app.netlify.com/drop](https://app.netlify.com/drop) (atau Cloudflare Pages → *Direct Upload*).
2. Tarik (drag & drop) folder **`web/`** ke halaman tersebut.
3. Dalam ~15 detik Anda akan mendapatkan URL HTTPS permanen (misal `https://landmit-budget.netlify.app`).

#### Cara Alternatif (Via GitHub Pages / Vercel):
1. Upload folder `web/` ke repository GitHub (bisa private di Vercel/Cloudflare, atau public di GitHub Pages).
2. Aktifkan GitHub Pages / import ke Vercel dengan root directory `web/`.

---

### Langkah 3 — Pasang di iPhone (Olan & Mitry)
1. Buka URL aplikasi dari Langkah 2 menggunakan **Safari** di iPhone.
2. Ketuk tombol **Share** (ikon kotak dengan panah ke atas di bagian bawah Safari).
3. Gulir ke bawah dan pilih **Add to Home Screen (Tambah ke Layar Utama)** → ketuk **Add**.
4. Tutup Safari, lalu buka ikon **Budgeting** baru di Home Screen iPhone (tampil full-screen seperti app asli!).
5. Ketuk ikon **⚙️ (Pengaturan)** di pojok kanan atas:
   - Pilih **Profil iPhone Ini** (`Olan` di HP Olan, `Mitry` di HP Mitry).
   - Tempel **Google Apps Script Web App URL** (`/exec`).
   - Masukkan **Token Rahasia (`API_TOKEN`)** yang sama dengan di `Code.gs`.
   - Ketuk **Tes Koneksi ke Google Sheets** → pastikan muncul pesan hijau *Terhubung!*.
   - Ketuk **Simpan & Hubungkan (Live)**.

Selesai! Setiap kali Anda atau pasangan mencatat pengeluaran dari iPhone, data langsung masuk ke baris kosong berikutnya di Google Spreadsheet dan semua rumus saldo + tab `PERBANDINGAN` langsung ter-update otomatis.

---

## 🧪 Menjalankan Pratinjau Lokal (Opsional)
Anda bisa mencoba tampilannya (Mode Demo) langsung di browser komputer:
```bash
cd /home/ubuntu/budget-tracker-ios/web
python3 -m http.server 8080
```
Lalu buka `http://localhost:8080`.

---

## 🛠️ Troubleshooting Singkat
- **Muncul error "Token tidak valid":** Pastikan `API_TOKEN` di `Code.gs` sama persis (tanpa spasi tambahan) dengan yang diisi di Pengaturan HP. Jika Anda mengubah `Code.gs`, wajib klik **Deploy → Manage deployments → Edit (ikon pensil) → Version: New version → Deploy**.
- **Bulan baru (misal DESEMBER):** Cukup duplikat tab bulan sebelumnya di Google Sheets lalu beri nama `DESEMBER` — aplikasi otomatis mendeteksinya di dropdown bulan!
