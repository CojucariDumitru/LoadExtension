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
var SEEN_LOADS_KEY = "loadExtensionSeenLoads";

// shared/telegram.js
async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) {
    throw new Error("Telegram bot token and chat ID are required.");
  }
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${body}`);
  }
  return response.json();
}
function formatLoadAlert(load) {
  const lines = [
    "New matching load",
    `${load.origin || "?"} \u2192 ${load.destination || "?"}`,
    `Rate: $${load.rate || "?"}`,
    `Miles: ${load.miles || "?"}`,
    `RPM+: ${load.rpm != null ? load.rpm.toFixed(2) : "?"}`,
    load.broker ? `Broker: ${load.broker}` : null,
    load.equipment ? `Eq: ${load.equipment}` : null
  ].filter(Boolean);
  return lines.join("\n");
}

// shared/storage.js
async function getSettings() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] || {} };
}
async function getLocal(key, fallback = {}) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? fallback;
}
async function setLocal(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// shared/credit-cache.js
var CREDIT_CACHE_KEY = "loadExtensionCreditCache";
var CREDIT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
function creditCacheKey({ mcNumber, dotNumber, brokerName }) {
  if (mcNumber) return `mc:${mcNumber}`;
  if (dotNumber) return `dot:${dotNumber}`;
  if (brokerName) return `name:${brokerName.trim().toLowerCase()}`;
  return null;
}
async function getCachedCredit(getLocal2, key) {
  if (!key) return null;
  const cache = await getLocal2(CREDIT_CACHE_KEY, {});
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CREDIT_CACHE_TTL_MS) return null;
  return entry;
}
async function setCachedCredit(setLocal2, getLocal2, key, credit) {
  if (!key) return;
  const cache = await getLocal2(CREDIT_CACHE_KEY, {});
  cache[key] = { ...credit, fetchedAt: Date.now() };
  await setLocal2(CREDIT_CACHE_KEY, cache);
}

// shared/rts.js
var SOAP_URL = "http://webservice.rtscredit.com/CreditReport.asmx";
var SOAP_NS = "http://tempuri.org/";
function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function buildEnvelope(action, body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/soap/envelope/">
  <soap12:Body>
    <${action} xmlns="${SOAP_NS}">
      ${body}
    </${action}>
  </soap12:Body>
</soap12:Envelope>`;
}
async function soapCall(action, body) {
  const response = await fetch(SOAP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8",
      SOAPAction: `${SOAP_NS}${action}`
    },
    body: buildEnvelope(action, body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`RTS SOAP ${action} failed (${response.status})`);
  }
  return text;
}
function readTag(xml, tag) {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)</(?:\\w+:)?${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1].trim() : "";
}
function parseLogin(xml) {
  const userIsValid = readTag(xml, "UserIsValid").toLowerCase() === "true";
  const token = readTag(xml, "UserToken");
  const code = readTag(xml, "Code");
  const description = readTag(xml, "Description");
  if (!userIsValid || !token) {
    throw new Error(description || code || "RTS login failed");
  }
  return token;
}
function parseBrokerList(xml) {
  const brokers = [];
  const blockRe = /<Broker\b[^>]*>([\s\S]*?)<\/Broker>/gi;
  let match;
  while (match = blockRe.exec(xml)) {
    const block = match[1];
    const broker = {};
    for (const tag of ["ID", "Name", "MCNumber", "City", "St", "Zip", "CreditScore", "Grade"]) {
      broker[tag] = readTag(block, tag);
    }
    if (broker.ID || broker.Name || broker.MCNumber) brokers.push(broker);
  }
  return brokers;
}
function parseBrokerDetail(xml) {
  const detailBlock = xml.match(/<BrokerDetail\b[^>]*>([\s\S]*?)<\/BrokerDetail>/i);
  const block = detailBlock ? detailBlock[1] : xml;
  const fields = [
    "Name",
    "MCNumber",
    "DOTNumber",
    "CreditScore",
    "Grade",
    "AverageDaysToPay",
    "LastActivity",
    "City",
    "St"
  ];
  const detail = {};
  for (const tag of fields) {
    detail[tag] = readTag(block, tag);
  }
  return detail;
}
function normalizeRtsCredit(detail, source = "rts-soap") {
  return {
    grade: detail.Grade || detail.CreditScore || "",
    averageDaysToPay: Number(detail.AverageDaysToPay) || null,
    brokerName: detail.Name || "",
    mcNumber: detail.MCNumber || "",
    dotNumber: detail.DOTNumber || "",
    city: detail.City || "",
    state: detail.St || "",
    source
  };
}
var cachedToken = null;
var tokenFetchedAt = 0;
var TOKEN_TTL_MS = 20 * 60 * 60 * 1e3;
async function getToken(userId, userPass) {
  if (cachedToken && Date.now() - tokenFetchedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }
  const xml = await soapCall(
    "Login",
    `<UserID>${escapeXml(userId)}</UserID><UserPass>${escapeXml(userPass)}</UserPass>`
  );
  cachedToken = parseLogin(xml);
  tokenFetchedAt = Date.now();
  return cachedToken;
}
async function lookupBrokerCredit({ userId, userPass, mcNumber, brokerName }) {
  if (!userId || !userPass) {
    throw new Error("RTS webservice User ID and password are required.");
  }
  const token = await getToken(userId, userPass);
  let searchXml;
  if (mcNumber) {
    searchXml = await soapCall(
      "BrokerSearchByMC",
      `<UserToken>${escapeXml(token)}</UserToken><MCNumber>${escapeXml(mcNumber)}</MCNumber>`
    );
  } else if (brokerName) {
    searchXml = await soapCall(
      "BrokerSearchByName",
      `<UserToken>${escapeXml(token)}</UserToken><Name>${escapeXml(brokerName)}</Name>`
    );
  } else {
    throw new Error("Broker MC number or name is required for RTS lookup.");
  }
  const brokers = parseBrokerList(searchXml);
  if (!brokers.length) {
    return null;
  }
  const broker = brokers[0];
  const detailXml = await soapCall(
    "GetBrokerDetail",
    `<UserToken>${escapeXml(token)}</UserToken><ID>${escapeXml(broker.ID)}</ID>`
  );
  const detail = parseBrokerDetail(detailXml);
  return normalizeRtsCredit({ ...broker, ...detail });
}
function buildRtsProSearchUrl({ mcNumber, dotNumber, brokerName }) {
  const base = "https://rtspro.com/credit/search";
  const params = new URLSearchParams();
  if (mcNumber) params.set("mc", mcNumber);
  if (dotNumber) params.set("dot", dotNumber);
  if (brokerName) params.set("q", brokerName);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

// shared/rts-session.js
async function hasRtsSession() {
  const cookies = await chrome.cookies.getAll({ domain: "rtspro.com" });
  if (!cookies.length) return false;
  return cookies.some(
    (cookie) => /session|auth|token|aspnet|jwt|sid/i.test(cookie.name)
  );
}
async function getRtsCookieHeader() {
  const cookies = await chrome.cookies.getAll({ domain: "rtspro.com" });
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
function walkForCredit(node, results = []) {
  if (!node || typeof node !== "object") return results;
  if (Array.isArray(node)) {
    node.forEach((item) => walkForCredit(item, results));
    return results;
  }
  const keys = Object.keys(node);
  const lower = Object.fromEntries(keys.map((k) => [k.toLowerCase(), node[k]]));
  const mc = lower.mcnumber || lower.mc || lower.motorcarrier || lower.brokermc;
  const grade = lower.grade || lower.creditgrade || lower.rating;
  const score = lower.creditscore || lower.score;
  const days = lower.averagedaystopay || lower.avgdaystopay || lower.daystopay;
  if (mc || grade || score) {
    results.push({
      mcNumber: String(mc || ""),
      grade: grade ? String(grade).toUpperCase() : score ? String(score) : "",
      averageDaysToPay: days != null ? Number(days) : null,
      brokerName: lower.name || lower.companyname || lower.legalname || "",
      dotNumber: lower.dotnumber || lower.dot || ""
    });
  }
  for (const value of Object.values(node)) {
    walkForCredit(value, results);
  }
  return results;
}
function extractCreditsFromPayload(data) {
  return walkForCredit(data).filter((entry) => entry.grade || entry.mcNumber);
}
async function lookupRtsViaSession({ mcNumber, brokerName }) {
  const cookie = await getRtsCookieHeader();
  if (!cookie) return null;
  const attempts = [];
  if (mcNumber) {
    attempts.push(`https://rtspro.com/api/credit/search?mc=${encodeURIComponent(mcNumber)}`);
    attempts.push(`https://rtspro.com/api/credit/broker?mcNumber=${encodeURIComponent(mcNumber)}`);
    attempts.push(`https://rtspro.com/credit/api/search?searchTerm=${encodeURIComponent(mcNumber)}`);
  }
  if (brokerName) {
    attempts.push(`https://rtspro.com/api/credit/search?name=${encodeURIComponent(brokerName)}`);
  }
  for (const url of attempts) {
    try {
      const response = await fetch(url, {
        headers: { Cookie: cookie, Accept: "application/json" },
        credentials: "include"
      });
      if (!response.ok) continue;
      const data = await response.json();
      const credits = extractCreditsFromPayload(data);
      if (credits.length) return credits[0];
    } catch {
    }
  }
  return null;
}

// shared/toll.js
var TOLLGURU_URL = "https://apis.tollguru.com/toll/v2/origin-destination-waypoints";
var AXLE_TYPES = {
  2: "2AxlesTruck",
  3: "3AxlesTruck",
  4: "4AxlesTruck",
  5: "5AxlesTruck",
  6: "6AxlesTruck",
  7: "7AxlesTruck",
  8: "8AxlesTruck",
  9: "9AxlesTruck"
};
function addressPayload(label) {
  return { address: label };
}
async function calculateRouteTolls({
  apiKey,
  deadheadCity,
  deadheadState,
  origin,
  destination,
  truckAxles = 5
}) {
  if (!apiKey) {
    throw new Error("TollGuru API key is required.");
  }
  if (!origin || !destination) {
    throw new Error("Origin and destination are required for toll calculation.");
  }
  const waypoints = [];
  if (deadheadCity && deadheadState) {
    waypoints.push(addressPayload(`${deadheadCity}, ${deadheadState}`));
  }
  const body = {
    from: addressPayload(origin),
    to: addressPayload(destination),
    serviceProvider: "here",
    vehicle: {
      type: AXLE_TYPES[truckAxles] || "5AxlesTruck"
    }
  };
  if (waypoints.length) {
    body.waypoints = waypoints;
  }
  const response = await fetch(TOLLGURU_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `TollGuru error (${response.status})`);
  }
  const route = data?.routes?.[0];
  const costs = route?.summary?.costs || route?.costs || {};
  const tollCost = costs.tag ?? costs.minimumTollCost ?? costs.tagAndCash ?? costs.cash ?? null;
  return {
    tollCost: tollCost != null ? Number(tollCost) : null,
    fuelCost: costs.fuel != null ? Number(costs.fuel) : null,
    distanceText: route?.summary?.distance?.text || "",
    durationText: route?.summary?.duration?.text || "",
    hasTolls: Boolean(route?.summary?.hasTolls)
  };
}

// background/service-worker.js
var SEEN_TTL_MS = 24 * 60 * 60 * 1e3;
var TOLL_CACHE_KEY = "loadExtensionTollCache";
var TOLL_CACHE_TTL_MS = 12 * 60 * 60 * 1e3;
async function pruneSeenLoads(seen) {
  const now = Date.now();
  const next = {};
  for (const [id, timestamp] of Object.entries(seen)) {
    if (now - timestamp < SEEN_TTL_MS) next[id] = timestamp;
  }
  return next;
}
async function handleLoadMatch(load) {
  const settings = await getSettings();
  if (!settings.enabled) return;
  let seen = await getLocal(SEEN_LOADS_KEY, {});
  seen = await pruneSeenLoads(seen);
  if (seen[load.id]) return;
  seen[load.id] = Date.now();
  await setLocal(SEEN_LOADS_KEY, seen);
  if (settings.telegram?.enabled) {
    try {
      await sendTelegramMessage(
        settings.telegram.botToken,
        settings.telegram.chatId,
        formatLoadAlert(load)
      );
    } catch (error) {
      console.error("[LoadExtension] Telegram alert failed:", error);
    }
  }
}
async function lookupCredit(payload) {
  const settings = await getSettings();
  const key = creditCacheKey(payload);
  const cached = await getCachedCredit(getLocal, key);
  if (cached && !cached.pending) return cached;
  if (settings.rts?.enabled && await hasRtsSession()) {
    try {
      const credit = await lookupRtsViaSession(payload);
      if (credit) {
        await setCachedCredit(setLocal, getLocal, key, credit);
        return credit;
      }
    } catch (error) {
      console.warn("[LoadExtension] RTS session lookup failed:", error.message);
    }
  }
  if (settings.rts?.userId && settings.rts?.userPass) {
    try {
      const credit = await lookupBrokerCredit({
        userId: settings.rts.userId,
        userPass: settings.rts.userPass,
        mcNumber: payload.mcNumber,
        brokerName: payload.brokerName
      });
      if (credit) {
        await setCachedCredit(setLocal, getLocal, key, credit);
        return credit;
      }
    } catch (error) {
      console.warn("[LoadExtension] RTS SOAP lookup failed:", error.message);
    }
  }
  return {
    pending: true,
    needsLogin: !await hasRtsSession(),
    rtsUrl: buildRtsProSearchUrl(payload)
  };
}
async function lookupTolls(payload) {
  const settings = await getSettings();
  if (!settings.tollguru?.enabled || !settings.tollguru.apiKey) {
    return null;
  }
  const cacheKey = `${payload.origin}|${payload.destination}|${settings.deadheadCity}|${settings.deadheadState}|${settings.tollguru.truckAxles}`;
  const cache = await getLocal(TOLL_CACHE_KEY, {});
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < TOLL_CACHE_TTL_MS) {
    return cached;
  }
  const toll = await calculateRouteTolls({
    apiKey: settings.tollguru.apiKey,
    deadheadCity: settings.deadheadCity,
    deadheadState: settings.deadheadState,
    origin: payload.origin,
    destination: payload.destination,
    truckAxles: settings.tollguru.truckAxles
  });
  cache[cacheKey] = { ...toll, fetchedAt: Date.now() };
  await setLocal(TOLL_CACHE_KEY, cache);
  return toll;
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "LOAD_MATCH") {
    handleLoadMatch(message.payload).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "GET_SETTINGS") {
    getSettings().then((settings) => sendResponse({ settings }));
    return true;
  }
  if (message.type === "GET_RTS_STATUS") {
    hasRtsSession().then((connected) => sendResponse({ ok: true, connected })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "GET_CREDIT") {
    lookupCredit(message.payload).then((credit) => sendResponse({ ok: true, credit })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "GET_TOLLS") {
    lookupTolls(message.payload).then((toll) => sendResponse({ ok: true, toll })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "CACHE_CREDIT") {
    const key = creditCacheKey(message.payload);
    setCachedCredit(setLocal, getLocal, key, message.payload).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
chrome.runtime.onInstalled.addListener(() => {
  console.info("[LoadExtension] installed");
});
