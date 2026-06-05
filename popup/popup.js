import { getSettings, saveSettings } from "../shared/storage.js";

const LOAD_BOARD_RE =
  /^https:\/\/(one\.dat\.com|power\.dat\.com|([a-z0-9-]+\.)*truckstop\.com|([a-z0-9-]+\.)*trucksmarter\.com)\//i;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isLoadBoardTab(tab) {
  return Boolean(tab?.url && LOAD_BOARD_RE.test(tab.url));
}

async function refreshRtsStatus() {
  const el = document.getElementById("rts-status");
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_RTS_STATUS" });
    if (response?.connected) {
      el.textContent = "RTS: connected";
      el.className = "rts-status connected";
    } else {
      el.textContent = "RTS: not connected";
      el.className = "rts-status disconnected";
    }
  } catch {
    el.textContent = "RTS: unknown";
    el.className = "rts-status";
  }
}

async function queryTabStatus(tab) {
  if (!isLoadBoardTab(tab)) {
    return { loads: null, hint: "open DAT search" };
  }

  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: "GET_STATUS" });
    return { loads: status?.loads ?? 0, hint: null };
  } catch {
    return { loads: null, hint: "reload DAT tab" };
  }
}

async function refreshStatus() {
  const settings = await getSettings();
  document.getElementById("enabled").checked = settings.enabled;
  document.getElementById("min-rpm").textContent = settings.minRpm;

  const tab = await getActiveTab();
  const loadCountEl = document.getElementById("load-count");

  if (!tab?.id) {
    loadCountEl.textContent = "—";
    await refreshRtsStatus();
    return;
  }

  const { loads, hint } = await queryTabStatus(tab);
  loadCountEl.textContent = hint || String(loads ?? 0);

  await refreshRtsStatus();
}

document.getElementById("enabled").addEventListener("change", async (event) => {
  await saveSettings({ enabled: event.target.checked });
});

document.getElementById("connect-rts").addEventListener("click", async () => {
  await chrome.tabs.create({ url: "https://rtspro.com/credit/search" });
  setTimeout(refreshRtsStatus, 3000);
});

document.getElementById("rescan").addEventListener("click", async () => {
  const tab = await getActiveTab();
  const loadCountEl = document.getElementById("load-count");

  if (!tab?.id) return;

  if (!isLoadBoardTab(tab)) {
    loadCountEl.textContent = "open DAT search";
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "RESCAN" });
    await refreshStatus();
  } catch {
    loadCountEl.textContent = "reload DAT tab";
  }
});

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refreshStatus();
