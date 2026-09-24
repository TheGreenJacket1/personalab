# PersonaLab — Multi-Persona Chatbot (Groq)

ITC AI/ML Division — Proyek Individual LLM.

| File | Fungsi |
|---|---|
| `PersonaLab_final.ipynb` | Notebook final (eksperimen + Gradio). Buka di Colab / Jupyter. |
| `index.html` + `styles.css` + `app.js` | Web statis siap deploy ke **GitHub Pages** (tanpa backend). |
| `.github/workflows/pages.yml` | Auto-deploy ke Pages tiap push ke `main`. |
| `.nojekyll` | Agar Pages menyajikan file apa adanya. |

## 1. Isi cepat

- 3 persona: **Dosen_Tegas** (temp 0.2), **Kakak_Santai** (0.4), **Om_Reza** (0.4)
- Memory manual: `messages` dikirim ulang tiap request, trim 6 turns
- Instruction dilution demo, evaluasi 3×1, troubleshooting 401/429/404/empty
- Provider **Groq** (OpenAI-compatible). Key gratis: https://console.groq.com/keys
- Model default Sep 2026: `openai/gpt-oss-20b` → fallback `openai/gpt-oss-120b`, dst.
  (`llama-3.3-70b-versatile` & `llama-3.1-8b-instant` pensiun 16 Agu 2026 — itu penyebab 404 di versi lama.)

## 2. Jalankan notebook (lokal / Colab)

```bash
pip install -q openai gradio python-dotenv
# isi key via env agar tidak ke-commit:
#   Windows PowerShell: $env:GROQ_API_KEY="gsk_..."
#   Linux/Mac: export GROQ_API_KEY="gsk_..."
# atau simpan di Colab Secrets bernama GROQ_API_KEY
jupyter notebook PersonaLab_final.ipynb
```

Di Colab: upload ipynb → Runtime → Run all → isi key saat diminta.

## 3. Deploy web ke GitHub Pages (5 menit)

**Opsi A — via web GitHub (tanpa git):**
1. Buat repo baru di github.com (mis. `personalab`), Public.
2. Upload file: `index.html`, `styles.css`, `app.js`, `.nojekyll`, `README.md`
   (drag-drop di halaman repo → Add file → Upload files → Commit).
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.
4. Tunggu ±1 menit → buka `https://USERNAME.github.io/personalab/`.
5. Di web: isi **Groq API key** di sidebar → Simpan → Test → chat.

**Opsi B — via git (disarankan):**
```bash
cd personalab
git init
git add index.html styles.css app.js .nojekyll README.md .gitignore PersonaLab_final.ipynb .github/workflows/pages.yml
git commit -m "PersonaLab final + web GitHub Pages"
git branch -M main
git remote add origin https://github.com/USERNAME/personalab.git
git push -u origin main
# lalu aktifkan Pages seperti Opsi A, atau biarkan workflow pages.yml yang deploy otomatis.
```

**Opsi C — otomatis via Actions:**
File `.github/workflows/pages.yml` sudah disiapkan. Setelah push ke `main`,
buka tab **Actions** → pastikan workflow `Deploy to GitHub Pages` hijau,
lalu **Settings → Pages** → Source: **GitHub Actions**.

## 4. Cara pakai web

1. Isi key → Simpan (tersimpan di `localStorage` browser saja, tidak ikut ke repo).
2. Pilih model + persona → kirim pesan.
3. `Clear` = reset memory persona aktif (memory tiap persona terpisah).
4. Tombol demo: **Demo memory**, **Demo dilution**, **Eval 3 persona**, **Export chat**.

## 5. Ganti model / persona

- Model: edit `CANDIDATE_MODELS` di `app.js` (dan `PersonaLab_final.ipynb`).
  Cek nama aktif: https://console.groq.com/docs/models
- Persona: edit `PERSONAS` + `PERSONA_PARAMS` di kedua file (harus sama).

## 6. Troubleshooting

| Gejala | Fix |
|---|---|
| 401 | key salah / ada spasi → paste ulang |
| 404 model_not_found | model pensiun → pakai `openai/gpt-oss-20b` |
| 429 | tunggu 1 menit / kecilkan pesan / ganti model kecil |
| Jawaban kosong `''` | khas `gpt-oss` bila `max_tokens` kecil → web sudah pakai 400–500 + retry + fallback |
| Pages 404 | cek file di root branch `main`, ada `.nojekyll`, Pages source benar |
| Actions gagal | Settings → Pages → Source: GitHub Actions; repo Public atau Actions diizinkan |

## 7. Keamanan key

- Jangan hardcode key di `app.js` / ipynb / commit.
- Web ini meminta key dari pengunjung (milik masing-masing).
- Untuk demo kelas: buat key sementara di console.groq.com lalu revoke setelah presentasi.
- Untuk produksi serius: taruh Groq di belakang backend proxy (bukan di GitHub Pages statis).

## 8. Struktur repo minimal untuk Pages

```
personalab/
  index.html
  styles.css
  app.js
  .nojekyll
  README.md
  PersonaLab_final.ipynb   (opsional, tetap bisa diunduh pengunjung)
```
