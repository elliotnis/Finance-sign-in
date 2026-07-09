const STOCK_UNIVERSE = [
  {
    symbol: "AAPL",
    name: "Apple",
    sector: "Technology",
    prices: { 2020: 129, 2021: 152, 2022: 138, 2023: 190, 2024: 220, 2025: 245, 2026: 272 }
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    sector: "Software",
    prices: { 2020: 210, 2021: 255, 2022: 230, 2023: 340, 2024: 395, 2025: 450, 2026: 490 }
  },
  {
    symbol: "AMZN",
    name: "Amazon",
    sector: "E-commerce",
    prices: { 2020: 160, 2021: 332, 2022: 90, 2023: 138, 2024: 160, 2025: 182, 2026: 203 }
  },
  {
    symbol: "TSLA",
    name: "Tesla",
    sector: "Automotive",
    prices: { 2020: 86, 2021: 1090, 2022: 260, 2023: 255, 2024: 290, 2025: 312, 2026: 340 }
  },
  {
    symbol: "NVDA",
    name: "NVIDIA",
    sector: "Semiconductors",
    prices: { 2020: 127, 2021: 294, 2022: 148, 2023: 470, 2024: 590, 2025: 660, 2026: 730 }
  },
  {
    symbol: "KO",
    name: "Coca-Cola",
    sector: "Consumer Staples",
    prices: { 2020: 46, 2021: 59, 2022: 61, 2023: 65, 2024: 72, 2025: 74, 2026: 77 }
  },
  {
    symbol: "JPM",
    name: "JPMorgan",
    sector: "Finance",
    prices: { 2020: 122, 2021: 158, 2022: 131, 2023: 145, 2024: 162, 2025: 174, 2026: 183 }
  }
];

