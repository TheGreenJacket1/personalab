/**
 * PersonaLab — Anti-Slop Technical Workbench Engine
 * Handles Groq API inference, multi-turn sliding window memory,
 * dynamic model failover, and structured prompt engineering benchmarks.
 */

// --- Konfigurasi Persona & Parameter Decoding ---
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
    "Om Reza: Scroll jam 2 pagi itu sabotase buat masa depan kerjamu. " +
    "Taruh ponsel di ruangan lain satu jam sebelum tidur atau pasang aplikasi pembatas durasi layar. " +
    "Kamu sudah mengerti risikonya, sekarang ambil tindakan.",
};

const PERSONA_PARAMS = {
  Dosen_Tegas: { displayName: "Dosen_Tegas (Bu Sari)", temperature: 0.2, max_tokens: 400 },
  Kakak_Santai: { displayName: "Kakak_Santai (Kating TI)", temperature: 0.4, max_tokens: 400 },
  Om_Reza: { displayName: "Om_Reza (Mentor Karier)", temperature: 0.4, max_tokens: 500 },
};

// Urutan model inferensi aktif Groq (Fallbacks)
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
const MAX_TURNS = 6; // Menyimpan 6 putaran percakapan terakhir (12 pesan)
const STORAGE_KEY = "personalab_groq_key";

// --- State Aplikasi ---
const state = {
  persona: "Dosen_Tegas",
  model: CANDIDATE_MODELS[0],
  histories: {
    Dosen_Tegas: [],
    Kakak_Santai: [],
    Om_Reza: [],
  },
  isBusy: false,
  verifiedModel: null,
};

// --- DOM Selector Helper ---
const $ = (id) => document.getElementById(id);

// --- Keamanan & Utilitas String ---
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(date = new Date()) {
  return date.toTimeString().split(" ")[0];
}

function getKey() {
  return (localStorage.getItem(STORAGE_KEY) || "").trim();
}

function setKey(val) {
  if (!val) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, val.trim());
  }
  updateConnectionBadge();
}

// --- Visual Telemetry & Status Badges ---
function updateConnectionBadge(status = null, detail = null) {
  const badge = $("statusBadge");
  const text = $("statusText");
  const key = getKey();

  badge.className = "status-indicator";

  if (status === "connected") {
    badge.classList.add("ready");
    text.textContent = detail ? `Terhubung: ${detail}` : "Koneksi Terverifikasi";
  } else if (status === "error") {
    badge.classList.add("error");
    text.textContent = detail ? `Gagal: ${detail}` : "Autentikasi Gagal (401)";
  } else if (status === "testing") {
    badge.classList.add("pending");
    text.textContent = "Menguji Koneksi…";
  } else {
    if (key) {
      badge.classList.add("ready");
      text.textContent = "Kunci Tersimpan (Lokal)";
    } else {
      badge.classList.add("pending");
      text.textContent = "Kunci Belum Disetel";
    }
  }

  $("modelActiveBadge").textContent = state.model.replace("openai/", "").replace("meta-llama/", "");
  $("modelActiveIndicator").textContent = `Model: ${state.model}`;
}

function updatePromptInspection() {
  const currentPrompt = PERSONAS[state.persona];
  $("rawSystemPromptView").textContent = currentPrompt;
  const p = PERSONA_PARAMS[state.persona];
  $("activePersonaMeta").textContent = `temp ${p.temperature} · max ${p.max_tokens}`;
}

function setBusyState(busy, message = "Memproses inferensi…") {
  state.isBusy = busy;
  const typingIndicator = $("typingIndicator");
  const btnSend = $("btnSend");
  const composerInput = $("composerInput");
  const btnEval = $("btnEval");
  const btnDemoMemory = $("btnDemoMemory");
  const btnDemoDilution = $("btnDemoDilution");

  if (busy) {
    typingIndicator.classList.remove("hidden");
    $("typingLabel").textContent = message;
    btnSend.disabled = true;
    composerInput.disabled = true;
    btnEval.disabled = true;
    btnDemoMemory.disabled = true;
    btnDemoDilution.disabled = true;
  } else {
    typingIndicator.classList.add("hidden");
    btnSend.disabled = false;
    composerInput.disabled = false;
    btnEval.disabled = false;
    btnDemoMemory.disabled = false;
    btnDemoDilution.disabled = false;
    composerInput.focus();
  }
}

