import { getSettings } from "../shared/storage.js";
import { scanForLoads } from "./parsers.js";
import { applyRowStyles, enrichLoad, renderLoadEnhancements } from "./ui.js";
import { OverlayManager } from "./overlay.js";

const STATE = {
  settings: null,
  refreshTimer: null,
  scanTimer: null,
  overlay: null,
  processedIds: new Set(),
  scanning: false
};

function notifyBackground(type, payload) {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {});
}

function processLoadRow(load) {
  if (!load.element || STATE.processedIds.has(load.id)) return;

  const enriched = enrichLoad(load, STATE.settings);
  applyRowStyles(load.element, enriched, STATE.settings);

  const bar = renderLoadEnhancements(enriched, STATE.settings);
  STATE.overlay.mount(load.id, load.element, bar);
  STATE.processedIds.add(load.id);

  if (enriched.passesFilters) {
    notifyBackground("LOAD_MATCH", {
      id: enriched.id,
      origin: enriched.origin,
      destination: enriched.destination,
      rate: enriched.rate,
      miles: enriched.miles,
      rpm: enriched.rpm,
      broker: enriched.broker,
      equipment: enriched.equipment
    });
  }
}

function scanPage() {
  if (!STATE.settings?.enabled || STATE.scanning) return;
  STATE.scanning = true;

  try {
    const loads = scanForLoads(document.body);
    for (const load of loads) {
      processLoadRow(load);
    }
    STATE.overlay.repositionAll();
    updateToolbar(loads.length);
  } finally {
    STATE.scanning = false;
  }
}

function scheduleScan() {
  if (STATE.scanTimer) clearTimeout(STATE.scanTimer);
  STATE.scanTimer = setTimeout(scanPage, 800);
}

function resetEnhancements() {
  STATE.processedIds.clear();
  STATE.overlay.clear();
  document.querySelectorAll(".le-row-good, .le-row-weak, .le-row-dim").forEach((el) => {
    el.classList.remove("le-row-good", "le-row-weak", "le-row-dim");
  });
}

function updateToolbar(count) {
  let toolbar = document.getElementById("loadextension-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.id = "loadextension-toolbar";
    toolbar.className = "le-toolbar";
    document.documentElement.appendChild(toolbar);
  }

  const rescanBtn = toolbar.querySelector("#le-rescan-btn");
  if (!rescanBtn) {
    toolbar.innerHTML = `
      <img src="${chrome.runtime.getURL("icons/icon16.png")}" alt="" width="16" height="16" />
      <strong>LoadExtension</strong>
      <span id="le-load-count">0 loads</span>
      <button type="button" id="le-rescan-btn">Rescan</button>
    `;
    toolbar.querySelector("#le-rescan-btn")?.addEventListener("click", () => {
      resetEnhancements();
      scanPage();
    });
  }

  toolbar.querySelector("#le-load-count").textContent = `${count} loads`;
}

function setupAutoRefresh() {
  if (STATE.refreshTimer) {
    clearInterval(STATE.refreshTimer);
    STATE.refreshTimer = null;
  }

  const seconds = Number(STATE.settings.autoRefreshSeconds) || 0;
  if (seconds > 0) {
    STATE.refreshTimer = setInterval(() => location.reload(), seconds * 1000);
  }
}

function setupLightObserver() {
  const observer = new MutationObserver((mutations) => {
    const fromUs = mutations.every((mutation) =>
      [...mutation.addedNodes].every(
        (node) =>
          node instanceof HTMLElement &&
          (node.id === "loadextension-overlay-root" ||
            node.id === "loadextension-toolbar" ||
            node.classList?.contains("le-overlay-chip"))
      )
    );
    if (!fromUs) scheduleScan();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

async function init() {
  STATE.settings = await getSettings();
  STATE.overlay = new OverlayManager();

  if (!STATE.settings.enabled) return;

  setTimeout(scanPage, 1500);
  setInterval(scanPage, 5000);
  setupLightObserver();
  setupAutoRefresh();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.loadExtensionSettings) return;
  STATE.settings = changes.loadExtensionSettings.newValue;
  resetEnhancements();
  scheduleScan();
  setupAutoRefresh();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "RESCAN") {
    resetEnhancements();
    scanPage();
    sendResponse({ ok: true, count: STATE.overlay.count() });
  }
  if (message.type === "GET_STATUS") {
    sendResponse({
      enabled: STATE.settings?.enabled ?? false,
      loads: STATE.overlay?.count() ?? 0
    });
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