const NEWS_FEED = [
  {
    year: 2020,
    headline: "AI research funding surges as universities expand compute quotas.",
    source: "Campus Finance Wire",
    tag: "macro"
  },
  {
    year: 2021,
    headline: "Semiconductor shortage eases after new factory ramp-ups.",
    source: "Market School Desk",
    tag: "tech"
  },
  {
    year: 2022,
    headline: "Rates hold above long-term trend, cyclical names recover.",
    source: "Classroom Trading Digest",
    tag: "macro"
  },
  {
    year: 2023,
    headline: "Cloud hyperscaler spending outlook rises for the next fiscal cycle.",
    source: "Investor Bulletin",
    tag: "tech"
  },
  {
    year: 2024,
    headline: "Students launch green finance fund after strong EV demand report.",
    source: "Finance Club Weekly",
    tag: "energy"
  },
  {
    year: 2025,
    headline: "AI chip makers announce next-gen architecture with higher margins.",
    source: "Morning Ledger",
    tag: "semis"
  },
  {
    year: 2026,
    headline: "Cross-border payments platform expands to campuses across the country.",
    source: "Financial Classroom",
    tag: "fintech"
  }
];

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const INITIAL_CASH = 10000;
const STORAGE_KEY = "youth-financetopia-state-v1";
const ACTIVE_KEY = "youth-financetopia-active-v1";
const API_URL = window.TRADING_SIM_API_URL
  || (["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:8000"
    : "/api");
const DEFAULT_USER = {
  cash: INITIAL_CASH,
  transactions: [],
  selectedYear: 2024,
  activeTradeYear: 2024,
  lastSeen: new Date().toISOString()
};

const authPanel = document.getElementById("authPanel");
const dashboard = document.getElementById("dashboard");
const emailInput = document.getElementById("emailInput");
const codeInput = document.getElementById("codeInput");
const otpHint = document.getElementById("otpHint");
const loginHint = document.getElementById("loginHint");
const requestCodeBtn = document.getElementById("requestCodeBtn");
const loginForm = document.getElementById("loginForm");
const requestCodeForm = document.getElementById("requestCodeForm");
const changeEmailBtn = document.getElementById("changeEmailBtn");
const loginBtn = document.getElementById("loginBtn");
const otpInputs = document.getElementById("otpInputs");
const otpCells = Array.from(document.querySelectorAll(".otp-input"));
const welcomeText = document.getElementById("welcomeText");
const logoutBtn = document.getElementById("logoutBtn");
const marketYearSelect = document.getElementById("marketYear");
const stockGrid = document.getElementById("stockGrid");
const summaryGrid = document.getElementById("summaryGrid");
const holdingsBody = document.getElementById("holdingsBody");
const newsGrid = document.getElementById("newsGrid");
const pnlCanvas = document.getElementById("pnlCanvas");
const tradeHint = document.getElementById("tradeHint");

let currentEmail = null;
let userState = null;

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatMoney(value) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatNumber(value) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function getStockBySymbol(symbol) {
  return STOCK_UNIVERSE.find((stock) => stock.symbol === symbol);
}

function getStockPrice(symbol, year) {
  const stock = getStockBySymbol(symbol);
  if (!stock) return null;
  return stock.prices[year] ?? null;
}

function loadState() {
  const profiles = readStorage(STORAGE_KEY, {});
  return profiles;
}

function getActiveUserState() {
  const profiles = loadState();
  const active = readStorage(ACTIVE_KEY, null);
  if (active && profiles[active]) return { email: active, profile: profiles[active] };
  return null;
}

function ensureProfile(email) {
  const profiles = loadState();
  if (!profiles[email]) {
    profiles[email] = { ...DEFAULT_USER, email };
    writeStorage(STORAGE_KEY, profiles);
  }
  return profiles[email];
}

function saveUserState(email, profile) {
  const profiles = loadState();
  profiles[email] = { ...profile, lastSeen: new Date().toISOString() };
  writeStorage(STORAGE_KEY, profiles);
  writeStorage(ACTIVE_KEY, email);
}

function setActiveUser(email) {
  const profile = ensureProfile(email);
  currentEmail = email;
  userState = profile;
  renderDashboard();
}

function showHint(el, text, isError = false) {
  el.textContent = text;
  el.style.color = isError ? "var(--negative)" : "var(--positive)";
}

function updateCodeInput() {
  codeInput.value = otpCells.map((cell) => cell.value).join("");
}

function clearCodeCells() {
  otpCells.forEach((cell) => {
    cell.value = "";
  });
  updateCodeInput();
}

function showCodeStep() {
  requestCodeForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  clearCodeCells();
  requestAnimationFrame(() => otpCells[0]?.focus());
}

function showEmailStep() {
  requestCodeForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  clearCodeCells();
  loginHint.textContent = "";
  otpHint.textContent = "";
  requestAnimationFrame(() => emailInput.focus());
}

function initYearSelect() {
  marketYearSelect.innerHTML = "";
  const maxSelectable = getActiveTradeYear() + 1;
  YEARS.forEach((year) => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = year;
    if (year > maxSelectable) option.disabled = true;
    marketYearSelect.append(option);
  });
  marketYearSelect.value = String(userState.selectedYear || 2024);
}

function getMarketYear() {
  return Number(marketYearSelect.value);
}

function getActiveTradeYear() {
  return Number(userState.activeTradeYear || 2024);
}

function canTradeInYear(year) {
  return year === getActiveTradeYear();
}

function setTradeYear(year) {
  userState.activeTradeYear = year;
}

