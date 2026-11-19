"use strict";

const CATEGORIES = [
  "Salaire & Revenus Pro",
  "Aides & Remboursements",
  "Intérêts & Dividendes",
  "Virements reçus",
  "Autres gains",
  "Logement & Charges",
  "Alimentation & Courses",
  "Restaurants & Cafés",
  "Transports & Auto",
  "Télécoms & Abonnements",
  "Santé",
  "Impôts & Administration",
  "Banque & Assurances",
  "Shopping & Loisirs",
  "Retraits DAB",
  "Épargne & Investissements",
  "Virements émis",
  "Autres dépenses",
];

const PALETTE = [
  "#38bdf8",
  "#fb7185",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#f472b6",
  "#22d3ee",
  "#fb923c",
  "#60a5fa",
  "#94a3b8",
];

const STORAGE_KEYS = {
  sessionPwd: "cm_dash_session_pwd",
  catOverrides: "cm_dash_cat_overrides_v1",
  ghConfig: "cm_dash_gh_cfg_v1",
};

const state = {
  data: null,
  password: "",
  isDemo: false,
  selectedAccountId: "all",
  pageSize: 80,
  visibleCount: 80,
  catOverrides: loadJsonStorage(STORAGE_KEYS.catOverrides, {}),
  ghConfig: loadJsonStorage(STORAGE_KEYS.ghConfig, detectDefaultGhConfig()),
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

function detectDefaultGhConfig() {
  const hostMatch = window.location.hostname.match(/^([^.]+)\.github\.io$/i);
  return {
    owner: hostMatch ? hostMatch[1] : "Josephdecacqueray",
    syncRepo: "cm-budget-sync",
    pat: "",
  };
}

function formatCurrency(amount, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatRelativeTime(isoString) {
  if (!isoString) return "jamais";
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return isoString;
  const diffSec = Math.round((Date.now() - dt.getTime()) / 1000);
  if (diffSec < 60) return "à l'instant";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `il y a ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `il y a ${diffDays} j`;
}

function formatDateFr(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
    throw new Error("Format de fichier chiffré non pris en charge.");
  }
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
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
    {
      name: "AES-GCM",
      iv: base64ToBytes(envelope.iv),
    },
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

function buildDemoData() {
  const now = new Date();
  const ym = (offsetMonths) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const isoDay = (offsetMonths, day) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offsetMonths, Math.min(day, 28));
    return d.toISOString().slice(0, 10);
  };

  const accounts = [
    {
      id: "demo-checking",
      label: "Compte Courant Eurocompte",
      number: "00012345601",
      masked_iban: "FR76 •••• 4821",
      group: "checking",
      type_label: "Compte courant",
      balance: 2845.6,
      coming: -142.3,
      currency: "EUR",
    },
    {
      id: "demo-livret",
      label: "Livret A",
      number: "00012345602",
      masked_iban: "FR76 •••• 9104",
      group: "savings",
      type_label: "Livret A",
      balance: 8420.0,
      coming: null,
      currency: "EUR",
    },
    {
      id: "demo-ldds",
      label: "Livret Développement Durable",
      number: "00012345603",
      masked_iban: "FR76 •••• 3319",
      group: "savings",
      type_label: "LDDS",
      balance: 3150.0,
      coming: null,
      currency: "EUR",
    },
  ];

  const txs = [];
  let seq = 1;
  const addTx = (accId, d, label, amount, category, coming = false, type = "card") => {
    txs.push({
      id: `demo-${seq++}`,
      account_id: accId,
      date: d,
      accounting_date: d,
      label,
      raw: label,
      amount,
      type,
      is_card_summary: false,
      coming,
      category,
    });
  };

  for (let m = 0; m < 6; m += 1) {
    addTx("demo-checking", isoDay(m, 2), "VIR SALAIRE ENTREPRISE SAS", 2650.0, "Salaire & Revenus Pro", false, "transfer");
    addTx("demo-checking", isoDay(m, 4), "PRLV LOYER RESIDENCE", -820.0, "Logement & Charges", false, "order");
    addTx("demo-checking", isoDay(m, 6), "CB CARREFOUR MARKET", -(94.2 + m * 6), "Alimentation & Courses");
    addTx("demo-checking", isoDay(m, 9), "PRLV EDF ELECTRICITE", -68.5, "Logement & Charges", false, "order");
    addTx("demo-checking", isoDay(m, 11), "CB SNCF CONNECT", -(52.0 + m * 4), "Transports & Auto");
    addTx("demo-checking", isoDay(m, 14), "CB BRASSERIE DU CENTRE", -(38.5 + (m % 3) * 9), "Restaurants & Cafés");
    addTx("demo-checking", isoDay(m, 16), "PRLV ORANGE FIBRE", -34.99, "Télécoms & Abonnements", false, "order");
    addTx("demo-checking", isoDay(m, 19), "CB PHARMACIE CENTRALE", -26.4, "Santé");
    addTx("demo-checking", isoDay(m, 22), "CB LECLERC COURSES", -(118.4 + m * 5), "Alimentation & Courses");
    addTx("demo-checking", isoDay(m, 24), "CB DECATHLON", -(45.0 + (m % 2) * 35), "Shopping & Loisirs");
    if (m % 2 === 0) {
      addTx("demo-checking", isoDay(m, 15), "VIR REMBOURSEMENT MUTUELLE", 64.5, "Aides & Remboursements", false, "payback");
    }
    addTx("demo-livret", isoDay(m, 5), "VIR EPARGNE MENSUELLE", 250.0, "Virements reçus", false, "transfer");
  }

  addTx("demo-checking", `${ym(0)}-${String(Math.min(now.getDate(), 28)).padStart(2, "0")}`, "CB BOULANGERIE ARTISANALE", -8.9, "Alimentation & Courses", true);
  addTx("demo-checking", `${ym(0)}-${String(Math.min(now.getDate(), 28)).padStart(2, "0")}`, "CB AMAZON EU SARL", -49.9, "Shopping & Loisirs", true);

  txs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    last_ok_at: now.toISOString(),
    sync: {
      status: "ok",
      needs_2fa: false,
      auth_error: false,
      message: "Mode démonstration actif (données fictives)",
    },
    accounts,
    transactions: txs,
  };
}

function getEffectiveCategory(tx) {
  const key = (tx.raw || tx.label || "").trim().toUpperCase();
  return state.catOverrides[key] || tx.category || (tx.amount > 0 ? "Autres gains" : "Autres dépenses");
}

function setCategoryOverride(tx, newCat) {
  const key = (tx.raw || tx.label || "").trim().toUpperCase();
  if (!key) return;
  state.catOverrides[key] = newCat;
  try {
    localStorage.setItem(STORAGE_KEYS.catOverrides, JSON.stringify(state.catOverrides));
  } catch {
    // Ignore quota errors
  }
}

function isInternalTransfer(tx) {
  const cat = getEffectiveCategory(tx);
  const label = `${tx.label || ""} ${tx.raw || ""}`.toLowerCase();
  return (
    cat === "Virements internes" ||
    cat === "Épargne & Investissements" ||
    label.includes("virement interne") ||
    label.includes("vir interne") ||
    label.includes("epargne mensuelle")
  );
}

function getPeriodCutoff(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "this_month") {
    return {
      start: `${y}-${String(m + 1).padStart(2, "0")}-01`,
      end: "9999-12-31",
      label: "ce mois-ci",
    };
  }
  if (period === "last_month") {
    const startDt = new Date(y, m - 1, 1);
    const endDt = new Date(y, m, 0);
    return {
      start: startDt.toISOString().slice(0, 10),
      end: endDt.toISOString().slice(0, 10),
      label: "mois dernier",
    };
  }
  if (period === "3m") {
    const dt = new Date(y, m - 2, 1);
    return { start: dt.toISOString().slice(0, 10), end: "9999-12-31", label: "3 mois" };
  }
  if (period === "12m") {
    const dt = new Date(y, m - 11, 1);
    return { start: dt.toISOString().slice(0, 10), end: "9999-12-31", label: "12 mois" };
  }
  return { start: "0000-01-01", end: "9999-12-31", label: "tout" };
}

function getFilteredTransactions({ ignoreFlowFilter = false, ignoreCategoryFilter = false } = {}) {
  const txs = state.data?.transactions || [];
  const search = ($("filter-search").value || "").trim().toLowerCase();
  const period = $("filter-period").value;
  const flow = $("filter-flow").value;
  const catFilter = $("filter-category").value;
  const includeComing = $("toggle-coming").checked;
  const excludeSummary = $("toggle-exclude-summary").checked;
  const excludeInternal = $("toggle-exclude-internal").checked;
  const { start, end } = getPeriodCutoff(period);

  return txs.filter((tx) => {
    if (state.selectedAccountId !== "all" && tx.account_id !== state.selectedAccountId) return false;
    if (!includeComing && tx.coming) return false;
    if (excludeSummary && tx.is_card_summary) return false;
    if (excludeInternal && isInternalTransfer(tx)) return false;
    if (tx.date < start || tx.date > end) return false;

    const effCat = getEffectiveCategory(tx);
    if (!ignoreCategoryFilter && catFilter !== "all" && effCat !== catFilter) return false;

    if (!ignoreFlowFilter) {
      if (flow === "expense" && tx.amount >= 0) return false;
      if (flow === "income" && tx.amount <= 0) return false;
      if (flow === "coming" && !tx.coming) return false;
    }

    if (search) {
      const hay = `${tx.label} ${tx.raw} ${effCat} ${tx.amount}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function renderSyncStatus() {
  const data = state.data;
  const sync = data.sync || {};
  const dot = $("sync-dot");
  const text = $("sync-status-text");
  const banner = $("sync-alert-banner");
  const alertTitle = $("sync-alert-title");
  const alertMsg = $("sync-alert-message");
  const alertLink = $("alert-gh-link");
  const trigger2faBtn = $("trigger-2fa-btn");

  const actionsUrl = `https://github.com/${encodeURIComponent(state.ghConfig.owner)}/${encodeURIComponent(state.ghConfig.syncRepo)}/actions`;
  alertLink.href = actionsUrl;

  dot.className = "dot";
  banner.classList.add("hidden");
  banner.classList.remove("error");
  trigger2faBtn.classList.toggle("hidden", !state.ghConfig.pat);

  const rel = formatRelativeTime(data.last_ok_at || data.generated_at);
  if (sync.status === "ok") {
    dot.classList.add("ok");
    text.textContent = `Dernière synchro réussie : ${rel}`;
  } else if (sync.status === "needs_2fa") {
    dot.classList.add("warn");
    text.textContent = `Validation 2FA requise • Dernières données : ${rel}`;
    banner.classList.remove("hidden");
    alertTitle.textContent = "Validation mobile Crédit Mutuel requise (2FA)";
    alertMsg.textContent = sync.message || "Lance le workflow en mode interactive_2fa et confirme sur ton téléphone.";
  } else if (sync.status === "auth_error" || sync.status === "error") {
    dot.classList.add("err");
    text.textContent = `Erreur de synchro • Dernières données : ${rel}`;
    banner.classList.remove("hidden");
    banner.classList.add("error");
    alertTitle.textContent = sync.status === "auth_error" ? "Erreur d'identifiants" : "Erreur de synchronisation";
    alertMsg.textContent = sync.message || "Vérifie le workflow GitHub Actions.";
  } else {
    text.textContent = `Statut : ${sync.status || "inconnu"} (${rel})`;
  }

  $("demo-badge").classList.toggle("hidden", !state.isDemo);
}

function renderKPIs(periodTxs) {
  const accounts = state.data.accounts || [];
  let checkingTotal = 0;
  let savingsTotal = 0;
  let comingTotal = 0;
  let hasComing = false;

  for (const acc of accounts) {
    if (acc.group === "checking") {
      checkingTotal += acc.balance || 0;
    } else if (acc.group === "savings" || acc.group === "investment") {
      savingsTotal += acc.balance || 0;
    }
    if (typeof acc.coming === "number") {
      comingTotal += acc.coming;
      hasComing = true;
    }
  }

  const pendingTxsSum = (state.data.transactions || [])
    .filter((t) => t.coming)
    .reduce((sum, t) => sum + (t.amount || 0), 0);
  const displayComing = hasComing ? comingTotal : pendingTxsSum;

  let income = 0;
  let incomeCount = 0;
  let expense = 0;
  let expenseCount = 0;

  for (const tx of periodTxs) {
    if (tx.amount > 0) {
      income += tx.amount;
      incomeCount += 1;
    } else if (tx.amount < 0) {
      expense += Math.abs(tx.amount);
      expenseCount += 1;
    }
  }

  const net = income - expense;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  const periodInfo = getPeriodCutoff($("filter-period").value);

  $("kpi-checking").textContent = formatCurrency(checkingTotal);
  $("kpi-coming").textContent = displayComing !== 0
    ? `À venir : ${formatCurrency(displayComing)}`
    : "Aucune opération à venir";

  $("kpi-savings").textContent = formatCurrency(savingsTotal);
  $("kpi-patrimony").textContent = `Patrimoine liquide : ${formatCurrency(checkingTotal + savingsTotal)}`;

  $("kpi-income-label").textContent = `Gains (${periodInfo.label})`;
  $("kpi-income").textContent = `+${formatCurrency(income)}`;
  $("kpi-income-count").textContent = `${incomeCount} entrée(s)`;

  $("kpi-expense-label").textContent = `Dépenses (${periodInfo.label})`;
  $("kpi-expense").textContent = `-${formatCurrency(expense)}`;
  $("kpi-expense-count").textContent = `${expenseCount} sortie(s)`;

  const netEl = $("kpi-net");
  netEl.textContent = `${net >= 0 ? "+" : ""}${formatCurrency(net)}`;
  netEl.className = `kpi-value ${net >= 0 ? "positive" : "negative"}`;
  $("kpi-savings-rate").textContent = income > 0
    ? `Taux d'épargne : ${savingsRate} %`
    : "Taux d'épargne : —";
}

function renderAccounts() {
  const grid = $("accounts-grid");
  const accounts = state.data.accounts || [];
  $("clear-account-filter").classList.toggle("hidden", state.selectedAccountId === "all");

  if (!accounts.length) {
    grid.innerHTML = `<p class="muted-small">Aucun compte synchronisé pour le moment.</p>`;
    return;
  }

  grid.innerHTML = accounts
    .map((acc) => {
      const activeClass = state.selectedAccountId === acc.id ? "active" : "";
      const comingHtml =
        typeof acc.coming === "number" && acc.coming !== 0
          ? `<div class="account-coming">À venir : ${escapeHtml(formatCurrency(acc.coming, acc.currency))}</div>`
          : "";
      return `
        <button type="button" class="account-card ${activeClass}" data-account-id="${escapeHtml(acc.id)}">
          <div class="account-top">
            <span class="account-type">${escapeHtml(acc.type_label || acc.group)}</span>
            <span class="account-iban">${escapeHtml(acc.masked_iban || acc.number || "")}</span>
          </div>
          <div class="account-name" title="${escapeHtml(acc.label)}">${escapeHtml(acc.label)}</div>
          <div class="account-balance">${escapeHtml(formatCurrency(acc.balance, acc.currency))}</div>
          ${comingHtml}
        </button>
      `;
    })
    .join("");

  grid.querySelectorAll(".account-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-account-id");
      state.selectedAccountId = state.selectedAccountId === id ? "all" : id;
      state.visibleCount = state.pageSize;
      renderDashboard();
    });
  });
}

