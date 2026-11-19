"use strict";

const MONTHLY_BASE_ALLOWANCE = 200.0;
const FIXED_CHARGES_TOTAL = 60.23; // 4 + 3 + 5.49 + 17.74 + 10 + 10 + 10
const FOOD_PROVISION = 100.0;
const MID_MONTH_LIMIT_ALIM = 50.0;
const MID_MONTH_LIMIT_EXTRAS = 25.0;

const BUCKETS = {
  ALIMENTAIRE: "alimentaire",
  BARS: "bars",
  EXTRAS: "extras",
  ABONNEMENT: "abonnement",
  GAIN: "gain",
};

const BUCKET_LABELS = {
  alimentaire: "Dépenses alimentaires",
  bars: "Bars",
  extras: "Extras",
  abonnement: "Abonnements fixes (60,23 €)",
};

const FIXED_SUB_RULES = [
  { amount: 4.0, keywords: ["apple.com/bill", "itunes", "apple music"] },
  { amount: 3.0, keywords: ["free mobile", "free telecom", "bouygues", "sosh", "orange", "sfr", "red by sfr", "b&you", "prixtel"] },
  { amount: 5.49, keywords: ["google one", "google*google", "g.co/helppay", "google storage", "google play"] },
  { amount: 17.74, keywords: ["velib", "smovengo"] },
  { amount: 10.0, keywords: ["tirelire", "vir livret", "virement livret", "epargne"] },
  { amount: 10.0, keywords: ["coloc"] },
];

const BARS_KEYWORDS = [
  " bar ",
  "le bar",
  "pub ",
  " pub ",
  "brasserie",
  "bistro",
  "comptoir",
  "taverne",
  "guinguette",
  "cave ",
  "beer",
  "biere",
  "cocktail",
  "lounge",
  "club ",
  "discotheque",
  "cabaret",
  "tapas",
  "bodega",
  "chupitos",
  "delirium",
  "frog ",
  "3 brasseurs",
  "au fut",
  "guinness",
  "irish",
  "rooftop",
  "cafe ",
  "starbucks",
  "columbus",
  "nicolas ",
];

const ALIMENTAIRE_KEYWORDS = [
  "carrefour",
  "leclerc",
  "auchan",
  "intermarche",
  "super u",
  "hyper u",
  "u express",
  "utile ",
  "monoprix",
  "monop'",
  "monop ",
  "franprix",
  "lidl",
  "aldi",
  "picard",
  "grand frais",
  "biocoop",
  "naturalia",
  "casino",
  "spar ",
  "vival",
  "proxi",
  "coccinelle",
  "g20 ",
  "cora ",
  "match ",
  "boulangerie",
  "patisserie",
  "boucherie",
  "fromagerie",
  "epicerie",
  "primeur",
  "marche ",
  "crous",
  "izly",
  "resto u",
  "mcdonald",
  "mcdo",
  "burger king",
  "kfc",
  "subway",
  "five guys",
  "o'tacos",
  "otacos",
  "kebab",
  "pizza",
  "dominos",
  "sushi",
  "pokawa",
  "poke ",
  "pret a manger",
  "paul ",
  "brioche doree",
  "mie caline",
  "marie blachere",
  "uber eats",
  "ubereats",
  "deliveroo",
  "just eat",
  "too good to go",
  "alimentation",
  "traiteur",
  "superette",
  "restaurant",
  "resto ",
  "cantine",
];

const STORAGE_KEYS = {
  sessionPwd: "cm_dash_session_pwd",
  learnedRules: "cm_ai_learned_rules_v2",
  geminiCache: "cm_ai_gemini_cache_v2",
  gainOverrides: "cm_gain_overrides_v1",
  ghConfig: "cm_dash_gh_cfg_v1",
};

const state = {
  data: null,
  password: "",
  isDemo: false,
  selectedYm: new Date().toISOString().slice(0, 7),
  mobileColFilter: "all",
  learnedRules: loadJsonStorage(STORAGE_KEYS.learnedRules, {}),
  geminiCache: loadJsonStorage(STORAGE_KEYS.geminiCache, {}),
  gainOverrides: loadJsonStorage(STORAGE_KEYS.gainOverrides, {}),
  ghConfig: loadJsonStorage(STORAGE_KEYS.ghConfig, detectDefaultConfig()),
  geminiRunning: false,
  toastTimer: null,
};

const $ = (id) => document.getElementById(id);

function loadJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function saveJsonStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // Ignore storage quota issues
  }
}