function renderMarketBoard() {
  stockGrid.innerHTML = "";
  const year = getMarketYear();
  const activeTradeYear = getActiveTradeYear();
  const isTradingYear = canTradeInYear(year);
  tradeHint.textContent = isTradingYear
    ? `Trading is open for year ${activeTradeYear}`
    : `You can only buy at the beginning of year ${activeTradeYear}. Opened year is in view-only mode.`;
  tradeHint.style.color = isTradingYear ? "var(--positive)" : "var(--negative)";

  STOCK_UNIVERSE.forEach((stock) => {
    const card = document.createElement("section");
    card.className = "stock-card";

    const title = document.createElement("div");
    title.className = "stock-title";
    title.textContent = `${stock.symbol} · ${stock.name}`;
    card.append(title);

    const meta = document.createElement("div");
    meta.className = "stock-meta";
    meta.textContent = `${stock.sector}`;
    card.append(meta);

    const price = getStockPrice(stock.symbol, year);
    const pricePill = document.createElement("div");
    pricePill.className = "stock-price";
    pricePill.textContent = formatMoney(price);
    card.append(pricePill);

    const priceSub = document.createElement("div");
    priceSub.className = "stock-meta";
    priceSub.textContent = `Current price in ${year}`;
    card.append(priceSub);

    const qty = document.createElement("input");
    qty.type = "number";
    qty.min = "1";
    qty.step = "1";
    qty.placeholder = "Shares";
    qty.className = "qty-input";
    card.append(qty);

    const tradeYearMeta = document.createElement("div");
    tradeYearMeta.className = "stock-meta";
    tradeYearMeta.textContent = `Buy year: ${activeTradeYear}`;
    card.append(tradeYearMeta);

    const message = document.createElement("div");
    message.className = "hint";
    message.style.minHeight = "18px";
    card.append(message);

    const buyBtn = document.createElement("button");
    buyBtn.type = "button";
    buyBtn.textContent = "Buy Shares";
    buyBtn.disabled = !isTradingYear;
    buyBtn.textContent = isTradingYear ? "Buy Shares" : "Market closed";
    buyBtn.addEventListener("click", () => {
      executeBuy(stock.symbol, qty.value, message);
    });
    card.append(buyBtn);

    stockGrid.append(card);
  });
}

function holdingsAtYear(year) {
  const map = new Map();
  userState.transactions.forEach((tx) => {
    if (tx.year > year) return;
    const current = map.get(tx.symbol) || { shares: 0, cost: 0 };
    current.shares += tx.shares;
    current.cost += tx.cost;
    map.set(tx.symbol, current);
  });
  return map;
}

function renderHoldings() {
  holdingsBody.innerHTML = "";
  const year = getMarketYear();
  const map = holdingsAtYear(year);
  const rows = [];

  map.forEach((holding, symbol) => {
    const stock = getStockBySymbol(symbol);
    const currentPrice = getStockPrice(symbol, year);
    const currentValue = holding.shares * currentPrice;
    const pnl = currentValue - holding.cost;

    const row = document.createElement("tr");

    const symbolTd = document.createElement("td");
    symbolTd.textContent = `${stock.symbol} - ${stock.name}`;
    row.append(symbolTd);

    const sharesTd = document.createElement("td");
    sharesTd.textContent = formatNumber(holding.shares);
    row.append(sharesTd);

    const avgTd = document.createElement("td");
    avgTd.textContent = formatMoney(holding.cost / holding.shares);
    row.append(avgTd);

    const currentTd = document.createElement("td");
    currentTd.textContent = formatMoney(currentPrice);
    row.append(currentTd);

    const valueTd = document.createElement("td");
    valueTd.textContent = formatMoney(currentValue);
    row.append(valueTd);

    const pnlTd = document.createElement("td");
    pnlTd.textContent = formatMoney(pnl);
    pnlTd.className = pnl >= 0 ? "positive" : "negative";
    row.append(pnlTd);

    rows.push({ node: row, value: currentValue });
  });

  rows
    .sort((a, b) => b.value - a.value)
    .forEach((r) => holdingsBody.append(r.node));
}