function renderMonthlyChart() {
  const container = $("monthly-chart");
  const txs = (state.data.transactions || []).filter((tx) => {
    if (state.selectedAccountId !== "all" && tx.account_id !== state.selectedAccountId) return false;
    if ($("toggle-exclude-summary").checked && tx.is_card_summary) return false;
    if ($("toggle-exclude-internal").checked && isInternalTransfer(tx)) return false;
    if (!$("toggle-coming").checked && tx.coming) return false;
    return true;
  });

  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("fr-FR", { month: "short" });
    months.push({ key, label, income: 0, expense: 0 });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));

  for (const tx of txs) {
    const k = (tx.date || "").slice(0, 7);
    const bucket = byKey.get(k);
    if (!bucket) continue;
    if (tx.amount > 0) bucket.income += tx.amount;
    else if (tx.amount < 0) bucket.expense += Math.abs(tx.amount);
  }

  const maxVal = Math.max(100, ...months.flatMap((m) => [m.income, m.expense]));
  const w = 560;
  const h = 230;
  const padL = 52;
  const padR = 14;
  const padT = 18;
  const padB = 34;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const groupW = plotW / months.length;
  const barW = Math.min(26, groupW * 0.28);

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = padT + plotH * (1 - ratio);
      const val = Math.round(maxVal * ratio);
      return `
        <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="rgba(148,163,184,0.14)" stroke-dasharray="3 3" />
        <text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="10">${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}</text>
      `;
    })
    .join("");

  const bars = months
    .map((m, idx) => {
      const cx = padL + groupW * idx + groupW / 2;
      const hInc = (m.income / maxVal) * plotH;
      const hExp = (m.expense / maxVal) * plotH;
      const yInc = padT + plotH - hInc;
      const yExp = padT + plotH - hExp;
      return `
        <g>
          <rect x="${cx - barW - 2}" y="${yInc}" width="${barW}" height="${Math.max(2, hInc)}" rx="4" fill="#10b981">
            <title>${escapeHtml(m.label)} — Gains : ${escapeHtml(formatCurrency(m.income))}</title>
          </rect>
          <rect x="${cx + 2}" y="${yExp}" width="${barW}" height="${Math.max(2, hExp)}" rx="4" fill="#fb7185">
            <title>${escapeHtml(m.label)} — Dépenses : ${escapeHtml(formatCurrency(m.expense))}</title>
          </rect>
          <text x="${cx}" y="${h - 10}" text-anchor="middle" fill="#cbd5e1" font-size="11" font-weight="600">${escapeHtml(m.label)}</text>
        </g>
      `;
    })
    .join("");

  container.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Graphique gains et dépenses sur 6 mois">${gridLines}${bars}</svg>`;
}

