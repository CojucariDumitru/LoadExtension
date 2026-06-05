import { getSettings, saveSettings } from "../shared/storage.js";

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
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

async function refreshStatus() {
  const settings = await getSettings();
  document.getElementById("enabled").checked = settings.enabled;
  document.getElementById("min-rpm").textContent = settings.minRpm;

  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: "GET_STATUS" });
    document.getElementById("load-count").textContent = status.loads ?? 0;
  } catch {
    document.getElementById("load-count").textContent = "—";
  }

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
  if (!tab?.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: "RESCAN" });
  await refreshStatus();
});

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refreshStatus();