// --- Manajemen Memori Stateless (Sliding Window) ---
function trimHistory(history) {
  const maxMessages = MAX_TURNS * 2;
  if (!history || history.length <= maxMessages) return history || [];
  return history.slice(-maxMessages);
}

function updateMemoryCounter() {
  const currentHistory = state.histories[state.persona] || [];
  const maxCount = MAX_TURNS * 2;
  const personaMeta = PERSONA_PARAMS[state.persona];

  $("chatTitle").textContent = personaMeta.displayName;
  $("chatSub").textContent = `Sliding buffer: ${currentHistory.length} / ${maxCount} pesan tersimpan (max ${MAX_TURNS} giliran)`;
}

// --- Render Aliran Obrolan ---
function appendChatMessage(role, content, meta = {}) {
  const stream = $("chatStream");
  const entry = document.createElement("div");
  entry.className = `chat-entry ${role}${meta.error ? " error" : ""}`;

  const timeStr = meta.timestamp || formatTime();
  const roleLabel =
    role === "user"
      ? "Anda"
      : role === "system"
      ? "Sistem"
      : PERSONA_PARAMS[state.persona]?.displayName || state.persona;

  let headerHTML = `<div class="entry-header"><span>${esc(roleLabel)}</span><span>·</span><span>${timeStr}</span>`;
  if (meta.latency) {
    headerHTML += `<span>·</span><span class="telemetry-tag">${meta.latency} ms</span>`;
  }
  if (meta.model && meta.model !== state.model) {
    headerHTML += `<span>·</span><span class="telemetry-tag">fallback: ${esc(meta.model)}</span>`;
  }
  headerHTML += `</div>`;

  const bubbleHTML = `<div class="entry-bubble">${esc(content)}</div>`;

  let footerHTML = "";
  if (role === "assistant" && !meta.error) {
    const chars = content.length;
    const words = content.trim().split(/\s+/).length;
    footerHTML = `<div class="entry-footer-meta"><span>${words} kata · ${chars} karakter</span></div>`;
  }

  entry.innerHTML = `${headerHTML}${bubbleHTML}${footerHTML}`;
  stream.appendChild(entry);
  stream.scrollTop = stream.scrollHeight;
  updateMemoryCounter();
}

function renderActiveHistory() {
  const stream = $("chatStream");
  stream.innerHTML = "";
  const history = state.histories[state.persona] || [];

  if (history.length === 0) {
    appendChatMessage(
      "system",
      `Sesi percakapan baru untuk ${PERSONA_PARAMS[state.persona].displayName}. Riwayat memori masih kosong.`
    );
  } else {
    history.forEach((msg) => {
      appendChatMessage(msg.role === "user" ? "user" : "assistant", msg.content, {
        timestamp: msg.timestamp,
        latency: msg.latency,
        model: msg.model,
      });
    });
  }
  updateMemoryCounter();
}

// --- Komunikasi HTTP ke Groq Inference Engine ---
function formatErrorDetail(status, rawError) {
  if (status === 401) {
    return "HTTP 401 (Unauthorized): Kunci API salah atau tidak memiliki akses. Periksa kembali di console.groq.com/keys.";
  }
  if (status === 404) {
    return "HTTP 404 (Not Found): Model yang diminta tidak aktif atau telah pensiun pada katalog Groq.";
  }
  if (status === 429) {
    return "HTTP 429 (Rate Limit): Batas pemanggilan per menit (RPM) tercapai. Silakan jeda beberapa detik.";
  }
  if (rawError) {
    return `HTTP ${status}: ${rawError.slice(0, 240)}`;
  }
  return `Terjadi kesalahan komunikasi HTTP ${status}.`;
}

async function invokeGroqOnce(messagesPayload, targetModel, temperature, maxTokens) {
  const key = getKey();
  if (!key) {
    const err = new Error("Kunci API Groq belum disetel. Isi kunci pada panel samping.");
    err.code = "NO_KEY";
    throw err;
  }

  const startTime = performance.now();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: targetModel,
      messages: messagesPayload,
      temperature: temperature,
      max_tokens: maxTokens,
    }),
  });

  const durationMs = Math.round(performance.now() - startTime);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error?.message || JSON.stringify(data);
    const err = new Error(formatErrorDetail(response.status, errorMsg));
    err.status = response.status;
    err.model = targetModel;
    err.latency = durationMs;
    throw err;
  }

  const generatedText = data?.choices?.[0]?.message?.content;
  if (typeof generatedText === "string" && generatedText.trim().length > 0) {
    return {
      text: generatedText.trim(),
      model: targetModel,
      latency: durationMs,
      usage: data.usage || null,
    };
  }

  const emptyErr = new Error(
    `Model ${targetModel} mengembalikan respon kosong. Periksa alokasi token minimum.`
  );
  emptyErr.empty = true;
  emptyErr.model = targetModel;
  emptyErr.latency = durationMs;
  throw emptyErr;
}