function renderCategoryDonut(periodTxs) {
  const donut = $("category-donut");
  const legend = $("category-legend");
  const totalLabel = $("category-total-label");

  const totals = new Map();
  let totalExpense = 0;
  for (const tx of periodTxs) {
    if (tx.amount >= 0) continue;
    const cat = getEffectiveCategory(tx);
    const val = Math.abs(tx.amount);
    totals.set(cat, (totals.get(cat) || 0) + val);
    totalExpense += val;
  }

  totalLabel.textContent = totalExpense > 0 ? formatCurrency(totalExpense) : "";

  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    donut.innerHTML = `<svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="56" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="22"/><text x="80" y="84" text-anchor="middle" fill="#94a3b8" font-size="12">Aucune dépense</text></svg>`;
    legend.innerHTML = `<li class="muted-small">Aucune dépense sur cette période.</li>`;
    return;
  }

  const r = 56;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  const segments = entries
    .map(([cat, val], i) => {
      const pct = val / totalExpense;
      const dash = pct * circ;
      const color = PALETTE[i % PALETTE.length];
      const seg = `
        <circle cx="80" cy="80" r="${r}" fill="none" stroke="${color}" stroke-width="22"
          stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)">
          <title>${escapeHtml(cat)} : ${escapeHtml(formatCurrency(val))} (${Math.round(pct * 100)}%)</title>
        </circle>
      `;
      offset += dash;
      return seg;
    })
    .join("");

  donut.innerHTML = `
    <svg viewBox="0 0 160 160" role="img" aria-label="Répartition des dépenses">
      ${segments}
      <text x="80" y="76" text-anchor="middle" fill="#94a3b8" font-size="10">Total</text>
      <text x="80" y="94" text-anchor="middle" fill="#f1f5f9" font-size="13" font-weight="700">${escapeHtml(formatCurrency(totalExpense))}</text>
    </svg>
  `;

  legend.innerHTML = entries
    .map(([cat, val], i) => {
      const color = PALETTE[i % PALETTE.length];
      const pct = Math.round((val / totalExpense) * 100);
      return `
        <li data-cat="${escapeHtml(cat)}" title="Filtrer par ${escapeHtml(cat)}">
          <span class="cat-left">
            <span class="cat-dot" style="background:${color}"></span>
            <span class="cat-name">${escapeHtml(cat)}</span>
          </span>
          <span class="cat-amount">${escapeHtml(formatCurrency(val))} (${pct}%)</span>
        </li>
      `;
    })
    .join("");

  legend.querySelectorAll("li[data-cat]").forEach((li) => {
    li.addEventListener("click", () => {
      const cat = li.getAttribute("data-cat");
      $("filter-category").value = $("filter-category").value === cat ? "all" : cat;
      state.visibleCount = state.pageSize;
      renderDashboard();
    });
  });
}