function renderSummary() {
  const year = getMarketYear();
  const map = holdingsAtYear(year);
  const summary = [...map.entries()].reduce(
    (acc, [symbol, holding]) => {
      const currentPrice = getStockPrice(symbol, year);
      acc.position += holding.shares * currentPrice;
      acc.cost += holding.cost;
      return acc;
    },
    { position: 0, cost: 0 }
  );

  const portfolioValue = summary.position + userState.cash;
  const pnl = portfolioValue - INITIAL_CASH;
  const pnlPercent = (pnl / INITIAL_CASH) * 100;

  summaryGrid.innerHTML = "";
  const items = [
    { label: "Cash Balance", value: formatMoney(userState.cash) },
    { label: "Position Value", value: formatMoney(summary.position) },
    { label: "Invested Cost", value: formatMoney(summary.cost) },
    {
      label: "Portfolio Value",
      value: formatMoney(portfolioValue)
    },
    {
      label: "Unrealized PnL",
      value: formatMoney(pnl),
      className: pnl >= 0 ? "positive" : "negative"
    },
    {
      label: "PnL %",
      value: `${pnlPercent >= 0 ? "+" : ""}${formatNumber(pnlPercent)}%`,
      className: pnlPercent >= 0 ? "positive" : "negative"
    }
  ];

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "summary-card";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "value";
    if (item.className) value.classList.add(item.className);
    value.textContent = item.value;
    card.append(label, value);
    summaryGrid.append(card);
  });
}

function renderNews() {
  const year = getMarketYear();
  const feed = NEWS_FEED.filter((item) => item.year <= year).sort((a, b) => b.year - a.year);
  newsGrid.innerHTML = "";

  feed.forEach((item) => {
    const card = document.createElement("div");
    card.className = "news-card";
    const head = document.createElement("div");
    head.className = "news-head";
    const h = document.createElement("strong");
    h.textContent = item.headline;
    const tag = document.createElement("span");
    tag.className = "news-year";
    tag.textContent = `${item.year} • ${item.source}`;
    head.append(h, tag);
    const body = document.createElement("div");
    body.className = "stock-meta";
    body.textContent = `Topic: ${item.tag}`;
    card.append(head, body);
    newsGrid.append(card);
  });

  if (!feed.length) {
    const empty = document.createElement("div");
    empty.className = "news-card";
    empty.textContent = "No news available yet for this year.";
    newsGrid.append(empty);
  }
}

