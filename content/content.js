import { getSettings } from "../shared/storage.js";
import { scanForLoads } from "./parsers.js";
import { applyRowStyles, enrichLoad, renderLoadEnhancements } from "./ui.js";

const STATE = {
  settings: null,
  refreshTimer: null,
  observer: null
};

function notifyBackground(type, payload) {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {});
}

function processLoadRow(load) {
  if (!load.element || load.element.querySelector(".le-load-bar")) return;

  const enriched = enrichLoad(load, STATE.settings);
  applyRowStyles(load.element, enriched, STATE.settings);
  load.element.appendChild(renderLoadEnhancements(enriched, STATE.settings));

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
  if (!STATE.settings?.enabled) return;

  const loads = scanForLoads(document.body);
  for (const load of loads) {
    processLoadRow(load);
  }

  updateToolbar(loads.length);
}

function updateToolbar(count) {
  let toolbar = document.getElementById("loadextension-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.id = "loadextension-toolbar";
    toolbar.className = "le-toolbar";
    document.body.appendChild(toolbar);
  }

  toolbar.innerHTML = `
    <strong>LoadExtension</strong>
    <span>${count} loads scanned</span>
    <span>Min RPM: ${STATE.settings.minRpm}</span>
    <button type="button" id="le-rescan-btn">Rescan</button>
  `;

  toolbar.querySelector("#le-rescan-btn")?.addEventListener("click", () => {
    document.querySelectorAll("[data-loadextension-processed]").forEach((el) => {
      el.classList.remove("le-row-good", "le-row-weak", "le-row-hidden");
      el.removeAttribute("data-loadextension-processed");
      el.querySelector(".le-load-bar")?.remove();
    });
    scanPage();
  });
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

function setupObserver() {
  if (STATE.observer) STATE.observer.disconnect();

  STATE.observer = new MutationObserver(() => {
    scanPage();
  });

  STATE.observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

async function init() {
  STATE.settings = await getSettings();
  if (!STATE.settings.enabled) return;

  scanPage();
  setupObserver();
  setupAutoRefresh();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.loadExtensionSettings) return;
  STATE.settings = changes.loadExtensionSettings.newValue;
  document.querySelectorAll("[data-loadextension-processed]").forEach((el) => {
    el.classList.remove("le-row-good", "le-row-weak", "le-row-hidden");
    el.removeAttribute("data-loadextension-processed");
    el.querySelector(".le-load-bar")?.remove();
  });
  scanPage();
  setupAutoRefresh();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "RESCAN") {
    scanPage();
    sendResponse({ ok: true, count: document.querySelectorAll(".le-load-bar").length });
  }
  if (message.type === "GET_STATUS") {
    sendResponse({
      enabled: STATE.settings?.enabled ?? false,
      loads: document.querySelectorAll(".le-load-bar").length
    });
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
