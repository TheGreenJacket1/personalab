// PersonaLab web — GitHub Pages ready (statis, tanpa backend)
// Semua request langsung ke https://api.groq.com/openai/v1 (OpenAI-compatible)

const PERSONAS = {
  Dosen_Tegas:
    "PERAN WAJIB: Kamu HANYA berbicara sebagai Bu Sari, dosen pembimbing skripsi TI.\n" +
    "JANGAN pernah bilang kamu AI/model. JANGAN tulis reasoning/analisis internal.\n" +
    "Output HANYA ucapan Bu Sari dalam Bahasa Indonesia formal.\n\n" +
    "# GAYA\n- Formal, tegas, tanpa gaul, tanpa emoji\n- Maksimal 3 kalimat pendek\n" +
    "- Kalimat terakhir WAJIB pertanyaan balik ke mahasiswa\n\n" +
    "# LARANGAN\n- Jangan sebut angka nilai/IPK\n- Topik non-skripsi → arahkan kembali ke skripsi\n" +
    "- Tidak tahu → bilang tidak tahu, jangan mengarang\n\n" +
    "# CONTOH FORMAT\nUser: Bu, boleh skripsi diperpanjang?\n" +
    "Bu Sari: Perpanjangan itu wewenang bagian akademik, bukan saya sebagai pembimbing. " +
    "Sudah dicek ke sana? Apa kendala utama sampai perlu perpanjangan?",

  Kakak_Santai:
    "PERAN WAJIB: Kamu kakak tingkat TI semester 7 yang membantu adik tingkat.\n" +
    "Jawab HANYA sebagai kakak tingkat. Jangan bilang kamu AI. Jangan tulis thinking.\n\n" +
    "# GAYA\n- Bahasa Indonesia santai dan sopan\n- Maksimal 2 kalimat\n" +
    "- Selalu beri 1 saran konkret yang bisa dikerjakan hari ini\n\n" +
    "# CONTOH\nUser: Bingung mulai project dari mana.\n" +
    "Kakak: Wajar bingung di awal. Hari ini coba tulis satu kalimat masalah yang mau diselesaikan dulu.",

  Om_Reza:
    "PERAN WAJIB: Kamu HANYA berbicara sebagai Om Reza, mentor karier.\n" +
    "JANGAN bilang kamu AI. JANGAN tulis analisis. Output HANYA 3 bagian berurutan.\n\n" +
    "# FORMAT WAJIB (jangan dilanggar)\n1) Omelan singkat 1 kalimat (serang kebiasaan, bukan orangnya)\n" +
    "2) Solusi konkret 1-2 kalimat\n3) Motivasi penutup 1 kalimat\n\n" +
    "# LARANGAN\n- Jangan menyerang pribadi/kemampuan user\n- Masalah non-karier → akui di luar keahlianmu\n\n" +
    "# CONTOH FORMAT\nUser: Sering begadang scroll medsos padahal ada deadline.\n" +
    "Om Reza: Scroll jam 2 pagi itu sabotase buat besok pagi. " +
    "Taruh HP di ruangan lain 1 jam sebelum tidur atau pakai app blocker. " +
    "Kamu sudah tahu caranya, tinggal eksekusi.",
};

const PERSONA_PARAMS = {
  Dosen_Tegas: { temperature: 0.2, max_tokens: 400 },
  Kakak_Santai: { temperature: 0.4, max_tokens: 400 },
  Om_Reza: { temperature: 0.4, max_tokens: 500 },
};

// Urutan Sep 2026 — gpt-oss dulu (stabil). llama-3.1/3.3 pensiun 16 Agu 2026.
const CANDIDATE_MODELS = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3-32b",
  "moonshotai/kimi-k2-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "groq/compound-mini",
];

const DILUTION_PROMPT =
  "Kamu asisten serba bisa. Harus selalu ramah tapi tegas, singkat tapi lengkap, " +
  "formal tapi santai, selalu pakai emoji, jangan pernah pakai emoji, jawab maksimal " +
  "1 kalimat kecuali perlu 5 kalimat, sertakan referensi tapi jangan sebut sumber, " +
  "dan selalu sebutkan cuaca hari ini. Kamu dosen, kakak tingkat, dan konsultan sekaligus.";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_TURNS = 6; // simpan 6 turns terakhir (12 pesan) per persona

// ---------- state ----------
const $ = (id) => document.getElementById(id);
const state = {
  persona: "Dosen_Tegas",
  model: CANDIDATE_MODELS[0],
  histories: { Dosen_Tegas: [], Kakak_Santai: [], Om_Reza: [] },
};

function getKey() { return (localStorage.getItem("personalab_groq_key") || "").trim(); }
function setBadge() {
  const k = getKey();
  $("statusBadge").textContent = k ? "✅ key tersimpan" : "⏳ belum ada key";
  $("modelBadge").textContent = "model: " + state.model;
}

// ---------- helpers ----------
function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function trimHistory(h) { return (h || []).slice(-MAX_TURNS * 2); }