function renderPnLChart() {
  const txs = [...userState.transactions].sort((a, b) => (a.year - b.year) || a.placedAt - b.placedAt);
  const points = [];
  const position = {};

  let cash = INITIAL_CASH;

  YEARS.forEach((year) => {
    txs
      .filter((tx) => tx.year === year)
      .forEach((tx) => {
        position[tx.symbol] = (position[tx.symbol] || 0) + tx.shares;
        cash -= tx.cost;
      });

    let portfolioValue = cash;
    STOCK_UNIVERSE.forEach((stock) => {
      const qty = position[stock.symbol] || 0;
      if (qty > 0) portfolioValue += qty * getStockPrice(stock.symbol, year);
    });

    points.push({ year, total: portfolioValue, pnl: portfolioValue - INITIAL_CASH });
  });

  if (!points.length) return;

  const totals = points.map((point) => point.total);
  const minValue = Math.min(...totals, INITIAL_CASH) - 200;
  const maxValue = Math.max(...totals, INITIAL_CASH) + 200;
  const pnlZeroY = INITIAL_CASH;
  const width = pnlCanvas.clientWidth || 900;
  const height = pnlCanvas.clientHeight || 280;
  const dpr = window.devicePixelRatio || 1;
  pnlCanvas.width = width * dpr;
  pnlCanvas.height = height * dpr;
  const ctx = pnlCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const pad = 36;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  function xFor(i) {
    return pad + (plotW * i) / Math.max(1, points.length - 1);
  }

  function yFor(value) {
    const clamped = Math.min(maxValue, Math.max(minValue, value));
    return pad + plotH - ((clamped - minValue) / (maxValue - minValue)) * plotH;
  }

  ctx.strokeStyle = "#d8e0ec";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  const maxY = yFor(pnlZeroY);
  ctx.strokeStyle = "#c6921466";
  ctx.beginPath();
  ctx.moveTo(pad, maxY);
  ctx.lineTo(width - pad, maxY);
  ctx.stroke();

  ctx.strokeStyle = "#003882";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((point, i) => {
    const x = xFor(i);
    const y = yFor(point.total);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#e8eefc";
  points.forEach((point, i) => {
    const x = xFor(i);
    const y = yFor(point.total);
    ctx.fillStyle = point.pnl >= 0 ? "#15803d" : "#dc2626";
    ctx.beginPath();
    ctx.arc(x, y, 3.8, 0, Math.PI * 2);
    ctx.fill();

    const labelY = i === 0 ? y + 12 : y - 8;
    ctx.fillStyle = "#475569";
    ctx.font = "11px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(String(point.year), x - 8, height - 10);
    ctx.fillText(formatMoney(point.total), x - 24, labelY < pad + 14 ? pad + 20 : y - 10);
  });
}

function executeBuy(symbol, sharesInput, messageEl) {
  const shares = Math.trunc(Number(sharesInput));
  if (!Number.isFinite(shares) || shares <= 0) {
    messageEl.textContent = "Share amount must be a positive integer.";
    messageEl.className = "hint negative";
    return;
  }

  const year = getActiveTradeYear();
  if (!canTradeInYear(year) || year !== getMarketYear()) {
    messageEl.textContent = "You can only buy at the beginning of the active trading year.";
    messageEl.className = "hint negative";
    return;
  }

  const price = getStockPrice(symbol, year);
  if (!price) {
    messageEl.textContent = "No price for selected year.";
    messageEl.className = "hint negative";
    return;
  }

  const cost = shares * price;
  if (userState.cash < cost) {
    messageEl.textContent = `Need ${formatMoney(cost)} but only have ${formatMoney(userState.cash)} cash.`;
    messageEl.className = "hint negative";
    return;
  }

  userState.cash -= cost;
  userState.transactions.push({
    symbol,
    shares,
    year,
    price,
    cost,
    placedAt: Date.now()
  });
  userState.lastSeen = new Date().toISOString();
  saveUserState(currentEmail, userState);
  messageEl.textContent = `Bought ${shares} ${symbol} at ${formatMoney(price)} for ${formatMoney(cost)}.`;
  messageEl.className = "hint positive";
  renderDashboard();
}

function renderDashboard() {
  authPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
  welcomeText.textContent = `Welcome, ${currentEmail}`;
  initYearSelect();
  marketYearSelect.value = String(userState.selectedYear || 2024);
  renderMarketBoard();
  renderSummary();
  renderHoldings();
  renderNews();
  renderPnLChart();
}

function logout() {
  localStorage.removeItem(ACTIVE_KEY);
  currentEmail = null;
  userState = null;
  dashboard.classList.add("hidden");
  authPanel.classList.remove("hidden");
  emailInput.value = "";
  showEmailStep();
}

function switchToDashboardOrAuth() {
  const active = getActiveUserState();
  if (active) {
    currentEmail = active.email;
    userState = active.profile;
    renderDashboard();
    return;
  }
  authPanel.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

requestCodeBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim().toLowerCase();
  if (!email) {
    showHint(otpHint, "Enter an email first.", true);
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    showHint(otpHint, "Enter a valid email address.", true);
    return;
  }

  requestCodeBtn.disabled = true;
  requestCodeBtn.textContent = "Sending...";
  try {
    const response = await fetch(`${API_URL}/auth/trading/email-code/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || data.message || "Could not send the sign-in email.");
    }
    emailInput.value = data.email || email;
    showHint(otpHint, `Sign-in code sent to ${data.email || email}. Check your email.`);
    loginHint.textContent = "";
    showCodeStep();
  } catch (error) {
    showHint(otpHint, error.message || "Could not send the sign-in email.", true);
  } finally {
    requestCodeBtn.disabled = false;
    requestCodeBtn.textContent = "Email me a sign-in code";
  }
});

requestCodeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  requestCodeBtn.click();
});

changeEmailBtn.addEventListener("click", showEmailStep);

otpCells.forEach((cell, index) => {
  cell.addEventListener("input", () => {
    cell.value = cell.value.replace(/\D/g, "").slice(-1);
    updateCodeInput();
    if (cell.value && index < otpCells.length - 1) {
      otpCells[index + 1].focus();
    }
  });

  cell.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && !cell.value && index > 0) {
      otpCells[index - 1].focus();
    }
    if (event.key === "ArrowLeft" && index > 0) {
      otpCells[index - 1].focus();
    }
    if (event.key === "ArrowRight" && index < otpCells.length - 1) {
      otpCells[index + 1].focus();
    }
  });
});

otpInputs.addEventListener("paste", (event) => {
  const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
  if (!pasted) return;
  event.preventDefault();
  otpCells.forEach((cell, index) => {
    cell.value = pasted[index] || "";
  });
  updateCodeInput();
  otpCells[Math.min(pasted.length, otpCells.length) - 1]?.focus();
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim().toLowerCase();
  const code = codeInput.value.trim();
  if (!email || !code) {
    showHint(loginHint, "Email and code are required.", true);
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    showHint(loginHint, "Code must be 6 digits.", true);
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Verifying...";
  try {
    const response = await fetch(`${API_URL}/auth/email-link/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || data.message || "This code is invalid or expired.");
    }
    const verifiedEmail = data.email || email;
    const profile = ensureProfile(verifiedEmail);
    setActiveUser(verifiedEmail);
    saveUserState(verifiedEmail, profile);
    userState = profile;
    renderDashboard();
    showHint(otpHint, "", false);
    showHint(loginHint, "", false);
  } catch (error) {
    showHint(loginHint, error.message || "This code is invalid or expired.", true);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Verify and sign in";
  }
});