function detectDefaultConfig() {
  const hostMatch = window.location.hostname.match(/^([^.]+)\.github\.io$/i);
  return {
    owner: hostMatch ? hostMatch[1] : "Josephdecacqueray",
    syncRepo: "cm-budget-sync",
    pat: "",
    geminiKey: "",
    alertEmail: "joseph@decacqueray.fr",
  };
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatShortDate(isoDate) {
  if (!isoDate) return "";
  const dt = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatMonthTitle(ym) {
  const [y, m] = (ym || "").split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(dt.getTime())) return ym;
  return dt.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function formatRelativeTime(isoString) {
  if (!isoString) return "jamais";
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return isoString;
  const diffMin = Math.round((Date.now() - dt.getTime()) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  return `il y a ${Math.round(diffH / 24)} j`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(text) {
  const stripped = String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9./'&+-]+/g, " ");
  return ` ${stripped.trim().replace(/\s+/g, " ")} `;
}

function extractMerchantKey(label, raw = "") {
  const source = (label || raw || "").trim();
  let norm = normalizeText(source).trim();
  norm = norm
    .replace(/^(cb|carte|paiement|prlv|prelevement|vir|virement|sepa|inst|psc)\s+/i, "")
    .replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, " ")
    .replace(/\bcarte\s+\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return norm || source.toLowerCase();
}

function cleanDisplayLabel(label, raw = "") {
  const src = (label || raw || "Opération").trim();
  return src
    .replace(/^(PAIEMENT\s+PSC|PAIEMENT\s+CB|CB|PRLV\s+SEPA|PRLV|VIR\s+SEPA|VIR\s+INST|VIR)\s+/i, "")
    .replace(/\s+\d{2}\/\d{2}\s+CARTE\s+\d+.*$/i, "")
    .trim() || src;
}

function isFixedSubscription(label, raw, amount) {
  if (amount >= 0) return false;
  const absAmt = Math.round(Math.abs(amount) * 100) / 100;
  const hay = normalizeText(`${label} ${raw}`);
  for (const rule of FIXED_SUB_RULES) {
    if (rule.keywords.some((kw) => hay.includes(kw))) return true;
    if (Math.abs(absAmt - rule.amount) <= 0.05 && [4.0, 5.49, 17.74].includes(rule.amount)) {
      return true;
    }
  }
  return false;
}

function classifyTransaction(tx) {
  if (tx.amount > 0) return BUCKETS.GAIN;

  const mKey = tx.merchant_key || extractMerchantKey(tx.label, tx.raw);

  // 1. User learned rules (highest priority: permanent learning)
  if (state.learnedRules[mKey]) {
    return state.learnedRules[mKey];
  }
  const cloudRules = state.data?.learned_rules || {};
  if (cloudRules[mKey]) {
    return cloudRules[mKey];
  }

  // 2. Cached Gemini Pro result
  if (state.geminiCache[mKey]) {
    return state.geminiCache[mKey];
  }

  // 3. Server-side already classified in one of the 4 buckets
  if ([BUCKETS.ALIMENTAIRE, BUCKETS.BARS, BUCKETS.EXTRAS, BUCKETS.ABONNEMENT].includes(tx.category)) {
    if (tx.category !== BUCKETS.EXTRAS) {
      return tx.category;
    }
  }

  // 4. Fixed subscriptions check (60.23 EUR pack)
  if (isFixedSubscription(tx.label, tx.raw, tx.amount)) {
    return BUCKETS.ABONNEMENT;
  }

  // 5. Smart French keyword & legacy category mapping
  const hay = normalizeText(`${tx.label} ${tx.raw} ${tx.category || ""}`);
  if (BARS_KEYWORDS.some((kw) => hay.includes(kw))) {
    return BUCKETS.BARS;
  }
  if (ALIMENTAIRE_KEYWORDS.some((kw) => hay.includes(kw)) || tx.category === "Alimentation & Courses") {
    return BUCKETS.ALIMENTAIRE;
  }
  return BUCKETS.EXTRAS;
}

function learnTransactionBucket(tx, targetBucket) {
  const mKey = tx.merchant_key || extractMerchantKey(tx.label, tx.raw);
  if (!mKey) return;
  state.learnedRules[mKey] = targetBucket;
  saveJsonStorage(STORAGE_KEYS.learnedRules, state.learnedRules);
  showToast(`« ${cleanDisplayLabel(tx.label)} » classé dans ${BUCKET_LABELS[targetBucket]} · L'IA s'en souviendra`);
  renderDashboard();
}

function showToast(message) {
  const toast = $("ai-toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3200);
}

async function runBrowserGeminiClassification(monthTxs) {
  const apiKey = (state.ghConfig.geminiKey || "").trim();
  if (!apiKey || state.geminiRunning) return;

  const expenses = monthTxs.filter((tx) => {
    if (tx.amount >= 0) return false;
    const mKey = tx.merchant_key || extractMerchantKey(tx.label, tx.raw);
    if (state.learnedRules[mKey] || state.geminiCache[mKey]) return false;
    if (isFixedSubscription(tx.label, tx.raw, tx.amount)) return false;
    return true;
  });

  if (!expenses.length) return;
  state.geminiRunning = true;
  $("ai-badge-text").textContent = "Gemini analyse…";

  try {
    const mergedLearned = { ...(state.data?.learned_rules || {}), ...state.learnedRules };
    const learnedExamples =
      Object.entries(mergedLearned)
        .slice(0, 80)
        .map(([m, b]) => `- ${m} -> ${b}`)
        .join("\n") || "(Aucun exemple personnalisé)";

    const systemInstruction =
      "Tu classes les dépenses du compte courant d'un étudiant en France dans EXACTEMENT l'une de ces 4 catégories :\n" +
      "- 'alimentaire' : courses, supermarchés, boulangeries, repas, fast-food, Uber Eats, Deliveroo, CROUS.\n" +
      "- 'bars' : bars, pubs, cafés de sortie, bières, brasseries, soirées.\n" +
      "- 'extras' : toutes les autres dépenses (shopping, train, loisirs, pharmacie, Amazon, divers).\n" +
      "- 'abonnement' : uniquement Apple Music (4€), Forfait (3€), Google One (5.49€), Vélib (17.74€), Tirelire (10€), Coloc (10€).\n\n" +
      "Exemples appris des corrections de l'utilisateur :\n" +
      learnedExamples;

    const inputItems = expenses.slice(0, 80).map((tx) => ({
      id: tx.id,
      merchant: extractMerchantKey(tx.label, tx.raw),
      label: tx.label,
      amount: Math.abs(tx.amount),
    }));

    const schema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              merchant: { type: "string" },
              category: {
                type: "string",
                enum: [BUCKETS.ALIMENTAIRE, BUCKETS.BARS, BUCKETS.EXTRAS, BUCKETS.ABONNEMENT],
              },
            },
            required: ["merchant", "category"],
          },
        },
      },
      required: ["items"],
    };

    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify({
        model: "gemini-4-hydrogen",
        system_instruction: systemInstruction,
        input: JSON.stringify(inputItems),
        store: false,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema,
        },
      }),
    });

    if (resp.ok) {
      const payload = await resp.json();
      let outputText = payload.output_text;
      if (!outputText && Array.isArray(payload.steps)) {
        for (let i = payload.steps.length - 1; i >= 0; i -= 1) {
          const step = payload.steps[i];
          if (step.type === "model_output" && Array.isArray(step.content)) {
            const part = step.content.find((p) => p.type === "text" && p.text);
            if (part) {
              outputText = part.text;
              break;
            }
          }
        }
      }
      if (outputText) {
        const parsed = JSON.parse(outputText);
        let updated = false;
        for (const item of parsed.items || []) {
          if (item.merchant && BUCKET_LABELS[item.category]) {
            state.geminiCache[item.merchant] = item.category;
            updated = true;
          }
        }
        if (updated) {
          saveJsonStorage(STORAGE_KEYS.geminiCache, state.geminiCache);
          renderDashboard(false);
        }
      }
    }
  } catch {
    // Ignore transient network errors and fall back to local rules
  } finally {
    state.geminiRunning = false;
    updateAiBadge();
  }
}

