import { getSettings } from "../shared/storage.js";
import { detectBoard, scanForLoads } from "./parsers.js";
import { enrichLoad, renderLoadEnhancements } from "./ui.js";
import { OverlayManager } from "./overlay.js";

const SCAN_MIN_INTERVAL_MS = 2000;
const INITIAL_SCAN_DELAY_MS = 3000;
const PERIODIC_SCAN_MS = 8000;

const STATE = {
  settings: null,
  refreshTimer: null,
  scanTimer: null,
  overlay: null,
  boardObserver: null,
  processedIds: new Set(),
  scanning: false,
  lastScanAt: 0
};

function notifyBackground(type, payload) {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {});
}

function processLoadRow(load) {
  if (!load.element || STATE.processedIds.has(load.id)) return;

  const enriched = enrichLoad(load, STATE.settings);
  if (!enriched.passesFilters && STATE.settings.hideBelowThreshold) return;

  const bar = renderLoadEnhancements(enriched, STATE.settings);
  if (enriched.passesFilters && STATE.settings.highlightGoodLoads) {
    bar.classList.add("le-chip-good");
  } else if (!enriched.passesFilters) {
    bar.classList.add("le-chip-weak");
  }
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

function isPageLoading() {
  return Boolean(
    document.querySelector('[aria-busy="true"]') ||
    document.querySelector(
      '[class*="loading" i], [class*="spinner" i], [class*="skeleton" i], [data-testid*="loading" i]'
    )
  );
}

function findBoardRoot() {
  const board = detectBoard();
  if (board === "dat") {
    return document.querySelector('[role="grid"]') || document.querySelector('[role="table"]');
  }
  return document.querySelector("table") || document.body;
}

function runScanWhenIdle(callback) {
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => callback(), { timeout: 2000 });
    return;
  }
  callback();
}

function scanPage() {
  if (!STATE.settings?.enabled || STATE.scanning || isPageLoading()) return;

  const now = Date.now();
  if (now - STATE.lastScanAt < SCAN_MIN_INTERVAL_MS) return;

  STATE.scanning = true;
  STATE.lastScanAt = now;

  try {
    const root = findBoardRoot() || document.body;
    const loads = scanForLoads(root);
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
  STATE.scanTimer = setTimeout(() => runScanWhenIdle(scanPage), 1200);
}

function resetEnhancements() {
  STATE.processedIds.clear();
  STATE.overlay.clear();
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

function setupBoardObserver(root) {
  if (STATE.boardObserver) STATE.boardObserver.disconnect();

  STATE.boardObserver = new MutationObserver((mutations) => {
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

  STATE.boardObserver.observe(root, { childList: true, subtree: true });
}

async function waitForBoard(maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const root = findBoardRoot();
    if (root && !isPageLoading()) return root;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return findBoardRoot();
}

async function init() {
  STATE.settings = await getSettings();
  STATE.overlay = new OverlayManager();

  if (!STATE.settings.enabled) return;

  const boardRoot = await waitForBoard();
  setTimeout(() => runScanWhenIdle(scanPage), INITIAL_SCAN_DELAY_MS);
  setInterval(() => runScanWhenIdle(scanPage), PERIODIC_SCAN_MS);
  if (boardRoot) setupBoardObserver(boardRoot);
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