function renderDailyCumulativeChart() {
  const container = $("daily-chart");
  const subtitle = $("daily-chart-subtitle");
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const maxDay = now.getDate();

  subtitle.textContent = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const txs = (state.data.transactions || []).filter((tx) => {
    if (state.selectedAccountId !== "all" && tx.account_id !== state.selectedAccountId) return false;
    if (!tx.date || !tx.date.startsWith(ym)) return false;
    if ($("toggle-exclude-summary").checked && tx.is_card_summary) return false;
    if ($("toggle-exclude-internal").checked && isInternalTransfer(tx)) return false;
    if (!$("toggle-coming").checked && tx.coming) return false;
    return true;
  });

  const dailyInc = new Array(daysInMonth + 1).fill(0);
  const dailyExp = new Array(daysInMonth + 1).fill(0);
  for (const tx of txs) {
    const day = Math.min(daysInMonth, Math.max(1, Number(tx.date.slice(8, 10)) || 1));
    if (tx.amount > 0) dailyInc[day] += tx.amount;
    else if (tx.amount < 0) dailyExp[day] += Math.abs(tx.amount);
  }

  const cumInc = [];
  const cumExp = [];
  let runInc = 0;
  let runExp = 0;
  for (let d = 1; d <= maxDay; d += 1) {
    runInc += dailyInc[d];
    runExp += dailyExp[d];
    cumInc.push({ day: d, val: runInc });
    cumExp.push({ day: d, val: runExp });
  }

  const maxVal = Math.max(100, runInc, runExp);
  const w = 860;
  const h = 190;
  const padL = 52;
  const padR = 18;
  const padT = 16;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const toX = (d) => padL + ((d - 1) / Math.max(1, daysInMonth - 1)) * plotW;
  const toY = (v) => padT + plotH - (v / maxVal) * plotH;

  const poly = (pts) => pts.map((p) => `${toX(p.day).toFixed(1)},${toY(p.val).toFixed(1)}`).join(" ");
  const grid = [0, 0.5, 1]
    .map((r) => {
      const y = padT + plotH * (1 - r);
      const val = Math.round(maxVal * r);
      return `
        <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="rgba(148,163,184,0.14)" stroke-dasharray="3 3" />
        <text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="10">${val} €</text>
      `;
    })
    .join("");

  const dayTicks = [1, 5, 10, 15, 20, 25, daysInMonth]
    .map((d) => `<text x="${toX(d)}" y="${h - 8}" text-anchor="middle" fill="#94a3b8" font-size="10">${d}</text>`)
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Cumul du mois en cours">
      ${grid}
      ${dayTicks}
      <polyline fill="none" stroke="#10b981" stroke-width="2.5" stroke-linejoin="round" points="${poly(cumInc)}" />
      <polyline fill="none" stroke="#fb7185" stroke-width="2.5" stroke-linejoin="round" points="${poly(cumExp)}" />
      <circle cx="${toX(maxDay)}" cy="${toY(runInc)}" r="4" fill="#10b981">
        <title>Gains cumulés J${maxDay} : ${escapeHtml(formatCurrency(runInc))}</title>
      </circle>
      <circle cx="${toX(maxDay)}" cy="${toY(runExp)}" r="4" fill="#fb7185">
        <title>Dépenses cumulées J${maxDay} : ${escapeHtml(formatCurrency(runExp))}</title>
      </circle>
    </svg>
  `;
}

function populateCategoryFilter() {
  const select = $("filter-category");
  const current = select.value;
  const dynamicCats = new Set(CATEGORIES);
  for (const tx of state.data.transactions || []) {
    dynamicCats.add(getEffectiveCategory(tx));
  }
  const sorted = [...dynamicCats].sort((a, b) => a.localeCompare(b, "fr"));
  select.innerHTML = `<option value="all">Toutes catégories</option>` + sorted.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if ([...dynamicCats].includes(current)) {
    select.value = current;
  }
}

function renderTransactionsTable(filteredTxs) {
  const tbody = $("tx-tbody");
  const loadMoreBtn = $("load-more-btn");
  $("tx-count").textContent = String(filteredTxs.length);

  if (!filteredTxs.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted-small">Aucune opération ne correspond aux filtres sélectionnés.</td></tr>`;
    loadMoreBtn.classList.add("hidden");
    return;
  }

  const accById = new Map((state.data.accounts || []).map((a) => [a.id, a]));
  const slice = filteredTxs.slice(0, state.visibleCount);
  const allCats = [...new Set([...CATEGORIES, ...Object.values(state.catOverrides)])];

  tbody.innerHTML = slice
    .map((tx) => {
      const acc = accById.get(tx.account_id);
      const effCat = getEffectiveCategory(tx);
      const amtClass = tx.amount >= 0 ? "positive" : "negative";
      const sign = tx.amount > 0 ? "+" : "";
      const comingBadge = tx.coming ? `<span class="badge badge-coming">À venir</span> ` : "";
      const rawLine = tx.raw && tx.raw !== tx.label ? `<div class="tx-label-raw">${escapeHtml(tx.raw)}</div>` : "";
      const optionsHtml = allCats
        .map((c) => `<option value="${escapeHtml(c)}" ${c === effCat ? "selected" : ""}>${escapeHtml(c)}</option>`)
        .join("");

      return `
        <tr>
          <td>${escapeHtml(formatDateFr(tx.date))}</td>
          <td>
            <div class="tx-label-main">${comingBadge}${escapeHtml(tx.label)}</div>
            ${rawLine}
          </td>
          <td>${escapeHtml(acc ? acc.label : tx.account_id)}</td>
          <td>
            <select class="cat-select" data-tx-id="${escapeHtml(tx.id)}" aria-label="Catégorie">
              ${optionsHtml}
            </select>
          </td>
          <td class="right ${amtClass}">${escapeHtml(sign + formatCurrency(tx.amount, acc?.currency || "EUR"))}</td>
        </tr>
      `;
    })
    .join("");

  const txById = new Map(slice.map((t) => [t.id, t]));
  tbody.querySelectorAll(".cat-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const tx = txById.get(sel.getAttribute("data-tx-id"));
      if (tx) {
        setCategoryOverride(tx, sel.value);
        renderDashboard();
      }
    });
  });

  loadMoreBtn.classList.toggle("hidden", filteredTxs.length <= state.visibleCount);
}