async function requestCompletionWithFailover(messagesPayload, temperature, maxTokens) {
  const autoFallback = $("autoFallback").checked;
  const modelChain = autoFallback
    ? [state.model, ...CANDIDATE_MODELS.filter((m) => m !== state.model)]
    : [state.model];

  let lastException = null;

  for (const candidate of modelChain) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await invokeGroqOnce(messagesPayload, candidate, temperature, maxTokens);
      } catch (err) {
        lastException = err;
        if (err.code === "NO_KEY" || err.status === 401) {
          // Jangan lanjutkan jika kunci salah
          throw err;
        }
        if (err.status === 429) {
          // Tunggu 2 detik jika terkena rate limit
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
    }
    if (!autoFallback) break;
  }

  throw lastException;
}

// --- Penanganan Interaksi Pengguna ---
async function handleUserSubmit(userText) {
  const trimmed = userText.trim();
  if (!trimmed || state.isBusy) return;

  const key = getKey();
  if (!key) {
    appendChatMessage(
      "system",
      "Kunci API Groq belum disetel. Masukkan kunci API Anda di panel kiri untuk mulai menguji.",
      { error: true }
    );
    return;
  }

  const activePersonaId = state.persona;
  const currentHistory = state.histories[activePersonaId];
  const timeNow = formatTime();

  // Simpan dan tampilkan pesan pengguna
  const userEntry = { role: "user", content: trimmed, timestamp: timeNow };
  currentHistory.push(userEntry);
  state.histories[activePersonaId] = trimHistory(currentHistory);
  appendChatMessage("user", trimmed, { timestamp: timeNow });

  // Susun payload stateless: [System Prompt, ...Sliding History]
  const payload = [
    { role: "system", content: PERSONAS[activePersonaId] },
    ...state.histories[activePersonaId].map((m) => ({ role: m.role, content: m.content })),
  ];

  const params = PERSONA_PARAMS[activePersonaId];
  setBusyState(true, `Menghubungi Groq (${state.model})…`);

  try {
    const result = await requestCompletionWithFailover(
      payload,
      params.temperature,
      params.max_tokens
    );

    const assistantEntry = {
      role: "assistant",
      content: result.text,
      timestamp: formatTime(),
      latency: result.latency,
      model: result.model,
    };

    state.histories[activePersonaId].push(assistantEntry);
    state.histories[activePersonaId] = trimHistory(state.histories[activePersonaId]);

    appendChatMessage("assistant", result.text, {
      timestamp: assistantEntry.timestamp,
      latency: result.latency,
      model: result.model,
    });
  } catch (err) {
    appendChatMessage("system", `Gagal memproses respon: ${err.message}`, { error: true });
  } finally {
    setBusyState(false);
  }
}

// --- Tab Navigation Switcher ---
function switchTab(targetTabId) {
  const tabs = [
    { btn: $("tabBtnChat"), content: $("tabChat") },
    { btn: $("tabBtnLab"), content: $("tabLab") },
    { btn: $("tabBtnDoc"), content: $("tabDoc") },
  ];

  tabs.forEach((tab) => {
    const isTarget = tab.content.id === targetTabId;
    tab.btn.classList.toggle("active", isTarget);
    tab.btn.setAttribute("aria-selected", isTarget ? "true" : "false");
    tab.content.classList.toggle("active", isTarget);
  });
}

// --- Eksperimen Laboratorium & Komparasi 3 Persona ---
function clearEvalPlaceholder() {
  const placeholder = $("evalPlaceholder");
  if (placeholder) placeholder.remove();
}