logoutBtn.addEventListener("click", logout);

marketYearSelect.addEventListener("change", () => {
  const chosenYear = getMarketYear();
  const currentTradeYear = getActiveTradeYear();

  if (chosenYear > currentTradeYear + 1) {
    tradeHint.textContent = "Advance one year at a time to open the next trading year.";
    tradeHint.style.color = "var(--negative)";
    marketYearSelect.value = String(currentTradeYear);
    renderMarketBoard();
    renderSummary();
    renderHoldings();
    renderNews();
    renderPnLChart();
    return;
  }

  userState.selectedYear = chosenYear;
  if (chosenYear === currentTradeYear + 1) {
    setTradeYear(chosenYear);
  }

  saveUserState(currentEmail, userState);
  renderMarketBoard();
  renderSummary();
  renderHoldings();
  renderNews();
  renderPnLChart();
});

function normalizeStateIfNeeded() {
  const allProfiles = loadState();
  Object.keys(allProfiles).forEach((email) => {
    const profile = allProfiles[email];
    if (typeof profile.cash !== "number") profile.cash = Number(profile.cash) || INITIAL_CASH;
    if (!Array.isArray(profile.transactions)) profile.transactions = [];
    if (!profile.transactions.every((tx) => Number.isFinite(tx.shares) && Number.isFinite(tx.cost))) {
      profile.transactions = profile.transactions.filter((tx) => tx && tx.symbol && Number.isFinite(Number(tx.shares)) && Number.isFinite(Number(tx.cost)));
      profile.transactions.forEach((tx) => {
        tx.shares = Number(tx.shares);
        tx.cost = Number(tx.cost);
      });
    }
    if (!YEARS.includes(profile.activeTradeYear)) profile.activeTradeYear = 2024;
    if (!YEARS.includes(profile.selectedYear)) profile.selectedYear = 2024;
    if (profile.selectedYear < profile.activeTradeYear) {
      profile.selectedYear = profile.activeTradeYear;
    }
    allProfiles[email] = profile;
  });
  writeStorage(STORAGE_KEY, allProfiles);
}

normalizeStateIfNeeded();
switchToDashboardOrAuth();
