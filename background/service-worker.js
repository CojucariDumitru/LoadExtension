import { SEEN_LOADS_KEY } from "../shared/constants.js";
import { formatLoadAlert, sendTelegramMessage } from "../shared/telegram.js";
import { getLocal, getSettings, setLocal } from "../shared/storage.js";

const SEEN_TTL_MS = 24 * 60 * 60 * 1000;

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
});

chrome.runtime.onInstalled.addListener(() => {
  console.info("[LoadExtension] installed");
});