function updateAiBadge() {
  const learnedCount = Object.keys({ ...(state.data?.learned_rules || {}), ...state.learnedRules }).length;
  $("ai-badge-text").textContent = learnedCount > 0 ? `Gemini · ${learnedCount} appris` : "Gemini Pro";
  $("learned-count-label").textContent = `${learnedCount} commerçant(s) mémorisé(s) par l'IA`;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function decryptEnvelope(envelope, password) {
  if (!envelope || envelope.v !== 1 || envelope.kdf !== "PBKDF2-SHA256") {
    throw new Error("Format chiffré non supporté.");
  }
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(envelope.salt),
      iterations: Number(envelope.iter),
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plainBuf = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    aesKey,
    base64ToBytes(envelope.ct)
  );
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

async function fetchJsonNoCache(url) {
  const sep = url.includes("?") ? "&" : "?";
  const resp = await fetch(`${url}${sep}t=${Date.now()}`, { cache: "no-store" });
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

function getCheckingAccounts() {
  const accounts = state.data?.accounts || [];
  const checking = accounts.filter((a) => a.group === "checking");
  return checking.length ? checking : accounts.slice(0, 1);
}

function getMonthCheckingTransactions(ym) {
  const checkingIds = new Set(getCheckingAccounts().map((a) => a.id));
  const allTxs = state.data?.transactions || [];
  return allTxs.filter((tx) => {
    if (checkingIds.size && !checkingIds.has(tx.account_id)) return false;
    if (tx.is_card_summary) return false;
    return String(tx.date || "").startsWith(ym);
  });
}

function pickInitialMonth() {
  const nowYm = new Date().toISOString().slice(0, 7);
  const currentTxs = getMonthCheckingTransactions(nowYm);
  if (currentTxs.length > 0) return nowYm;
  const checkingIds = new Set(getCheckingAccounts().map((a) => a.id));
  const firstTx = (state.data?.transactions || []).find((t) => !checkingIds.size || checkingIds.has(t.account_id));
  return firstTx && firstTx.date ? firstTx.date.slice(0, 7) : nowYm;
}

function stepMonth(delta) {
  const [y, m] = state.selectedYm.split("-").map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  state.selectedYm = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  renderDashboard();
}

function computeGains(inflowTxs) {
  // Identify which inflow is the 200 EUR base allowance vs extra gains
  let autoBaseId = null;
  for (const tx of inflowTxs) {
    const override = state.gainOverrides[tx.id];
    if (override === "base") {
      autoBaseId = tx.id;
      break;
    }
  }
  if (!autoBaseId) {
    const candidate = inflowTxs.find(
      (tx) => state.gainOverrides[tx.id] !== "extra" && Math.abs(tx.amount - MONTHLY_BASE_ALLOWANCE) <= 5.0
    );
    if (candidate) autoBaseId = candidate.id;
  }

  let extraGains = 0;
  const items = inflowTxs.map((tx) => {
    const isBase = state.gainOverrides[tx.id]
      ? state.gainOverrides[tx.id] === "base"
      : tx.id === autoBaseId;
    if (!isBase) {
      extraGains += tx.amount;
    }
    return { tx, isBase };
  });

  return { extraGains: Math.round(extraGains * 100) / 100, items };
}

function renderExpenseCard(tx, currentBucket) {
  const mKey = tx.merchant_key || extractMerchantKey(tx.label, tx.raw);
  const isLearned = Boolean(state.learnedRules[mKey] || state.data?.learned_rules?.[mKey]);
  const comingTag = tx.coming ? ` · À venir` : "";
  const learnedTag = isLearned ? `<span class="learned-badge" title="Mémorisé par l'IA">✦ Appris</span>` : "";

  const targets = [
    { key: BUCKETS.ALIMENTAIRE, short: "Alim" },
    { key: BUCKETS.BARS, short: "Bars" },
    { key: BUCKETS.EXTRAS, short: "Extras" },
    { key: BUCKETS.ABONNEMENT, short: "Abo" },
  ].filter((t) => t.key !== currentBucket);

  const buttonsHtml = targets
    .map(
      (t) =>
        `<button type="button" class="move-btn" data-tx-id="${escapeHtml(tx.id)}" data-target="${t.key}" title="Déplacer vers ${escapeHtml(BUCKET_LABELS[t.key])}">→ ${t.short}</button>`
    )
    .join("");

  return `
    <li class="expense-item" draggable="true" data-tx-id="${escapeHtml(tx.id)}">
      <div class="expense-row-top">
        <span class="expense-name">${escapeHtml(cleanDisplayLabel(tx.label, tx.raw))}</span>
        <span class="expense-amount">${escapeHtml(formatCurrency(Math.abs(tx.amount)))}</span>
      </div>
      <div class="expense-row-bottom">
        <span class="expense-meta">${escapeHtml(formatShortDate(tx.date))}${comingTag} ${learnedTag}</span>
        <div class="move-pills">${buttonsHtml}</div>
      </div>
    </li>
  `;
}

function renderDashboard(triggerGemini = true) {
  if (!state.data) return;

  updateAiBadge();
  $("current-month-label").textContent = formatMonthTitle(state.selectedYm);
  $("demo-badge").classList.toggle("hidden", !state.isDemo);

  // Sync status
  const sync = state.data.sync || {};
  const dot = $("sync-dot");
  const statusText = $("sync-status-text");
  const alertBanner = $("sync-alert-banner");
  dot.className = "status-dot";
  alertBanner.classList.add("hidden");

  const rel = formatRelativeTime(state.data.last_ok_at || state.data.generated_at);
  if (sync.status === "ok") {
    dot.classList.add("ok");
    statusText.textContent = `Synchro ${rel}`;
  } else if (sync.status === "needs_2fa") {
    dot.classList.add("warn");
    statusText.textContent = "2FA requise";
    alertBanner.classList.remove("hidden");
    $("sync-alert-title").textContent = "Confirmation Mobile Crédit Mutuel requise";
    $("sync-alert-message").textContent = sync.message || "Relance une synchro 2FA pour actualiser la session.";
  } else {
    dot.classList.add("err");
    statusText.textContent = "Erreur synchro";
  }

  $("alert-gh-link").href = `https://github.com/${encodeURIComponent(state.ghConfig.owner)}/${encodeURIComponent(state.ghConfig.syncRepo)}/actions`;
  $("trigger-2fa-btn").classList.toggle("hidden", !state.ghConfig.pat);

  // Checking account balance
  const checkingAccs = getCheckingAccounts();
  const bankBalance = checkingAccs.reduce((s, a) => s + (a.balance || 0), 0);
  $("bank-balance-pill").textContent = `Solde Compte Courant : ${formatCurrency(bankBalance)}`;

  // Filter current month checking transactions
  const monthTxs = getMonthCheckingTransactions(state.selectedYm);
  const txById = new Map(monthTxs.map((t) => [t.id, t]));

  const buckets = {
    alimentaire: [],
    bars: [],
    extras: [],
    abonnement: [],
    gain: [],
  };

  for (const tx of monthTxs) {
    const b = classifyTransaction(tx);
    buckets[b].push(tx);
  }

  const sumAbs = (arr) => Math.round(arr.reduce((s, t) => s + Math.abs(t.amount || 0), 0) * 100) / 100;
  const totalAlim = sumAbs(buckets.alimentaire);
  const totalBars = sumAbs(buckets.bars);
  const totalExtras = sumAbs(buckets.extras);
  const totalVariable = Math.round((totalAlim + totalBars + totalExtras) * 100) / 100;

  const { extraGains, items: gainItems } = computeGains(buckets.gain);

  // SECTION 1 : Reste sans les abonnements et les dépenses
  // 200 € - 60.23 € (abonnements fixes) - dépenses du mois + gains supplémentaires
  const resteSansAbonnements = Math.round((MONTHLY_BASE_ALLOWANCE - FIXED_CHARGES_TOTAL + extraGains - totalVariable) * 100) / 100;
  const elReste1 = $("val-reste-principal");
  elReste1.textContent = formatCurrency(resteSansAbonnements);
  elReste1.className = `hero-amount ${resteSansAbonnements >= 0 ? "positive-val" : "negative-val"}`;

  const gainPart = extraGains > 0 ? ` + ${formatCurrency(extraGains)} de gains` : "";
  $("sub-reste-principal").textContent = `200,00 € − 60,23 € d'abonnements − ${formatCurrency(totalVariable)} dépensés${gainPart}`;

  // SECTION 2 : Ce qu'il reste moins 100 € (budget nourriture prévu)
  const resteMoins100 = Math.round((resteSansAbonnements - FOOD_PROVISION) * 100) / 100;
  const foodEnvelopeLeft = Math.round(Math.max(0, FOOD_PROVISION - totalAlim) * 100) / 100;
  const libreHorsNourriture = Math.round((MONTHLY_BASE_ALLOWANCE - FIXED_CHARGES_TOTAL - FOOD_PROVISION + extraGains - totalBars - totalExtras - Math.max(0, totalAlim - FOOD_PROVISION)) * 100) / 100;

  const elReste2 = $("val-reste-moins-100");
  elReste2.textContent = formatCurrency(resteMoins100);
  elReste2.className = `hero-amount secondary-amount ${resteMoins100 >= 0 ? "positive-val" : "negative-val"}`;
  $("sub-reste-moins-100").textContent = `Reste libre hors les 100 € de nourriture : ${formatCurrency(libreHorsNourriture)}`;

  $("val-food-envelope-left").textContent = `${formatCurrency(foodEnvelopeLeft)} restants sur 100 €`;
  const foodPct = Math.min(100, Math.round((totalAlim / FOOD_PROVISION) * 100));
  const barEl = $("food-progress-bar");
  barEl.style.width = `${foodPct}%`;
  barEl.classList.toggle("over", totalAlim > FOOD_PROVISION);

  // Mid-month status (15th of the month rules: Alimentaire <= 50 €, Extras <= 25 €)
  const alimMidOk = totalAlim <= MID_MONTH_LIMIT_ALIM;
  const extrasMidOk = totalExtras <= MID_MONTH_LIMIT_EXTRAS;
  const midAllOk = alimMidOk && extrasMidOk;

  $("midmonth-dot").className = `status-dot ${midAllOk ? "ok" : "warn"}`;
  $("midmonth-title").textContent = midAllOk
    ? "Bilan mi-mois : Tu es bon niveau dépenses !"
    : "Bilan mi-mois : Seuil de moitié de mois dépassé";
  $("midmonth-desc").textContent = `Alimentaire : ${formatCurrency(totalAlim)} / 50 € · Extras : ${formatCurrency(totalExtras)} / 25 €`;

  const tagAlim = $("tag-limit-alim");
  tagAlim.textContent = `${formatCurrency(totalAlim)} / 50 € mi-mois`;
  tagAlim.className = `col-limit-tag ${alimMidOk ? "" : "over"}`;

  const tagExtras = $("tag-limit-extras");
  tagExtras.textContent = `${formatCurrency(totalExtras)} / 25 € mi-mois`;
  tagExtras.className = `col-limit-tag ${extrasMidOk ? "" : "over"}`;

  // Gains strip
  const gainsCard = $("gains-card");
  if (gainItems.length > 0) {
    gainsCard.classList.remove("hidden");
    $("gains-list").innerHTML = gainItems
      .map(
        ({ tx, isBase }) => `
        <button type="button" class="gain-pill ${isBase ? "is-base" : ""}" data-gain-id="${escapeHtml(tx.id)}">
          <span>+${escapeHtml(formatCurrency(tx.amount))} · ${escapeHtml(cleanDisplayLabel(tx.label))}</span>
          <span>(${isBase ? "200 € parents" : "+ Gain ajouté"})</span>
        </button>
      `
      )
      .join("");
    $("gains-list").querySelectorAll("[data-gain-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-gain-id");
        const currentIsBase = btn.classList.contains("is-base");
        state.gainOverrides[id] = currentIsBase ? "extra" : "base";
        saveJsonStorage(STORAGE_KEYS.gainOverrides, state.gainOverrides);
        renderDashboard(false);
      });
    });
  } else {
    gainsCard.classList.add("hidden");
  }

  // Render the 3 columns
  $("total-alimentaire").textContent = formatCurrency(totalAlim);
  $("total-bars").textContent = formatCurrency(totalBars);
  $("total-extras").textContent = formatCurrency(totalExtras);

  const renderColList = (listId, arr, bucketKey) => {
    const ul = $(listId);
    if (!arr.length) {
      ul.innerHTML = `<li class="empty-col">Aucune dépense ce mois-ci</li>`;
      return;
    }
    ul.innerHTML = arr.map((tx) => renderExpenseCard(tx, bucketKey)).join("");
  };

  renderColList("list-alimentaire", buckets.alimentaire, BUCKETS.ALIMENTAIRE);
  renderColList("list-bars", buckets.bars, BUCKETS.BARS);
  renderColList("list-extras", buckets.extras, BUCKETS.EXTRAS);

  // Mobile column visibility filter
  [BUCKETS.ALIMENTAIRE, BUCKETS.BARS, BUCKETS.EXTRAS].forEach((b) => {
    const colEl = $(`col-${b}`);
    const hideOnMobile = state.mobileColFilter !== "all" && state.mobileColFilter !== b;
    colEl.classList.toggle("hidden", hideOnMobile);
  });

  // Wire move buttons & drag-and-drop
  document.querySelectorAll(".move-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tx = txById.get(btn.getAttribute("data-tx-id"));
      const target = btn.getAttribute("data-target");
      if (tx && target) {
        learnTransactionBucket(tx, target);
      }
    });
  });

  document.querySelectorAll(".expense-item[draggable='true']").forEach((li) => {
    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", li.getAttribute("data-tx-id"));
      e.dataTransfer.effectAllowed = "move";
    });
  });

  // Detected fixed subscriptions drawer
  const subsSection = $("detected-subs-section");
  if (buckets.abonnement.length > 0) {
    subsSection.classList.remove("hidden");
    $("detected-subs-label").textContent = `Abonnements fixes détectés sur le compte et déjà inclus dans les 60,23 € (${buckets.abonnement.length})`;
    $("detected-subs-list").innerHTML = buckets.abonnement
      .map(
        (tx) => `
        <div class="detected-sub-pill">
          <span>${escapeHtml(cleanDisplayLabel(tx.label))} · <strong>${escapeHtml(formatCurrency(Math.abs(tx.amount)))}</strong></span>
          <button type="button" class="move-btn" data-sub-tx-id="${escapeHtml(tx.id)}" data-target="extras">Remettre dans Extras</button>
        </div>
      `
      )
      .join("");
    $("detected-subs-list").querySelectorAll("[data-sub-tx-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tx = txById.get(btn.getAttribute("data-sub-tx-id"));
        if (tx) learnTransactionBucket(tx, BUCKETS.EXTRAS);
      });
    });
  } else {
    subsSection.classList.add("hidden");
  }

  if (triggerGemini) {
    runBrowserGeminiClassification(monthTxs);
  }
}

