import { getSettings, saveSettings } from "../shared/storage.js";

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
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
}

document.getElementById("enabled").addEventListener("change", async (event) => {
  await saveSettings({ enabled: event.target.checked });
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