function renderDashboard() {
  if (!state.data) return;
  renderSyncStatus();
  populateCategoryFilter();
  renderAccounts();

  const kpiTxs = getFilteredTransactions({ ignoreFlowFilter: true, ignoreCategoryFilter: true });
  const tableTxs = getFilteredTransactions();
  renderKPIs(kpiTxs);
  renderMonthlyChart();
  renderCategoryDonut(kpiTxs);
  renderDailyCumulativeChart();
  renderTransactionsTable(tableTxs);
}

function exportFilteredCsv() {
  const rows = getFilteredTransactions();
  const accById = new Map((state.data.accounts || []).map((a) => [a.id, a.label]));
  const csvCell = (val) => `"${String(val ?? "").replaceAll('"', '""')}"`;

  const lines = [
    ["Date", "Compte", "Libellé", "Catégorie", "Statut", "Montant (EUR)"].map(csvCell).join(";"),
    ...rows.map((tx) =>
      [
        tx.date,
        accById.get(tx.account_id) || tx.account_id,
        tx.label,
        getEffectiveCategory(tx),
        tx.coming ? "À venir" : "Comptabilisé",
        String(tx.amount).replace(".", ","),
      ]
        .map(csvCell)
        .join(";")
    ),
  ];

  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `credit-mutuel-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function unlockWithPassword(password) {
  const envelope = await fetchJsonNoCache("./data.enc");
  const data = await decryptEnvelope(envelope, password);
  state.data = data;
  state.password = password;
  state.isDemo = false;

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

async function triggerCloudSync(mode = "interactive_2fa") {
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
      body: JSON.stringify({ ref: "main", inputs: { mode } }),
    }
  );
  if (!resp.ok) {
    throw new Error(`Impossible de déclencher GitHub Actions (HTTP ${resp.status})`);
  }
  return true;
}

async function handleRefreshClick() {
  if (state.isDemo) {
    openDemoMode();
    return;
  }
  const btn = $("refresh-btn");
  const prevLabel = btn.textContent;
  btn.disabled = true;

  try {
    if (state.ghConfig.pat) {
      btn.textContent = "⏳ Synchro cloud…";
      const oldGen = state.data?.generated_at;
      await triggerCloudSync("schedule");
      for (let i = 0; i < 18; i += 1) {
        await new Promise((r) => setTimeout(r, 4000));
        const envelope = await fetchJsonNoCache("./data.enc");
        const fresh = await decryptEnvelope(envelope, state.password);
        if (fresh.generated_at && fresh.generated_at !== oldGen) {
          state.data = fresh;
          renderDashboard();
          return;
        }
      }
    }
    btn.textContent = "↻ Rechargement…";
    const envelope = await fetchJsonNoCache("./data.enc");
    state.data = await decryptEnvelope(envelope, state.password);
    renderDashboard();
  } catch (err) {
    alert(`Erreur lors de l'actualisation : ${err.message}`);
  } finally {
    btn.textContent = prevLabel;
    btn.disabled = false;
  }
}