async function runEval3Personas() {
  if (state.isBusy) return;
  const key = getKey();
  if (!key) {
    alert("Silakan isi dan simpan kunci API Groq terlebih dahulu.");
    return;
  }

  switchTab("tabLab");
  clearEvalPlaceholder();

  const evalQuestion = "Aku selalu menunda mengerjakan project AI skripsi. Harus mulai dari mana?";
  const runId = "run_" + Date.now();
  const runCard = document.createElement("div");
  runCard.className = "eval-run-card";
  runCard.id = runId;

  runCard.innerHTML = `
    <div class="eval-run-card-header">
      <div>
        <h3 class="eval-run-title">Komparasi 3 Persona (1 Pertanyaan Identik)</h3>
        <div class="eval-run-meta">
          Pertanyaan: <em>&ldquo;${esc(evalQuestion)}&rdquo;</em> · Sampling deterministik: <code>temp=0.1</code>
        </div>
      </div>
      <span class="telemetry-tag">Sedang memproses…</span>
    </div>
    <div class="eval-matrix-container" id="${runId}_matrix">
      <div class="matrix-cell"><div class="help-text">Memanggil Dosen_Tegas…</div></div>
      <div class="matrix-cell"><div class="help-text">Memanggil Kakak_Santai…</div></div>
      <div class="matrix-cell"><div class="help-text">Memanggil Om_Reza…</div></div>
    </div>
  `;

  $("evalContainer").prepend(runCard);
  setBusyState(true, "Menjalankan evaluasi komparatif 3 persona…");

  const results = {};
  const personaKeys = Object.keys(PERSONAS);

  for (let i = 0; i < personaKeys.length; i++) {
    const pKey = personaKeys[i];
    try {
      const payload = [
        { role: "system", content: PERSONAS[pKey] },
        { role: "user", content: evalQuestion },
      ];
      // Evaluasi memakai temperature 0.1 untuk mengukur determinisme kepatuhan aturan
      const res = await requestCompletionWithFailover(payload, 0.1, 500);
      results[pKey] = { success: true, ...res };
    } catch (err) {
      results[pKey] = { success: false, error: err.message };
    }
  }

  // Render Hasil Komparasi ke Matriks
  const matrixContainer = $(`${runId}_matrix`);
  matrixContainer.innerHTML = "";

  personaKeys.forEach((pKey) => {
    const meta = PERSONA_PARAMS[pKey];
    const res = results[pKey];
    const cell = document.createElement("div");
    cell.className = "matrix-cell";

    if (res.success) {
      const sentences = (res.text.match(/[^.!?]+[.!?]+/g) || [res.text]).length;
      const chars = res.text.length;

      cell.innerHTML = `
        <div class="matrix-cell-header">
          <span class="matrix-persona-title">${esc(meta.displayName)}</span>
          <span class="telemetry-tag">${res.latency} ms</span>
        </div>
        <div class="matrix-response-body">${esc(res.text)}</div>
        <div class="matrix-telemetry">
          <span class="telemetry-tag">±${sentences} kalimat</span>
          <span class="telemetry-tag">${chars} karakter</span>
          <span class="telemetry-tag">Model: ${esc(res.model)}</span>
        </div>
      `;
    } else {
      cell.innerHTML = `
        <div class="matrix-cell-header">
          <span class="matrix-persona-title">${esc(meta.displayName)}</span>
          <span class="telemetry-tag" style="color: var(--status-error);">Gagal</span>
        </div>
        <div class="matrix-response-body" style="color: var(--status-error);">${esc(res.error)}</div>
      `;
    }
    matrixContainer.appendChild(cell);
  });

  const headerTag = runCard.querySelector(".eval-run-card-header .telemetry-tag");
  if (headerTag) {
    headerTag.textContent = `Selesai · ${formatTime()}`;
  }

  setBusyState(false);
}

async function runMemoryRetentionTest() {
  if (state.isBusy) return;
  const key = getKey();
  if (!key) {
    alert("Silakan simpan kunci API Groq terlebih dahulu.");
    return;
  }

  switchTab("tabChat");
  state.persona = "Dosen_Tegas";
  syncPersonaSelection();
  renderActiveHistory();

  appendChatMessage(
    "system",
    "UJI RETENSI MEMORI: Mengirim dua giliran berturut-turut untuk memvalidasi rekonstruksi memori stateless…"
  );

  await handleUserSubmit("Halo Bu Sari, nama saya Bintang dan kucing peliharaan saya bernama Comet.");

  // Beri jeda kecil agar request pertama tuntas
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await handleUserSubmit("Bu, siapa nama saya dan siapa nama kucing saya?");

  appendChatMessage(
    "system",
    "HASIL: Tanpa pengiriman ulang riwayat (stateless), model akan melupakan konteks giliran pertama. Respons yang tepat membuktikan buffer sliding window berhasil dikirim utuh."
  );
}