function sendMidMonthMailto() {
  const monthTxs = getMonthCheckingTransactions(state.selectedYm);
  let alim = 0;
  let bars = 0;
  let extras = 0;
  const inflows = [];

  for (const tx of monthTxs) {
    const b = classifyTransaction(tx);
    if (b === BUCKETS.ALIMENTAIRE) alim += Math.abs(tx.amount);
    else if (b === BUCKETS.BARS) bars += Math.abs(tx.amount);
    else if (b === BUCKETS.EXTRAS) extras += Math.abs(tx.amount);
    else if (b === BUCKETS.GAIN) inflows.push(tx);
  }

  const { extraGains } = computeGains(inflows);
  const reste1 = MONTHLY_BASE_ALLOWANCE - FIXED_CHARGES_TOTAL + extraGains - (alim + bars + extras);
  const reste2 = reste1 - FOOD_PROVISION;
  const alimOk = alim <= MID_MONTH_LIMIT_ALIM;
  const extrasOk = extras <= MID_MONTH_LIMIT_EXTRAS;
  const allOk = alimOk && extrasOk;

  let recipient = (state.ghConfig.alertEmail || "joseph@decacqueray.fr").trim();
  if (recipient.includes("@") && !recipient.split("@")[1].includes(".")) {
    recipient = `${recipient}.fr`;
  }

  const subject = `${allOk ? "✅ Tu es bon" : "⚠️ Seuil dépassé"} — Bilan mi-mois (${formatMonthTitle(state.selectedYm)})`;
  const body =
    `Salut Joseph,\n\n` +
    `Voici ton point dépenses de moitié de mois (${formatMonthTitle(state.selectedYm)}) :\n\n` +
    `• Dépenses alimentaires : ${formatCurrency(alim)} / 50,00 € -> ${alimOk ? "OK" : "DÉPASSÉ"}\n` +
    `• Extras : ${formatCurrency(extras)} / 25,00 € -> ${extrasOk ? "OK" : "DÉPASSÉ"}\n` +
    `• Bars : ${formatCurrency(bars)}\n\n` +
    `• Reste sans les abonnements et les dépenses : ${formatCurrency(reste1)}\n` +
    `• Ce qu'il reste moins 100 € (nourriture prévue) : ${formatCurrency(reste2)}\n`;

  window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildDemoData() {
  const ym = new Date().toISOString().slice(0, 7);
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    last_ok_at: new Date().toISOString(),
    sync: { status: "ok", needs_2fa: false, auth_error: false, message: "Mode démo" },
    accounts: [
      {
        id: "demo-cc",
        label: "Compte Courant",
        group: "checking",
        type_label: "Compte courant",
        balance: 312.4,
        currency: "EUR",
      },
    ],
    transactions: [
      { id: "d1", account_id: "demo-cc", date: `${ym}-02`, label: "VIR PARENTS MENSUEL", raw: "VIR PARENTS", amount: 200.0, coming: false, category: "gain" },
      { id: "d2", account_id: "demo-cc", date: `${ym}-03`, label: "CB APPLE.COM/BILL", raw: "APPLE.COM/BILL", amount: -4.0, coming: false, category: "abonnement" },
      { id: "d3", account_id: "demo-cc", date: `${ym}-04`, label: "PRLV VELIB METROPOLE", raw: "VELIB", amount: -17.74, coming: false, category: "abonnement" },
      { id: "d4", account_id: "demo-cc", date: `${ym}-06`, label: "CB CARREFOUR CITY", raw: "CARREFOUR CITY", amount: -18.4, coming: false, category: "alimentaire" },
      { id: "d5", account_id: "demo-cc", date: `${ym}-08`, label: "CB BOULANGERIE PAUL", raw: "PAUL", amount: -6.5, coming: false, category: "alimentaire" },
      { id: "d6", account_id: "demo-cc", date: `${ym}-10`, label: "CB LE COMPTOIR DU BAR", raw: "LE COMPTOIR DU BAR", amount: -14.0, coming: false, category: "bars" },
      { id: "d7", account_id: "demo-cc", date: `${ym}-12`, label: "CB FNAC PARIS", raw: "FNAC", amount: -15.9, coming: false, category: "extras" },
    ],
  };
}

