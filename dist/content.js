// shared/constants.js
var DEFAULT_SETTINGS = {
  enabled: true,
  minRpm: 2,
  minRate: 0,
  minMiles: 0,
  maxMiles: 0,
  hideBelowThreshold: false,
  highlightGoodLoads: true,
  deadheadCity: "",
  deadheadState: "",
  autoRefreshSeconds: 0,
  emailTemplates: [
    {
      id: "default",
      name: "Standard inquiry",
      subject: "Load inquiry \u2014 {{origin}} to {{destination}}",
      body: "Hi,\n\nI'm interested in your load from {{origin}} to {{destination}} ({{miles}} mi, {{equipment}}).\n\nPlease confirm availability and best rate.\n\nMC#: {{mcNumber}}\n\nThanks!"
    }
  ],
  activeTemplateId: "default",
  mcNumber: "",
  dotNumber: "",
  companyName: "",
  telegram: {
    enabled: false,
    botToken: "",
    chatId: ""
  },
  fmcsaWebKey: "",
  rts: {
    enabled: true,
    userId: "",
    userPass: "",
    minGrade: ""
  },
  tollguru: {
    enabled: false,
    apiKey: "",
    truckAxles: 5,
    showNetRpm: true
  }
};
var STORAGE_KEY = "loadExtensionSettings";

// shared/storage.js
async function getSettings() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] || {} };
}