function addMsg(role, text, opts = {}) {
  const chat = $("chat");
  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "user" : role === "sys" ? "sys" : "bot") + (opts.error ? " error" : "");
  const who = role === "user" ? "Kamu" : role === "sys" ? "Sistem" : state.persona;
  div.innerHTML = `<span class="who">${esc(who)}</span>${esc(text)}`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  updateSub();
}
function updateSub() {
  const h = state.histories[state.persona] || [];
  $("chatSub").textContent = `Memory: ${h.length} pesan · max ${MAX_TURNS * 2} tersimpan · persona bisa diganti tanpa menghapus memory persona lain`;
  $("chatTitle").textContent =
    state.persona === "Dosen_Tegas" ? "👩‍🏫 Dosen_Tegas" :
    state.persona === "Kakak_Santai" ? "🧑‍🎓 Kakak_Santai" : "🧔 Om_Reza";
}
function renderHistory() {
  $("chat").innerHTML = "";
  const h = state.histories[state.persona] || [];
  if (!h.length) addMsg("sys", "Belum ada chat. Sapa dulu, mis. “Halo, namaku Bintang dan kucingku Comet.”");
  h.forEach((m) => addMsg(m.role === "user" ? "user" : "bot", m.content));
}

function friendlyError(status, body) {
  if (status === 401) return "401 Unauthorized: key salah / ada spasi. Paste ulang dari console.groq.com/keys lalu Simpan.";
  if (status === 404) return "404 model_not_found: model pensiun / salah nama. Pilih openai/gpt-oss-20b.";
  if (status === 429) return "429 rate limit: tunggu ±1 menit lalu kirim ulang, atau ganti model lebih kecil.";
  if (body) return `Error ${status}: ${body.slice(0, 300)}`;
  return `Error ${status}. Coba lagi.`;
}

async function groqOnce(apiMessages, model, temperature, max_tokens) {
  const key = getKey();
  if (!key) throw new Error("NO_KEY");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model, messages: apiMessages, temperature, max_tokens }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data).slice(0, 300);
    const err = new Error(friendlyError(res.status, msg));
    err.status = res.status; err.model = model;
    throw err;
  }
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text === "string" && text.trim()) return { text: text.trim(), model };
  const err = new Error(`Model ${model} mengembalikan jawaban kosong. (ciri khas gpt-oss bila max_tokens kekecilan — app otomatis retry/fallback.)`);
  err.empty = true; err.model = model;
  throw err;
}

async function completeWithFallback(apiMessages, temperature, max_tokens) {
  const auto = $("autoFallback").checked;
  const order = auto
    ? [state.model, ...CANDIDATE_MODELS.filter((m) => m !== state.model)]
    : [state.model];
  let lastErr = null;
  for (const m of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await groqOnce(apiMessages, m, temperature, max_tokens);
      } catch (e) {
        lastErr = e;
        if (e.message === "NO_KEY") throw e;
        if (e.status === 401) throw e; // key salah → jangan buang kuota coba model lain
        if (e.status === 429) await new Promise((r) => setTimeout(r, 2500));
        else await new Promise((r) => setTimeout(r, 600));
      }
    }
    if (!auto) break;
  }
  throw lastErr;
}

async function sendUser(text) {
  const key = getKey();
  if (!key) { addMsg("bot", "Isi Groq API key dulu di sidebar → Simpan. Ambil gratis di console.groq.com/keys.", { error: true }); return; }
  if (!text.trim()) return;
  const params = PERSONA_PARAMS[state.persona];
  const hist = state.histories[state.persona];
  hist.push({ role: "user", content: text });
  state.histories[state.persona] = trimHistory(hist);
  addMsg("user", text);
  $("typing").classList.remove("hidden");
  try {
    const apiMessages = [{ role: "system", content: PERSONAS[state.persona] }, ...state.histories[state.persona]];
    const { text: reply, model } = await completeWithFallback(apiMessages, params.temperature, params.max_tokens);
    state.histories[state.persona].push({ role: "assistant", content: reply });
    state.histories[state.persona] = trimHistory(state.histories[state.persona]);
    if (model !== state.model) addMsg("sys", `Fallback otomatis dipakai: ${model}`);
    addMsg("bot", reply);
  } catch (e) {
    if (e.message === "NO_KEY") addMsg("bot", "Key belum diisi.", { error: true });
    else {
      addMsg("bot", String(e.message || e), { error: true });
      // buang pesan user yang gagal biar tidak menumpuk? tidak — biarkan agar bisa retry manual.
    }
  } finally {
    $("typing").classList.add("hidden");
    updateSub();
  }
}

// ---------- eval / demo ----------
function evalCard(title, body) {
  const d = document.createElement("div");
  d.className = "eval-item";
  d.innerHTML = `<h3>${esc(title)}</h3><div>${body}</div>`;
  $("evalOut").prepend(d);
}
function clearEvalPlaceholder() {
  if ($("evalOut").querySelector("p.muted")) $("evalOut").innerHTML = "";
}