async function unlockWithPassword(password) {
  const envelope = await fetchJsonNoCache("./data.enc");
  const data = await decryptEnvelope(envelope, password);
  state.data = data;
  state.password = password;
  state.isDemo = false;
  state.selectedYm = pickInitialMonth();

  if ($("remember-session").checked) {
    sessionStorage.setItem(STORAGE_KEYS.sessionPwd, password);
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.sessionPwd);
  }

  $("lock-screen").classList.add("hidden");
  $("dashboard-screen").classList.remove("hidden");
  renderDashboard();
}

function openDemoMode() {
  state.data = buildDemoData();
  state.isDemo = true;
  state.selectedYm = new Date().toISOString().slice(0, 7);
  $("lock-screen").classList.add("hidden");
  $("dashboard-screen").classList.remove("hidden");
  renderDashboard();
}

function lockDashboard() {
  state.data = null;
  state.password = "";
  state.isDemo = false;
  sessionStorage.removeItem(STORAGE_KEYS.sessionPwd);
  $("unlock-password").value = "";
  $("unlock-error").classList.add("hidden");
  $("dashboard-screen").classList.add("hidden");
  $("lock-screen").classList.remove("hidden");
}

async function triggerCloudSync(mode = "schedule") {
  const { owner, syncRepo, pat } = state.ghConfig;
  if (!pat) return false;
  const resp = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(syncRepo)}/actions/workflows/sync.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          mode,
          learned_rules_json: JSON.stringify(state.learnedRules),
        },
      }),
    }
  );
  if (!resp.ok) {
    throw new Error(`GitHub Actions HTTP ${resp.status}`);
  }
  return true;
}