// shared/rpm.js
function haversineMiles(a, b) {
  const toRad = (deg) => deg * Math.PI / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
var CITY_COORDS = {
  "chicago,il": { lat: 41.8781, lng: -87.6298 },
  "dallas,tx": { lat: 32.7767, lng: -96.797 },
  "atlanta,ga": { lat: 33.749, lng: -84.388 },
  "los angeles,ca": { lat: 34.0522, lng: -118.2437 },
  "houston,tx": { lat: 29.7604, lng: -95.3698 },
  "memphis,tn": { lat: 35.1495, lng: -90.049 },
  "indianapolis,in": { lat: 39.7684, lng: -86.1581 },
  "phoenix,az": { lat: 33.4484, lng: -112.074 },
  "denver,co": { lat: 39.7392, lng: -104.9903 },
  "kansas city,mo": { lat: 39.0997, lng: -94.5786 }
};
function normalizeCityKey(city, state) {
  return `${(city || "").trim().toLowerCase()},${(state || "").trim().toLowerCase()}`;
}
function estimateDeadheadMiles(deadheadCity, deadheadState, originCity, originState) {
  const from = CITY_COORDS[normalizeCityKey(deadheadCity, deadheadState)];
  const to = CITY_COORDS[normalizeCityKey(originCity, originState)];
  if (!from || !to) return 0;
  return Math.round(haversineMiles(from, to));
}
function calculateRpm(rate, tripMiles, deadheadMiles = 0) {
  const totalMiles = Number(tripMiles) + Number(deadheadMiles);
  if (!rate || !totalMiles) return 0;
  return Number(rate) / totalMiles;
}
function parseMoney(value) {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  return Number(cleaned) || 0;
}
function parseMiles(value) {
  if (value == null) return 0;
  const match = String(value).match(/([\d,]+(?:\.\d+)?)/);
  if (!match) return 0;
  return Number(match[1].replace(/,/g, "")) || 0;
}

// content/parsers.js
var CITY_STATE_RE = /([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2})\b/g;
var EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
var DOT_RE = /\b(?:USDOT|DOT)\s*#?\s*(\d{5,8})\b/i;
function uniqueId(parts) {
  return parts.filter(Boolean).join("|").toLowerCase();
}
function extractCityPairs(text) {
  const matches = [...text.matchAll(CITY_STATE_RE)];
  return matches.map((m) => ({
    city: m[1].trim(),
    state: m[2],
    label: `${m[1].trim()}, ${m[2]}`
  }));
}
function guessRate(text, board = "generic") {
  const dollarMatches = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)];
  if (dollarMatches.length) {
    return Math.max(...dollarMatches.map((m) => parseMoney(m[1])));
  }
  if (board !== "dat") return 0;
  const perMile = [...text.matchAll(/\$\s*([\d.]+)\s*\/\s*mi\b/gi)];
  if (perMile.length) return 0;
  const plainMatches = [...text.matchAll(/\b([\d,]{3,6})\b/g)];
  const rates = plainMatches.map((m) => parseMoney(m[1])).filter((value) => value >= 150 && value <= 25e3);
  return rates.length ? Math.max(...rates) : 0;
}
function guessMiles(text, board = "generic") {
  const mileMatches = [...text.matchAll(/([\d,]+)\s*(?:mi|miles)\b/gi)];
  for (const match of mileMatches) {
    const value = parseMiles(match[1]);
    if (value >= 50 && value <= 3500) return value;
  }
  if (board !== "dat") return 0;
  const plainMatches = [...text.matchAll(/\b([\d,]{2,4})\b/g)];
  for (const match of plainMatches) {
    const value = parseMiles(match[1]);
    if (value >= 50 && value <= 3500) return value;
  }
  return 0;
}
function guessEquipment(text) {
  const types = ["Van", "Reefer", "Flatbed", "Stepdeck", "Power Only", "Box Truck", "Hotshot", "Decks"];
  const upper = text.toUpperCase();
  for (const type of types) {
    if (upper.includes(type.toUpperCase())) return type;
  }
  const codeMatch = text.match(/\b(V|R|F|SD|PO|HS)\b/);
  return codeMatch ? codeMatch[1] : "";
}
function detectBoard() {
  const host = location.hostname.replace(/^www\./, "");
  if (host.includes("one.dat.com") || host.includes("power.dat.com")) return "dat";
  if (host.includes("truckstop.com")) return "truckstop";
  if (host.includes("trucksmarter.com")) return "trucksmarter";
  return "generic";
}
function rowText(element) {
  return (element.textContent || "").replace(/\s+/g, " ").trim();
}
function isDatRowElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest("#loadextension-overlay-root, #loadextension-toolbar, .le-overlay-chip")) {
    return false;
  }
  if (element.matches("thead, th, [role='columnheader'], nav, header, footer")) return false;
  const role = element.getAttribute("role");
  const isRow = role === "row" || element.classList.contains("ag-row") || element.matches("table tbody tr");
  if (!isRow) return false;
  const parentRow = element.parentElement?.closest('[role="row"], .ag-row, table tbody tr');
  if (parentRow && parentRow !== element) return false;
  const rect = element.getBoundingClientRect();
  return rect.height >= 16 && rect.height <= 320 && rect.width >= 80 && rect.height > 0;
}
function isSafeRowElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.id === "loadextension-overlay-root") return false;
  if (element.closest("#loadextension-overlay-root, #loadextension-toolbar, .le-overlay-chip")) {
    return false;
  }
  if (element.matches("thead, th, script, style, nav, header, footer, html, body")) return false;
  if (detectBoard() === "dat" && isDatRowElement(element)) return true;
  const rect = element.getBoundingClientRect();
  if (rect.height < 28 || rect.height > 160) return false;
  if (rect.width < 200) return false;
  if (element.querySelector('[role="row"], tr, .le-overlay-chip')) return false;
  if (element.children.length > 30) return false;
  return true;
}
function isLikelyLoadRow(element) {
  if (!isSafeRowElement(element)) return false;
  const board = detectBoard();
  const text = rowText(element);
  if (text.length < 12 || text.length > 2e3) return false;
  if (/^(origin|destination|rate|company|age|trip|deadhead|equipment)$/i.test(text)) return false;
  const cities = extractCityPairs(text);
  if (cities.length < 2) return false;
  return guessRate(text, board) > 0 || guessMiles(text, board) > 0;
}
function selectorsForBoard(board) {
  if (board === "dat") {
    return [
      '[role="rowgroup"] [role="row"]',
      '[role="grid"] [role="row"]',
      '[role="treegrid"] [role="row"]',
      '[role="table"] [role="row"]',
      ".ag-center-cols-container .ag-row",
      '.ag-row[role="row"]',
      "table tbody tr",
      '[role="row"]'
    ];
  }
  if (board === "truckstop") {
    return ["table tbody tr", '[role="row"]'];
  }
  return ["table tbody tr", '[role="row"]'];
}
var MAX_ROWS_PER_SCAN = 150;
function findRowCandidates(root) {
  const board = detectBoard();
  const selectors = selectorsForBoard(board);
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  for (const selector of selectors) {
    for (const el of root.querySelectorAll(selector)) {
      if (rows.length >= MAX_ROWS_PER_SCAN) return rows;
      if (seen.has(el) || !isLikelyLoadRow(el)) continue;
      seen.add(el);
      rows.push(el);
    }
  }
  return rows;
}
function parseLoadFromElement(element) {
  const board = detectBoard();
  const text = rowText(element);
  const cities = extractCityPairs(text);
  const origin = cities[0]?.label || "";
  const destination = cities[1]?.label || "";
  const rate = guessRate(text, board);
  const miles = guessMiles(text, board);
  const emailMatch = text.match(EMAIL_RE);
  const dotMatch = text.match(DOT_RE);
  const mcMatches = [...text.matchAll(/\bMC\s*#?\s*(\d{5,8})\b/gi)].map((m) => m[1]);
  const brokerMcNumber = mcMatches[0] || "";
  const brokerLine = text.split(/\s{2,}|\n/).map((line) => line.trim()).find((line) => /logistics|freight|transport|broker|inc\.?|llc|services/i.test(line));
  return {
    id: uniqueId([origin, destination, rate, miles, brokerLine]),
    origin,
    originCity: cities[0]?.city || "",
    originState: cities[0]?.state || "",
    destination,
    destinationCity: cities[1]?.city || "",
    destinationState: cities[1]?.state || "",
    rate,
    miles,
    equipment: guessEquipment(text),
    broker: brokerLine || "",
    brokerMcNumber,
    email: emailMatch ? emailMatch[0] : "",
    dotNumber: dotMatch ? dotMatch[1] : "",
    mcNumber: brokerMcNumber,
    rawText: text.slice(0, 500),
    element
  };
}
function scanForLoads(root = document.body) {
  const roots = [root];
  if (detectBoard() === "dat" && root !== document.body) {
    roots.push(document.body);
  }
  const seen = /* @__PURE__ */ new Set();
  const loads = [];
  for (const scanRoot of roots) {
    for (const load of findRowCandidates(scanRoot).map(parseLoadFromElement)) {
      if (!load.origin || !load.destination || seen.has(load.id)) continue;
      seen.add(load.id);
      loads.push(load);
    }
  }
  return loads;
}

// shared/email.js
function applyTemplate(template, load, settings) {
  const replacements = {
    origin: load.origin || "",
    destination: load.destination || "",
    miles: load.miles ?? "",
    rate: load.rate ?? "",
    rpm: load.rpm != null ? load.rpm.toFixed(2) : "",
    equipment: load.equipment || "",
    broker: load.broker || "",
    mcNumber: settings.mcNumber || "",
    dotNumber: settings.dotNumber || "",
    companyName: settings.companyName || ""
  };
  const fill = (text) => String(text).replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] ?? "");
  return {
    subject: fill(template.subject),
    body: fill(template.body)
  };
}
function buildMailtoUrl(email, subject, body) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const query = params.toString();
  return `mailto:${encodeURIComponent(email)}${query ? `?${query}` : ""}`;
}

