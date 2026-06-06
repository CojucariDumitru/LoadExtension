import { parseMoney, parseMiles } from "../shared/rpm.js";

const CITY_STATE_RE = /([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2})\b/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const DOT_RE = /\b(?:USDOT|DOT)\s*#?\s*(\d{5,8})\b/i;

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
  const rates = plainMatches
    .map((m) => parseMoney(m[1]))
    .filter((value) => value >= 150 && value <= 25000);
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

export function detectBoard() {
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
  const isRow =
    role === "row" ||
    element.classList.contains("ag-row") ||
    element.matches("table tbody tr");

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
  if (text.length < 12 || text.length > 2000) return false;
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

const MAX_ROWS_PER_SCAN = 150;

function findRowCandidates(root) {
  const board = detectBoard();
  const selectors = selectorsForBoard(board);
  const seen = new Set();
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

export function parseLoadFromElement(element) {
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

  const brokerLine = text
    .split(/\s{2,}|\n/)
    .map((line) => line.trim())
    .find((line) => /logistics|freight|transport|broker|inc\.?|llc|services/i.test(line));

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

function scanDatExpandedPanels() {
  const loads = [];

  for (const el of document.querySelectorAll("div, section, article")) {
    if (el.closest("#loadextension-overlay-root, #loadextension-toolbar")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height < 150 || rect.width < 480) continue;

    const text = rowText(el);
    if (!/factoring eligible|rate\s*\/\s*mile|view route/i.test(text)) continue;

    const cities = extractCityPairs(text);
    if (cities.length < 2) continue;

    const rate = guessRate(text, "dat");
    const miles = guessMiles(text, "dat");
    if (!rate || !miles) continue;

    const load = parseLoadFromElement(el);
    if (load.origin && load.destination) loads.push(load);
  }

  return loads;
}

export function scanForLoads(root = document.body) {
  const roots = [root];
  if (detectBoard() === "dat" && root !== document.body) {
    roots.push(document.body);
  }

  const seen = new Set();
  const loads = [];

  for (const scanRoot of roots) {
    for (const load of findRowCandidates(scanRoot).map(parseLoadFromElement)) {
      if (!load.origin || !load.destination || seen.has(load.id)) continue;
      seen.add(load.id);
      loads.push(load);
    }
  }

  if (detectBoard() === "dat") {
    for (const load of scanDatExpandedPanels()) {
      if (!load.origin || !load.destination || seen.has(load.id)) continue;
      seen.add(load.id);
      loads.push(load);
    }
  }

  return loads;
}