async function handleRefreshClick() {
  if (state.isDemo) {
    openDemoMode();
    return;
  }
  const btn = $("refresh-btn");
  btn.disabled = true;
  try {
    if (state.ghConfig.pat) {
      showToast("Synchronisation cloud lancée…");
      await triggerCloudSync("schedule");
    }
    const envelope = await fetchJsonNoCache("./data.enc");
    state.data = await decryptEnvelope(envelope, state.password);
    renderDashboard();
    showToast("Comptes actualisés");
  } catch (err) {
    showToast(`Erreur : ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function initApp() {
  try {
    const meta = await fetchJsonNoCache("./meta.json");
    $("lock-meta-pill").classList.remove("hidden");
    $("lock-meta-dot").className = `status-dot ${meta.status === "ok" ? "ok" : meta.status === "needs_2fa" ? "warn" : "err"}`;
    $("lock-meta-text").textContent = `Synchro ${formatRelativeTime(meta.last_ok_at || meta.updated_at)}`;
  } catch {
    // Ignore meta check error
  }

  const cachedPwd = sessionStorage.getItem(STORAGE_KEYS.sessionPwd);
  if (cachedPwd) {
    try {
      await unlockWithPassword(cachedPwd);
    } catch {
      sessionStorage.removeItem(STORAGE_KEYS.sessionPwd);
    }
  }

  $("toggle-pwd-btn").addEventListener("click", () => {
    const inp = $("unlock-password");
    inp.type = inp.type === "password" ? "text" : "password";
  });

  $("unlock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("unlock-error");
    const submitBtn = $("unlock-submit");
    errEl.classList.add("hidden");
    submitBtn.disabled = true;
    submitBtn.textContent = "Déchiffrement…";
    try {
      await unlockWithPassword($("unlock-password").value);
    } catch {
      errEl.textContent = "Mot de passe incorrect.";
      errEl.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Déverrouiller";
    }
  });

  $("demo-fallback-btn").addEventListener("click", openDemoMode);
  $("lock-btn").addEventListener("click", lockDashboard);
  $("mac-close-dot")?.addEventListener("click", lockDashboard);
  $("refresh-btn").addEventListener("click", handleRefreshClick);
  $("prev-month-btn").addEventListener("click", () => stepMonth(-1));
  $("next-month-btn").addEventListener("click", () => stepMonth(1));

  $("toggle-subs-btn").addEventListener("click", () => {
    const drawer = $("subs-drawer");
    drawer.classList.toggle("hidden");
    $("subs-chevron").textContent = drawer.classList.contains("hidden") ? "▾" : "▴";
  });

  $("toggle-detected-subs").addEventListener("click", () => {
    $("detected-subs-list").classList.toggle("hidden");
  });

  $("send-midmonth-mail-btn").addEventListener("click", sendMidMonthMailto);

  // iOS 27 segmented control
  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.mobileColFilter = btn.getAttribute("data-col-filter") || "all";
      renderDashboard(false);
    });
  });

  // macOS 27 Drag-and-drop onto columns
  document.querySelectorAll(".expense-column").forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => {
      col.classList.remove("drag-over");
    });
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const txId = e.dataTransfer.getData("text/plain");
      const targetBucket = col.getAttribute("data-bucket");
      const monthTxs = getMonthCheckingTransactions(state.selectedYm);
      const tx = monthTxs.find((t) => t.id === txId);
      if (tx && targetBucket) {
        learnTransactionBucket(tx, targetBucket);
      }
    });
  });

  // Settings Modal
  const dlg = $("settings-dialog");
  $("ai-status-btn").addEventListener("click", () => {
    $("cfg-gemini-key").value = state.ghConfig.geminiKey || "";
    $("cfg-alert-email").value = state.ghConfig.alertEmail || "joseph@decacqueray.fr";
    $("cfg-gh-pat").value = state.ghConfig.pat || "";
    $("cfg-owner").value = state.ghConfig.owner || "Josephdecacqueray";
    $("cfg-sync-repo").value = state.ghConfig.syncRepo || "cm-budget-sync";
    updateAiBadge();
    dlg.showModal();
  });

  $("close-settings-btn").addEventListener("click", () => dlg.close());

  $("reclassify-gemini-btn").addEventListener("click", async () => {
    state.geminiCache = {};
    saveJsonStorage(STORAGE_KEYS.geminiCache, {});
    state.ghConfig.geminiKey = $("cfg-gemini-key").value.trim();
    saveJsonStorage(STORAGE_KEYS.ghConfig, state.ghConfig);
    await runBrowserGeminiClassification(getMonthCheckingTransactions(state.selectedYm));
    showToast("Analyse Gemini Pro mise à jour");
  });

  $("reset-memory-btn").addEventListener("click", () => {
    state.learnedRules = {};
    state.geminiCache = {};
    saveJsonStorage(STORAGE_KEYS.learnedRules, {});
    saveJsonStorage(STORAGE_KEYS.geminiCache, {});
    updateAiBadge();
    renderDashboard(false);
    showToast("Mémoire de l'IA réinitialisée");
  });

  $("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.ghConfig = {
      ...state.ghConfig,
      geminiKey: $("cfg-gemini-key").value.trim(),
      alertEmail: $("cfg-alert-email").value.trim() || "joseph@decacqueray.fr",
      pat: $("cfg-gh-pat").value.trim(),
    };
    saveJsonStorage(STORAGE_KEYS.ghConfig, state.ghConfig);
    dlg.close();
    renderDashboard(true);
  });
}

initApp();