// shared/maps.js
function buildGoogleMapsRouteUrl(load, deadheadCity, deadheadState) {
  const stops = [];
  if (deadheadCity && deadheadState) {
    stops.push(`${deadheadCity}, ${deadheadState}`);
  }
  if (load.origin) stops.push(load.origin);
  if (load.destination) stops.push(load.destination);
  if (stops.length < 2) return null;
  const origin = encodeURIComponent(stops[0]);
  const destination = encodeURIComponent(stops[stops.length - 1]);
  const waypoints = stops.length > 2 ? `&waypoints=${encodeURIComponent(stops.slice(1, -1).join("|"))}` : "";
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints}&travelmode=driving`;
}
function buildFmcsaSaferUrl(dotNumber) {
  if (!dotNumber) return null;
  return `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(dotNumber)}`;
}

// shared/credit-cache.js
var CREDIT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
function gradeClass(grade) {
  const value = String(grade || "").toUpperCase();
  if (value.startsWith("A")) return "le-grade-a";
  if (value.startsWith("B")) return "le-grade-b";
  if (value.startsWith("C")) return "le-grade-c";
  if (value.startsWith("D") || value.startsWith("F")) return "le-grade-bad";
  return "le-grade-unknown";
}

// shared/toll.js
function netRpmAfterTolls(rate, tripMiles, deadheadMiles, tollCost) {
  const totalMiles = Number(tripMiles) + Number(deadheadMiles);
  if (!rate || !totalMiles) return 0;
  const netRate = Number(rate) - Number(tollCost || 0);
  return netRate / totalMiles;
}

// content/ui.js
function enrichLoad(load, settings) {
  const deadheadMiles = estimateDeadheadMiles(
    settings.deadheadCity,
    settings.deadheadState,
    load.originCity,
    load.originState
  );
  const rpm = calculateRpm(load.rate, load.miles, deadheadMiles);
  return {
    ...load,
    deadheadMiles,
    rpm,
    passesFilters: matchesFilters({ ...load, rpm, deadheadMiles }, settings)
  };
}
function matchesFilters(load, settings) {
  if (settings.minRate && load.rate < settings.minRate) return false;
  if (settings.minMiles && load.miles < settings.minMiles) return false;
  if (settings.maxMiles && load.miles > settings.maxMiles) return false;
  if (settings.minRpm && load.rpm < settings.minRpm) return false;
  return true;
}
function getActiveTemplate(settings) {
  return settings.emailTemplates.find((t) => t.id === settings.activeTemplateId) || settings.emailTemplates[0];
}
function createButton(label, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "le-action-btn";
  button.textContent = label;
  button.title = title;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}
function createBadge(className, text, title = "") {
  const badge = document.createElement("span");
  badge.className = className;
  badge.textContent = text;
  if (title) badge.title = title;
  return badge;
}
function requestBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}
function attachAsyncInsights(bar, load, settings) {
  if (settings.rts?.enabled && (load.brokerMcNumber || load.broker || load.dotNumber)) {
    requestBackground("GET_CREDIT", {
      mcNumber: load.brokerMcNumber,
      dotNumber: load.dotNumber,
      brokerName: load.broker
    }).then((response) => {
      if (!response?.ok || !response.credit) return;
      const { credit } = response;
      if (credit.pending) {
        bar.appendChild(
          createButton(credit.needsLogin ? "Connect RTS" : "RTS", credit.needsLogin ? "Log into RTS Pro" : "Open RTS credit search", () => {
            window.open(credit.rtsUrl || "https://rtspro.com/credit/search", "_blank", "noopener");
          })
        );
        return;
      }
      if (credit.grade || credit.averageDaysToPay != null) {
        const label = credit.grade ? `RTS ${credit.grade}` : `${credit.averageDaysToPay}d pay`;
        bar.appendChild(
          createBadge(
            `le-credit-badge ${gradeClass(credit.grade)}`,
            label,
            credit.averageDaysToPay ? `Avg days to pay: ${credit.averageDaysToPay}` : "RTS factoring grade"
          )
        );
        return;
      }
    }).catch(() => {
    });
  }
  if (settings.tollguru?.enabled && settings.tollguru.apiKey && load.origin && load.destination) {
    requestBackground("GET_TOLLS", {
      origin: load.origin,
      destination: load.destination
    }).then((response) => {
      if (!response?.ok || !response.toll || response.toll.tollCost == null) return;
      const { toll } = response;
      bar.appendChild(
        createBadge(
          "le-toll-badge",
          `Tolls $${toll.tollCost.toFixed(0)}`,
          toll.durationText ? `${toll.durationText}, ${toll.distanceText}` : "Estimated route tolls"
        )
      );
      if (settings.tollguru.showNetRpm && load.rate && load.miles) {
        const netRpm = netRpmAfterTolls(
          load.rate,
          load.miles,
          load.deadheadMiles,
          toll.tollCost
        );
        bar.appendChild(createBadge("le-net-rpm-badge", `Net RPM $${netRpm.toFixed(2)}`));
      }
    }).catch(() => {
    });
  }
}
function renderLoadEnhancements(load, settings) {
  const bar = document.createElement("div");
  bar.className = "le-load-bar";
  const badge = document.createElement("span");
  badge.className = `le-rpm-badge ${load.passesFilters ? "le-good" : "le-weak"}`;
  badge.textContent = `RPM+ ${load.rpm.toFixed(2)}`;
  if (load.deadheadMiles) {
    badge.title = `Includes ~${load.deadheadMiles} mi deadhead`;
  }
  bar.appendChild(badge);
  const template = getActiveTemplate(settings);
  if (load.email && template) {
    bar.appendChild(
      createButton("Email", "Send templated email to broker", () => {
        const { subject, body } = applyTemplate(template, load, settings);
        window.location.href = buildMailtoUrl(load.email, subject, body);
      })
    );
  } else {
    bar.appendChild(
      createButton("Copy", "Copy load summary", async () => {
        const summary = [
          `${load.origin} \u2192 ${load.destination}`,
          `$${load.rate} / ${load.miles} mi`,
          `RPM+: ${load.rpm.toFixed(2)}`
        ].join(" | ");
        await navigator.clipboard.writeText(summary);
      })
    );
  }
  const mapsUrl = buildGoogleMapsRouteUrl(load, settings.deadheadCity, settings.deadheadState);
  if (mapsUrl) {
    bar.appendChild(
      createButton("Map", "Open route in Google Maps", () => {
        window.open(mapsUrl, "_blank", "noopener");
      })
    );
  }
  if (load.dotNumber) {
    const saferUrl = buildFmcsaSaferUrl(load.dotNumber);
    bar.appendChild(
      createButton("DOT", "Open FMCSA SAFER snapshot", () => {
        window.open(saferUrl, "_blank", "noopener");
      })
    );
  }
  attachAsyncInsights(bar, load, settings);
  return bar;
}

// content/overlay.js
var ROOT_ID = "loadextension-overlay-root";
var OverlayManager = class {
  constructor() {
    this.entries = /* @__PURE__ */ new Map();
    this.root = this.ensureRoot();
    this.repositionScheduled = false;
    this.repositionAll = this.repositionAll.bind(this);
    this.scheduleRepositionAll = this.scheduleRepositionAll.bind(this);
    window.addEventListener("scroll", this.scheduleRepositionAll, true);
    window.addEventListener("resize", this.scheduleRepositionAll);
  }
  scheduleRepositionAll() {
    if (this.repositionScheduled) return;
    this.repositionScheduled = true;
    requestAnimationFrame(() => {
      this.repositionScheduled = false;
      this.repositionAll();
    });
  }
  ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "le-overlay-root";
      document.documentElement.appendChild(root);
    }
    return root;
  }
  mount(loadId, row, bar) {
    if (this.entries.has(loadId)) return;
    bar.classList.add("le-overlay-chip");
    bar.dataset.loadId = loadId;
    this.root.appendChild(bar);
    this.entries.set(loadId, { row, bar });
    this.reposition(loadId);
  }
  reposition(loadId) {
    const entry = this.entries.get(loadId);
    if (!entry) return;
    const { row, bar } = entry;
    if (!row.isConnected) {
      bar.remove();
      this.entries.delete(loadId);
      return;
    }
    const rect = row.getBoundingClientRect();
    if (rect.height < 20 || rect.width < 80 || rect.bottom < 0 || rect.top > window.innerHeight) {
      bar.style.display = "none";
      return;
    }
    bar.style.display = "flex";
    bar.style.top = `${Math.max(4, rect.top + 4)}px`;
    bar.style.left = `${Math.min(window.innerWidth - 8, rect.right - 8)}px`;
  }
  repositionAll() {
    for (const loadId of this.entries.keys()) {
      this.reposition(loadId);
    }
  }
  clear() {
    for (const { bar } of this.entries.values()) {
      bar.remove();
    }
    this.entries.clear();
  }
  count() {
    return this.entries.size;
  }
};

// content/content.js
var BUILD_VERSION = "0.4.4";
var SCAN_MIN_INTERVAL_MS = 3e3;
var INITIAL_SCAN_DELAY_MS = 2e3;
var PERIODIC_SCAN_MS = 12e3;
var STATE = {
  settings: null,
  refreshTimer: null,
  scanTimer: null,
  scrollTimer: null,
  overlay: null,
  boardObserver: null,
  processedIds: /* @__PURE__ */ new Set(),
  scanning: false,
  lastScanAt: 0,
  started: false
};
function notifyBackground(type, payload) {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {
  });
}
function processLoadRow(load) {
  if (!load.element || STATE.processedIds.has(load.id)) return;
  const enriched = enrichLoad(load, STATE.settings);
  if (!enriched.passesFilters && STATE.settings.hideBelowThreshold) return;
  const bar = renderLoadEnhancements(enriched, STATE.settings);
  if (enriched.passesFilters && STATE.settings.highlightGoodLoads) {
    bar.classList.add("le-chip-good");
  } else if (!enriched.passesFilters) {
    bar.classList.add("le-chip-weak");
  }
  STATE.overlay.mount(load.id, load.element, bar);
  STATE.processedIds.add(load.id);
  if (enriched.passesFilters) {
    notifyBackground("LOAD_MATCH", {
      id: enriched.id,
      origin: enriched.origin,
      destination: enriched.destination,
      rate: enriched.rate,
      miles: enriched.miles,
      rpm: enriched.rpm,
      broker: enriched.broker,
      equipment: enriched.equipment
    });
  }
}
function isDatSplash() {
  return /Loading DAT One/i.test(document.body?.textContent || "");
}
function datHasResultRows() {
  return document.querySelectorAll('[role="row"], .ag-row, table tbody tr').length >= 2 || /\b\d+\s+Results?\b/i.test(document.body?.textContent || "");
}
function isPageLoading() {
  if (isDatSplash()) return true;
  if (detectBoard() === "dat" && datHasResultRows()) return false;
  const agLoading = document.querySelector(".ag-overlay-loading-wrapper:not(.ag-hidden)");
  if (agLoading) {
    const style = getComputedStyle(agLoading);
    if (style.display !== "none" && style.visibility !== "hidden" && agLoading.offsetParent !== null) {
      return true;
    }
  }
  return false;
}
function findBoardRoot() {
  const board = detectBoard();
  if (board === "dat") {
    return document.querySelector(".ag-center-cols-container") || document.querySelector('[role="treegrid"]') || document.querySelector('[role="grid"]') || document.querySelector(".ag-root") || document.querySelector('[role="table"]');
  }
  return document.querySelector("table") || document.body;
}
function runScanWhenIdle(callback) {
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => callback(), { timeout: 2e3 });
    return;
  }
  callback();
}
function setToolbarStatus(text) {
  const countEl = document.getElementById("le-load-count");
  if (countEl) countEl.textContent = text;
}
async function scanPage(force = false) {
  if (!STATE.settings?.enabled || STATE.scanning) return;
  if (!force && isPageLoading()) {
    setToolbarStatus("waiting for board\u2026");
    return;
  }
  const now = Date.now();
  if (now - STATE.lastScanAt < SCAN_MIN_INTERVAL_MS) return;
  STATE.scanning = true;
  STATE.lastScanAt = now;
  setToolbarStatus("scanning\u2026");
  try {
    const root = findBoardRoot() || document.body;
    const loads = scanForLoads(root);
    for (let i = 0; i < loads.length; i += 1) {
      processLoadRow(loads[i]);
      if (i > 0 && i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    STATE.overlay.repositionAll();
    setToolbarStatus(loads.length > 0 ? `${loads.length} loads` : "0 loads \u2014 click Rescan");
  } finally {
    STATE.scanning = false;
  }
}
function scheduleScan() {
  if (STATE.scanTimer) clearTimeout(STATE.scanTimer);
  STATE.scanTimer = setTimeout(() => runScanWhenIdle(() => scanPage()), 800);
}
function resetEnhancements() {
  STATE.processedIds.clear();
  STATE.overlay?.clear();
}
function ensureToolbar() {
  let toolbar = document.getElementById("loadextension-toolbar");
  if (toolbar) return toolbar;
  toolbar = document.createElement("div");
  toolbar.id = "loadextension-toolbar";
  toolbar.className = "le-toolbar";
  toolbar.innerHTML = `
    <img src="${chrome.runtime.getURL("icons/icon16.png")}" alt="" width="16" height="16" />
    <strong>LoadExtension</strong>
    <span class="le-version">v${BUILD_VERSION}</span>
    <span id="le-load-count">starting\u2026</span>
    <button type="button" id="le-rescan-btn">Rescan</button>
  `;
  toolbar.querySelector("#le-rescan-btn")?.addEventListener("click", () => {
    resetEnhancements();
    STATE.lastScanAt = 0;
    scanPage(true);
  });
  document.documentElement.appendChild(toolbar);
  return toolbar;
}
function setupAutoRefresh() {
  if (STATE.refreshTimer) {
    clearInterval(STATE.refreshTimer);
    STATE.refreshTimer = null;
  }
  const seconds = Number(STATE.settings.autoRefreshSeconds) || 0;
  if (seconds > 0) {
    STATE.refreshTimer = setInterval(() => location.reload(), seconds * 1e3);
  }
}
function setupBoardObserver(root) {
  if (STATE.boardObserver) STATE.boardObserver.disconnect();
  STATE.boardObserver = new MutationObserver((mutations) => {
    const fromUs = mutations.every(
      (mutation) => [...mutation.addedNodes].every(
        (node) => node instanceof HTMLElement && (node.id === "loadextension-overlay-root" || node.id === "loadextension-toolbar" || node.classList?.contains("le-overlay-chip"))
      )
    );
    if (!fromUs) scheduleScan();
  });
  STATE.boardObserver.observe(root, { childList: true, subtree: true });
}
function setupDatScrollRescan() {
  if (detectBoard() !== "dat") return;
  window.addEventListener(
    "scroll",
    () => {
      if (STATE.scrollTimer) clearTimeout(STATE.scrollTimer);
      STATE.scrollTimer = setTimeout(() => scheduleScan(), 600);
    },
    true
  );
}
async function waitForBoard(maxMs = 8e3) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (findBoardRoot() || datHasResultRows()) {
      return findBoardRoot() || document.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return document.body;
}
async function init() {
  if (STATE.started) return;
  STATE.started = true;
  ensureToolbar();
  STATE.settings = await getSettings();
  if (!STATE.settings.enabled) {
    setToolbarStatus("disabled");
    return;
  }
  STATE.overlay = new OverlayManager();
  setToolbarStatus("waiting for board\u2026");
  const boardRoot = await waitForBoard();
  setTimeout(() => runScanWhenIdle(() => scanPage(true)), INITIAL_SCAN_DELAY_MS);
  setInterval(() => runScanWhenIdle(() => scanPage()), PERIODIC_SCAN_MS);
  if (boardRoot && detectBoard() !== "dat") {
    setupBoardObserver(boardRoot);
  }
  setupDatScrollRescan();
  setupAutoRefresh();
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.loadExtensionSettings) return;
  STATE.settings = changes.loadExtensionSettings.newValue;
  resetEnhancements();
  STATE.lastScanAt = 0;
  scheduleScan();
  setupAutoRefresh();
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "RESCAN") {
    resetEnhancements();
    STATE.lastScanAt = 0;
    scanPage(true).then(() => sendResponse({ ok: true, count: STATE.overlay?.count() ?? 0 }));
    return true;
  }
  if (message.type === "GET_STATUS") {
    sendResponse({
      enabled: STATE.settings?.enabled ?? false,
      loads: STATE.overlay?.count() ?? 0
    });
  }
});
async function boot() {
  ensureToolbar();
  if (document.readyState === "loading") {
    await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }
  await init();
}
export {
  BUILD_VERSION,
  boot
};