async function runDilutionStressTest() {
  if (state.isBusy) return;
  const key = getKey();
  if (!key) {
    alert("Silakan simpan kunci API Groq terlebih dahulu.");
    return;
  }

  switchTab("tabLab");
  clearEvalPlaceholder();

  const runId = "dilution_" + Date.now();
  const runCard = document.createElement("div");
  runCard.className = "eval-run-card";
  runCard.id = runId;

  runCard.innerHTML = `
    <div class="eval-run-card-header">
      <div>
        <h3 class="eval-run-title">Uji Stres Instruction Dilution (Kontradiksi Prompt)</h3>
        <div class="eval-run-meta">
          Menyuntikkan instruksi kontradiktif: ramah vs tegas, wajib emoji vs larangan emoji, 1 kalimat vs 5 kalimat.
        </div>
      </div>
      <span class="telemetry-tag">Memanggil model…</span>
    </div>
    <div class="matrix-cell" style="margin-top: 10px;">
      <div class="help-text">Sedang memproses instruksi konflik…</div>
    </div>
  `;

  $("evalContainer").prepend(runCard);
  setBusyState(true, "Menguji degradasi instruksi kontradiktif…");

  try {
    const payload = [
      { role: "system", content: DILUTION_PROMPT },
      { role: "user", content: "Bagaimana cara menjaga konsistensi pengerjaan skripsi?" },
    ];
    const res = await requestCompletionWithFailover(payload, 0.5, 450);

    const hasEmoji = /\p{Extended_Pictographic}/u.test(res.text);
    const mentionsWeather = /cuaca|hujan|panas|cerah|suhu|derajat/i.test(res.text);
    const sentenceCount = (res.text.match(/[^.!?]+[.!?]+/g) || [res.text]).length;

    runCard.querySelector(".matrix-cell").innerHTML = `
      <div class="matrix-response-body"><strong>Respon Model:</strong><br>${esc(res.text)}</div>
      <div class="matrix-telemetry" style="margin-top: 10px;">
        <span class="telemetry-tag">Model: ${esc(res.model)}</span>
        <span class="telemetry-tag">Latensi: ${res.latency} ms</span>
        <span class="telemetry-tag">Emoji Terdeteksi: ${hasEmoji ? "Ya (Melanggar larangan)" : "Tidak (Abaikan aturan emoji)"}</span>
        <span class="telemetry-tag">Sebut Cuaca: ${mentionsWeather ? "Ya" : "Tidak (Diabaikan)"}</span>
        <span class="telemetry-tag">Jumlah Kalimat: ±${sentenceCount}</span>
      </div>
      <p class="help-text" style="margin-top: 8px;">
        <b>Analisis Anti-Slop:</b> Ketika instruksi berlebihan dan saling bertentangan diberikan dalam satu system prompt, model cenderung melakukan <i>cherry-picking</i> acak dan kehilangan konsistensi peran persona.
      </p>
    `;
    runCard.querySelector(".eval-run-card-header .telemetry-tag").textContent = "Selesai";
  } catch (err) {
    runCard.querySelector(".matrix-cell").innerHTML = `
      <div style="color: var(--status-error);">${esc(err.message)}</div>
    `;
    runCard.querySelector(".eval-run-card-header .telemetry-tag").textContent = "Gagal";
  } finally {
    setBusyState(false);
  }
}

// --- Sinkronisasi & Pemasangan Event Listener ---
function syncPersonaSelection() {
  document.querySelectorAll(".persona-item").forEach((btn) => {
    const isActive = btn.dataset.persona === state.persona;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-checked", isActive ? "true" : "false");
  });
  updatePromptInspection();
  updateMemoryCounter();
}

