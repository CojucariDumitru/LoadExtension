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
  const types = ["Van", "Reefer", "Flatbed", "Stepdeck", "Power Only", "Box Truck", "Hotshot"];
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
  return element.textContent || "";
}

function isAgGridRow(element) {
  return element.classList?.contains("ag-row") && element.getAttribute("role") === "row";
}

function isSafeRowElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.id === "loadextension-overlay-root") return false;
  if (element.closest("#loadextension-overlay-root, #loadextension-toolbar, .le-overlay-chip")) {
    return false;
  }
  if (element.matches("thead, th, script, style, nav, header, footer, html, body")) return false;

  const board = detectBoard();
  if (board === "dat" && isAgGridRow(element)) {
    const rect = element.getBoundingClientRect();
    return rect.height >= 20 && rect.height <= 200 && rect.width >= 100;
  }

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
  if (text.length < 16 || text.length > 1200) return false;

  const cities = extractCityPairs(text);
  if (cities.length < 2) return false;

  return guessRate(text, board) > 0 || guessMiles(text, board) > 0;
}

function selectorsForBoard(board) {
  if (board === "dat") {
    return [
      ".ag-center-cols-container .ag-row",
      '.ag-row[role="row"]',
      '[role="treegrid"] [role="row"]',
      '[role="grid"] [role="row"]',
      '[role="table"] [role="row"]',
      "table tbody tr"
    ];
  }
  if (board === "truckstop") {
    return ["table tbody tr", '[role="row"]'];
  }
  return ["table tbody tr", '[role="row"]'];
}

const MAX_ROWS_PER_SCAN = 120;

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
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /broker|logistics|freight|transport|inc\.?|llc/i.test(line));

  return {
    id: uniqueId([origin, destination, rate, miles, brokerLine]),
    origin,
    originCity: cities[0]?.city || "",
    originState: cities[0]?.state || "",
    destination,
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

export function scanForLoads(root = document.body) {
  const board = detectBoard();
  const roots = [root];

  if (board === "dat" && root !== document.body) {
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

  return loads;
}
