# PersonaLab — Multi-Persona LLM Workbench

Instrumen laboratorium interaktif dan eksperimen rekayasa prompt (*prompt engineering*) berbasis **Groq API** (OpenAI-compatible) untuk divisi riset AI/ML.

Proyek ini mendemonstrasikan secara transparan bagaimana instruksi sistem (*system prompt*), parameter *decoding* (*temperature* & *max_tokens*), retensi memori *sliding window* pada arsitektur *stateless*, serta fenomena *instruction dilution* bekerja pada model bahasa besar (LLM).

Dibangun dengan mematuhi standar kualitas ketat **Anti-Slop Engine**: berorientasi fungsi, bebas dekorasi artifisial tanpa tujuan, telemetri berbasis data nyata, dan aksesibel.

---

## 1. Komponen Berkas Proyek

| Berkas | Deskripsi & Kegunaan |
|---|---|
| `index.html` | Antarmuka workbench teknis (tata letak responsif, navigasi tab, aksesibilitas ARIA). |
| `styles.css` | Lembar gaya kustom bergaya instrumen laboratorium (kontras tinggi, tipografi modular). |
| `app.js` | Mesin klien: komunikasi HTTP ke Groq, failover model dinamis, manajemen memori 12 pesan. |
| `PersonaLab_final.ipynb` | Notebook eksperimen akademik lengkap (analisis komparasi + purwarupa Gradio Blocks). |
| `ANTI_SLOP.md` | Laporan audit kepatuhan terhadap prinsip ANTI-SLOP ENGINE (UI/UX, kode, dan copy). |
| `.github/workflows/pages.yml` | Alur kerja GitHub Actions untuk penerapan otomatis (*auto-deployment*) ke GitHub Pages. |
| `.nojekyll` | Menjamin aset web statis disajikan langsung oleh server GitHub Pages tanpa pemrosesan Jekyll. |

---

## 2. Fitur & Pengujian Terkendali

1. **3 Persona Terstruktur:**
   - **`Dosen_Tegas` (Bu Sari):** Gaya akademis formal, pembatasan jawaban maksimal 3 kalimat, ditutup dengan pertanyaan konseptual, `temperature=0.2`.
   - **`Kakak_Santai` (Kating TI):** Pendekatan bimbingan sebaya santai-santun, maksimal 2 kalimat, wajib menyertakan 1 tindakan konkret hari ini, `temperature=0.4`.
   - **`Om_Reza` (Mentor Karier):** Format terstruktur 3 fase (teguran kebiasaan buruk + solusi taktis + dorongan eksekusi), `temperature=0.4`.
2. **Inspeksi System Prompt:**
   - Panel *drawer* yang menampilkan teks mentah *system prompt* yang diinjeksikan pada elemen ke-0 array `messages`.
3. **Rekonstruksi Memori Stateless (Sliding Window):**
   - API LLM bersifat *stateless* (tidak menyimpan memori antar panggilan HTTP). Workbench mengelola array riwayat lokal dan memotongnya secara otomatis pada 6 giliran terakhir (12 pesan) guna menjaga efisiensi token dan konteks mutakhir.
4. **Matriks Komparasi 3 Persona (Benchmark):**
   - Menguji 1 pertanyaan identik ke 3 persona sekaligus secara deterministik (`temperature=0.1`) untuk memverifikasi ketaatan aturan peran.
5. **Uji Stres Instruction Dilution:**
   - Menyuntikkan prompt kontradiktif untuk mendemonstrasikan degradasi kinerja model saat dibebani kriteria yang saling berbenturan.
6. **Ekspor Riwayat (.json):**
   - Mengunduh artefak sesi riset berisi stempel waktu ISO, konfigurasi parameter decoding, system prompt aktif, dan seluruh array percakapan.

---

## 3. Menjalankan Secara Lokal

### A. Antarmuka Web (Statis)
Aplikasi web ini murni *client-side* tanpa membutuhkan runtime backend seperti Node.js atau Python:
1. Buka berkas `index.html` langsung pada peramban web modern, atau gunakan server statis lokal:
   ```bash
   # Menggunakan Python
   python -m http.server 8000
   # Buka http://localhost:8000 pada peramban
   ```
2. Masukkan **Groq API Key** (dapat diperoleh gratis di [console.groq.com/keys](https://console.groq.com/keys)).
3. Klik **Simpan Kunci** lalu **Uji Koneksi (Ping)**.

### B. Notebook Jupyter (`PersonaLab_final.ipynb`)
Untuk keperluan eksperimen dan menjalankan antarmuka Gradio di lingkungan Colab / lokal:
```bash
pip install -q openai gradio python-dotenv

# Set kredensial API melalui environment variable:
# Windows PowerShell:
$env:GROQ_API_KEY="gsk_..."
# Linux / macOS:
export GROQ_API_KEY="gsk_..."

jupyter notebook PersonaLab_final.ipynb
```

---

## 4. Penerapan ke GitHub Pages (Zero-Config)

### Metode A — Menggunakan GitHub Actions (Disarankan)
Berkas `.github/workflows/pages.yml` telah disediakan:
1. Dorong repositori ke GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: persona lab anti-slop workbench"
   git branch -M main
   git remote add origin https://github.com/USERNAME/personalab.git
   git push -u origin main
   ```
2. Buka tab **Settings** repositori di GitHub → **Pages**.
3. Pada opsi **Build and deployment** → **Source**, pilih **GitHub Actions**.
4. Alur kerja akan memublikasikan web ke `https://USERNAME.github.io/personalab/`.

### Metode B — Deploy dari Branch
1. Buka **Settings** → **Pages**.
2. Pada **Source**, pilih **Deploy from a branch**.
3. Pilih branch `main` dan folder `/ (root)`, lalu klik **Save**.

---

## 5. Keamanan & Privasi Data

- **Penyimpanan Kunci Lokal:** Kunci API Groq hanya disimpan di dalam `localStorage` peramban Anda.
- **Tanpa Server Perantara:** Permintaan inferensi dikirim secara langsung dari peramban ke `https://api.groq.com/openai/v1/chat/completions`.
- **Tidak Ada Kebocoran Kunci:** Kunci tidak pernah terkirim ke repositori atau server analitik mana pun.

---

## 6. Diagnosis Kendala Teknis (Troubleshooting)

| Kode / Gejala | Akar Masalah | Solusi Mitigasi |
|---|---|---|
| **HTTP 401 Unauthorized** | Kunci API salah, telah dicabut, atau memiliki spasi tak sengaja. | Salin ulang kunci dari konsol Groq dan simpan kembali. |
| **HTTP 404 model_not_found** | Nama model telah pensiun pada katalog Groq (mis. model Llama versi lama per Agustus 2026). | Gunakan default `openai/gpt-oss-20b` atau aktifkan fitur *Failover Otomatis*. |
| **HTTP 429 Rate Limit** | Batas permintaan per menit terlampaui. | Tunggu beberapa saat; aplikasi menerapkan backoff otomatis 2 detik sebelum mencoba ulang. |
| **Respon Kosong (`''`)** | Alokasi `max_tokens` terlalu rendah pada model berbasis gpt-oss. | Aplikasi telah menetapkan ambang aman 400–500 token untuk mencegah pemotongan token sebelum jawaban selesai. |

---

## 7. Lisensi & Kredit

Dikembangkan untuk divisi **ITC AI/ML** sebagai studi perbandingan implementasi LLM multi-persona dan metodologi perancangan antarmuka berstandar *Anti-Slop*.
