import { SEEN_LOADS_KEY } from "../shared/constants.js";
import { formatLoadAlert, sendTelegramMessage } from "../shared/telegram.js";
import { getLocal, getSettings, setLocal } from "../shared/storage.js";
import {
  creditCacheKey,
  getCachedCredit,
  setCachedCredit
} from "../shared/credit-cache.js";
import { buildRtsProSearchUrl, lookupBrokerCredit } from "../shared/rts.js";
import { hasRtsSession, lookupRtsViaSession } from "../shared/rts-session.js";
import { calculateRouteTolls } from "../shared/toll.js";

const SEEN_TTL_MS = 24 * 60 * 60 * 1000;
const TOLL_CACHE_KEY = "loadExtensionTollCache";
const TOLL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

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

  if (settings.rts?.enabled && (await hasRtsSession())) {
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
    needsLogin: !(await hasRtsSession()),
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
    handleLoadMatch(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    getSettings().then((settings) => sendResponse({ settings }));
    return true;
  }

  if (message.type === "GET_RTS_STATUS") {
    hasRtsSession()
      .then((connected) => sendResponse({ ok: true, connected }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_CREDIT") {
    lookupCredit(message.payload)
      .then((credit) => sendResponse({ ok: true, credit }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_TOLLS") {
    lookupTolls(message.payload)
      .then((toll) => sendResponse({ ok: true, toll }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "CACHE_CREDIT") {
    const key = creditCacheKey(message.payload);
    setCachedCredit(setLocal, getLocal, key, message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.info("[LoadExtension] installed");
});