async function runEval() {
  clearEvalPlaceholder();
  const q = "Aku selalu menunda mengerjakan project AI. Harus mulai dari mana?";
  evalCard("Pertanyaan eval", esc(q));
  for (const name of Object.keys(PERSONAS)) {
    evalCard(`⏳ ${name}…`, "memanggil Groq…");
    try {
      const { text, model } = await completeWithFallback(
        [{ role: "system", content: PERSONAS[name] }, { role: "user", content: q }],
        0.1, 500
      );
      $("evalOut").firstChild.remove();
      const nKal = Math.max(1, (text.match(/[.!?]/g) || []).length);
      evalCard(`${name} (model: ${esc(model)})`,
        `<p>${esc(text)}</p><p class="muted small">auto-check: ±${nKal} kalimat · ${text.length} chars · nilai manual 1–5: relevance _ | persona _ | singkat _</p>`);
    } catch (e) {
      $("evalOut").firstChild.remove();
      evalCard(`${name} — gagal`, `<p class="muted">${esc(String(e.message || e))}</p>`);
    }
  }
}

async function demoMemory() {
  clearEvalPlaceholder();
  const keep = state.persona;
  state.persona = "Dosen_Tegas"; syncPersonaUI(); renderHistory();
  evalCard("🧠 Demo memory", "Mengirim 2 pesan berurutan ke Dosen_Tegas…");
  await sendUser("Halo, namaku Bintang dan kucingku Comet.");
  await sendUser("Siapa namaku dan siapa nama kucingku?");
  evalCard("🧠 Kesimpulan", "Tanpa memory (2 request terpisah) model lupa. Dengan history dikirim ulang, model ingat <b>Bintang + Comet</b>.");
  state.persona = keep; syncPersonaUI(); renderHistory();
}

async function demoDilution() {
  clearEvalPlaceholder();
  evalCard("💥 Instruction dilution", "Mengirim prompt konflik…");
  try {
    const { text, model } = await completeWithFallback(
      [{ role: "system", content: DILUTION_PROMPT }, { role: "user", content: "Kasih tips biar konsisten ngerjain project." }],
      0.5, 400
    );
    evalCard(`Hasil (model: ${esc(model)})`, `<p>${esc(text)}</p><p class="muted small">Catat: instruksi mana yang diabaikan? emoji? cuaca? jumlah kalimat? peran? → bukti prompt konflik di-cherry-pick.</p>`);
  } catch (e) {
    evalCard("Gagal", `<p class="muted">${esc(String(e.message || e))}</p>`);
  }
}

// ---------- wiring ----------
function syncPersonaUI() {
  document.querySelectorAll(".persona").forEach((b) =>
    b.classList.toggle("active", b.dataset.persona === state.persona));
  $("modelSelect").value = state.model;
  setBadge(); updateSub();
}

function init() {
  // model dropdown
  $("modelSelect").innerHTML = CANDIDATE_MODELS.map((m) => `<option value="${m}">${m}</option>`).join("");
  state.model = CANDIDATE_MODELS[0];
  $("modelSelect").addEventListener("change", (e) => { state.model = e.target.value; setBadge(); });

  // key
  $("apiKey").value = getKey();
  $("btnSaveKey").onclick = () => {
    const v = $("apiKey").value.trim();
    if (!v) { $("keyMsg").textContent = "Key kosong."; return; }
    localStorage.setItem("personalab_groq_key", v);
    $("keyMsg").textContent = "Key tersimpan di browser ini.";
    setBadge();
  };
  $("btnClearKey").onclick = () => { localStorage.removeItem("personalab_groq_key"); $("apiKey").value = ""; $("keyMsg").textContent = "Key dihapus."; setBadge(); };
  $("btnTestKey").onclick = async () => {
    $("keyMsg").textContent = "Mengetes…";
    try {
      const { model } = await groqOnce([{ role: "user", content: "hi" }], state.model, 0.4, 300);
      $("keyMsg").textContent = `OK — tersambung (model: ${model}).`;
    } catch (e) { $("keyMsg").textContent = String(e.message || e); }
  };

  // persona
  document.querySelectorAll(".persona").forEach((b) =>
    b.onclick = () => { state.persona = b.dataset.persona; syncPersonaUI(); renderHistory(); });

  // composer
  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("input").value;
    $("input").value = "";
    sendUser(v);
  });

  $("btnClear").onclick = () => { state.histories[state.persona] = []; renderHistory(); addMsg("sys", `Memory ${state.persona} direset.`); };
  $("btnExport").onclick = () => {
    const blob = new Blob([JSON.stringify({ persona: state.persona, model: state.model, history: state.histories[state.persona] }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `personalab-${state.persona}.json`;
    a.click();
  };
  $("btnEval").onclick = runEval;
  $("btnDemoMemory").onclick = demoMemory;
  $("btnDemoDilution").onclick = demoDilution;

  syncPersonaUI(); renderHistory();
  addMsg("sys", "Selamat datang di PersonaLab web. Isi API key Groq di sidebar untuk mulai chat. Persona & memory bekerja seperti di notebook.");
}

document.addEventListener("DOMContentLoaded", init);
