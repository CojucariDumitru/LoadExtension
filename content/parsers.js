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

function guessRate(text) {
  const dollarMatches = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)];
  if (!dollarMatches.length) return 0;
  return Math.max(...dollarMatches.map((m) => parseMoney(m[1])));
}

function guessMiles(text) {
  const mileMatches = [...text.matchAll(/([\d,]+)\s*(?:mi|miles)\b/gi)];
  for (const match of mileMatches) {
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

function isSafeRowElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.id === "loadextension-overlay-root") return false;
  if (element.closest("#loadextension-overlay-root, #loadextension-toolbar, .le-overlay-chip")) {
    return false;
  }
  if (element.matches("thead, th, script, style, nav, header, footer, html, body")) return false;

  const rect = element.getBoundingClientRect();
  if (rect.height < 28 || rect.height > 160) return false;
  if (rect.width < 200) return false;

  if (element.querySelector('[role="row"], tr, .le-overlay-chip')) return false;
  if (element.children.length > 30) return false;

  return true;
}

function isLikelyLoadRow(element) {
  if (!isSafeRowElement(element)) return false;

  const text = element.innerText || "";
  if (text.length < 24 || text.length > 900) return false;

  const cities = extractCityPairs(text);
  if (cities.length < 2) return false;

  return guessRate(text) > 0 || guessMiles(text) > 0;
}

function selectorsForBoard(board) {
  if (board === "dat") {
    return ['[role="grid"] [role="row"]', '[role="table"] [role="row"]', "table tbody tr"];
  }
  if (board === "truckstop") {
    return ["table tbody tr", '[role="row"]'];
  }
  return ["table tbody tr", '[role="row"]'];
}

function findRowCandidates(root) {
  const board = detectBoard();
  const selectors = selectorsForBoard(board);
  const seen = new Set();
  const rows = [];

  for (const selector of selectors) {
    for (const el of root.querySelectorAll(selector)) {
      if (seen.has(el) || !isLikelyLoadRow(el)) continue;
      seen.add(el);
      rows.push(el);
    }
  }

  return rows;
}

export function parseLoadFromElement(element) {
  const text = element.innerText || "";
  const cities = extractCityPairs(text);
  const origin = cities[0]?.label || "";
  const destination = cities[1]?.label || "";
  const rate = guessRate(text);
  const miles = guessMiles(text);
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
  return findRowCandidates(root)
    .map(parseLoadFromElement)
    .filter((load) => load.origin && load.destination);
}