function initEventHandlers() {
  // Tab Switcher
  $("tabBtnChat").addEventListener("click", () => switchTab("tabChat"));
  $("tabBtnLab").addEventListener("click", () => switchTab("tabLab"));
  $("tabBtnDoc").addEventListener("click", () => switchTab("tabDoc"));

  // Toggle Visibility Kunci API
  $("btnToggleKeyVis").addEventListener("click", () => {
    const input = $("apiKey");
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    $("btnToggleKeyVis").textContent = isPass ? "Tutup" : "Lihat";
  });

  // Simpan Kunci
  $("btnSaveKey").addEventListener("click", () => {
    const val = $("apiKey").value.trim();
    if (!val) {
      $("keyMsg").textContent = "Kunci API tidak boleh kosong.";
      $("keyMsg").style.color = "var(--status-error)";
      return;
    }
    setKey(val);
    $("keyMsg").textContent = "Kunci API berhasil disimpan secara lokal.";
    $("keyMsg").style.color = "var(--status-ready)";
  });

  // Hapus Kunci
  $("btnClearKey").addEventListener("click", () => {
    setKey("");
    $("apiKey").value = "";
    $("keyMsg").textContent = "Kunci API dihapus dari peramban.";
    $("keyMsg").style.color = "var(--text-secondary)";
  });

  // Uji Ping Kunci
  $("btnTestKey").addEventListener("click", async () => {
    const key = getKey();
    if (!key) {
      $("keyMsg").textContent = "Harap simpan kunci API terlebih dahulu.";
      $("keyMsg").style.color = "var(--status-error)";
      return;
    }

    $("keyMsg").textContent = "Mengirim ping ke api.groq.com…";
    $("keyMsg").style.color = "var(--text-secondary)";
    updateConnectionBadge("testing");

    try {
      const pingPayload = [{ role: "user", content: "ping" }];
      const res = await invokeGroqOnce(pingPayload, state.model, 0.1, 10);
      state.verifiedModel = res.model;
      $("keyMsg").textContent = `Koneksi aktif · Model ${res.model} merespon (${res.latency} ms).`;
      $("keyMsg").style.color = "var(--status-ready)";
      updateConnectionBadge("connected", `${res.model} (${res.latency}ms)`);
    } catch (err) {
      $("keyMsg").textContent = err.message;
      $("keyMsg").style.color = "var(--status-error)";
      updateConnectionBadge("error", err.status ? `HTTP ${err.status}` : "Koneksi Gagal");
    }
  });

  // Pemilihan Model
  const modelSelect = $("modelSelect");
  modelSelect.innerHTML = CANDIDATE_MODELS.map(
    (m) => `<option value="${m}">${m}</option>`
  ).join("");
  modelSelect.value = state.model;
  modelSelect.addEventListener("change", (e) => {
    state.model = e.target.value;
    updateConnectionBadge();
  });

  // Pemilihan Persona
  document.querySelectorAll(".persona-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.persona = btn.dataset.persona;
      syncPersonaSelection();
      renderActiveHistory();
    });
  });

  // Karakter Counter & Shortcut Keyboard Composer
  const composerInput = $("composerInput");
  composerInput.addEventListener("input", () => {
    $("charCounter").textContent = `${composerInput.value.length} karakter`;
  });

  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("composerForm").dispatchEvent(new Event("submit"));
    }
  });

  // Form Submit Chat
  $("composerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = composerInput.value;
    composerInput.value = "";
    $("charCounter").textContent = "0 karakter";
    handleUserSubmit(text);
  });

  // Reset Sesi Chat
  $("btnClear").addEventListener("click", () => {
    if (confirm(`Kosongkan riwayat percakapan untuk ${PERSONA_PARAMS[state.persona].displayName}?`)) {
      state.histories[state.persona] = [];
      renderActiveHistory();
    }
  });

  // Ekspor Chat JSON
  $("btnExport").addEventListener("click", () => {
    const exportData = {
      app: "PersonaLab",
      exportedAt: new Date().toISOString(),
      persona: {
        id: state.persona,
        displayName: PERSONA_PARAMS[state.persona].displayName,
        parameters: PERSONA_PARAMS[state.persona],
        systemPrompt: PERSONAS[state.persona],
      },
      model: state.model,
      turnsCount: (state.histories[state.persona] || []).length,
      history: state.histories[state.persona] || [],
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `personalab-${state.persona}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  // Tombol Pengujian Terkendali
  $("btnEval").addEventListener("click", runEval3Personas);
  $("btnDemoMemory").addEventListener("click", runMemoryRetentionTest);
  $("btnDemoDilution").addEventListener("click", runDilutionStressTest);

  // Bersihkan Lab
  $("btnClearLab").addEventListener("click", () => {
    $("evalContainer").innerHTML = `
      <div class="eval-run-card" id="evalPlaceholder">
        <div class="eval-run-card-header">
          <div>
            <h3 class="eval-run-title">Hasil Uji Telah Dibersihkan</h3>
            <div class="eval-run-meta">Jalankan pengujian baru melalui panel samping kiri.</div>
          </div>
        </div>
      </div>
    `;
  });
}

// --- Inisialisasi Aplikasi ---
function initializeWorkbench() {
  const existingKey = getKey();
  if (existingKey) {
    $("apiKey").value = existingKey;
  }

  updateConnectionBadge();
  syncPersonaSelection();
  renderActiveHistory();
  initEventHandlers();
}

document.addEventListener("DOMContentLoaded", initializeWorkbench);
