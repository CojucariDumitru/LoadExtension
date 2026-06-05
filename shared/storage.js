import { DEFAULT_SETTINGS, STORAGE_KEY } from "./constants.js";

export async function getSettings() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] || {}) };
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

export async function getLocal(key, fallback = {}) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? fallback;
}

export async function setLocal(key, value) {
  await chrome.storage.local.set({ [key]: value });
}