async function initApp() {
  $("setup-actions-link").href = `https://github.com/${encodeURIComponent(state.ghConfig.owner)}/${encodeURIComponent(state.ghConfig.syncRepo)}/actions`;

  // Load non-sensitive status metadata if available
  try {
    const meta = await fetchJsonNoCache("./meta.json");
    const pill = $("lock-meta-pill");
    const dot = $("lock-meta-dot");
    const txt = $("lock-meta-text");
    pill.classList.remove("hidden");
    dot.className = `dot ${meta.status === "ok" ? "ok" : meta.status === "needs_2fa" ? "warn" : "err"}`;
    txt.textContent = `Dernière synchro : ${formatRelativeTime(meta.last_ok_at || meta.updated_at)}`;
  } catch {
    // Check if data.enc exists yet
    try {
      const head = await fetch(`./data.enc?t=${Date.now()}`, { method: "HEAD", cache: "no-store" });
      if (head.status === 404) {
        $("first-setup-notice").classList.remove("hidden");
      }
    } catch {
      // Ignore network check
    }
  }

  const cachedPwd = sessionStorage.getItem(STORAGE_KEYS.sessionPwd);
  if (cachedPwd) {
    try {
      await unlockWithPassword(cachedPwd);
    } catch {
      sessionStorage.removeItem(STORAGE_KEYS.sessionPwd);
    }
  }

  // Event listeners
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
    submitBtn.textContent = "Déchiffrement en cours…";
    try {
      await unlockWithPassword($("unlock-password").value);
    } catch (err) {
      errEl.textContent =
        err.status === 404
          ? "Le fichier data.enc n'existe pas encore. Lance la première synchro sur GitHub Actions ou clique sur « Tester avec des données démo »."
          : "Mot de passe incorrect ou données corrompues.";
      errEl.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Déchiffrer et ouvrir";
    }
  });

  $("demo-mode-btn")?.addEventListener("click", openDemoMode);
  $("demo-fallback-btn").addEventListener("click", openDemoMode);
  $("lock-btn").addEventListener("click", lockDashboard);
  $("refresh-btn").addEventListener("click", handleRefreshClick);
  $("export-csv-btn").addEventListener("click", exportFilteredCsv);
  $("clear-account-filter").addEventListener("click", () => {
    state.selectedAccountId = "all";
    renderDashboard();
  });

  $("trigger-2fa-btn").addEventListener("click", async () => {
    try {
      await triggerCloudSync("interactive_2fa");
      alert("Workflow 2FA lancé ! Ouvre l'application Crédit Mutuel sur ton téléphone pour valider la demande dans les prochains instants.");
    } catch (err) {
      alert(err.message);
    }
  });

  [
    "filter-search",
    "filter-period",
    "filter-flow",
    "filter-category",
    "toggle-coming",
    "toggle-exclude-summary",
    "toggle-exclude-internal",
  ].forEach((id) => {
    $(id).addEventListener("input", () => {
      state.visibleCount = state.pageSize;
      renderDashboard();
    });
    $(id).addEventListener("change", () => {
      state.visibleCount = state.pageSize;
      renderDashboard();
    });
  });

  $("load-more-btn").addEventListener("click", () => {
    state.visibleCount += state.pageSize;
    renderTransactionsTable(getFilteredTransactions());
  });

  // Settings modal
  const dlg = $("settings-dialog");
  $("settings-btn").addEventListener("click", () => {
    $("cfg-owner").value = state.ghConfig.owner || "";
    $("cfg-sync-repo").value = state.ghConfig.syncRepo || "cm-budget-sync";
    $("cfg-gh-pat").value = state.ghConfig.pat || "";
    dlg.showModal();
  });
  $("close-settings-btn").addEventListener("click", () => dlg.close());
  $("clear-settings-btn").addEventListener("click", () => {
    state.ghConfig.pat = "";
    $("cfg-gh-pat").value = "";
    localStorage.setItem(STORAGE_KEYS.ghConfig, JSON.stringify(state.ghConfig));
    renderSyncStatus();
    dlg.close();
  });
  $("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.ghConfig = {
      owner: $("cfg-owner").value.trim() || "Josephdecacqueray",
      syncRepo: $("cfg-sync-repo").value.trim() || "cm-budget-sync",
      pat: $("cfg-gh-pat").value.trim(),
    };
    localStorage.setItem(STORAGE_KEYS.ghConfig, JSON.stringify(state.ghConfig));
    renderSyncStatus();
    dlg.close();
  });
}

initApp();
