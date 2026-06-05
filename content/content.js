import { getSettings } from "../shared/storage.js";
import { detectBoard, scanForLoads } from "./parsers.js";
import { enrichLoad, renderLoadEnhancements } from "./ui.js";
import { OverlayManager } from "./overlay.js";

export const BUILD_VERSION = "0.4.1";

const SCAN_MIN_INTERVAL_MS = 3000;
const INITIAL_SCAN_DELAY_MS = 2000;
const PERIODIC_SCAN_MS = 12000;

const STATE = {
  settings: null,
  refreshTimer: null,
  scanTimer: null,
  scrollTimer: null,
  overlay: null,
  boardObserver: null,
  processedIds: new Set(),
  scanning: false,
  lastScanAt: 0,
  started: false
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

function isDatSplash() {
  return /Loading DAT One/i.test(document.body?.textContent || "");
}

function isPageLoading() {
  if (isDatSplash()) return true;

  const agLoading = document.querySelector(".ag-overlay-loading-wrapper:not(.ag-hidden)");
  if (agLoading) return true;

  const busy = document.querySelector('[aria-busy="true"]');
  return Boolean(
    busy &&
      busy.closest('[role="grid"], [role="treegrid"], .ag-root, main, [class*="search" i]')
  );
}

function findBoardRoot() {
  const board = detectBoard();
  if (board === "dat") {
    return (
      document.querySelector(".ag-center-cols-container") ||
      document.querySelector('[role="treegrid"]') ||
      document.querySelector('[role="grid"]') ||
      document.querySelector(".ag-root") ||
      document.querySelector('[role="table"]')
    );
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

function setToolbarStatus(text) {
  const countEl = document.getElementById("le-load-count");
  if (countEl) countEl.textContent = text;
}

async function scanPage() {
  if (!STATE.settings?.enabled || STATE.scanning) return;
  if (isPageLoading()) {
    setToolbarStatus("waiting for board…");
    return;
  }

  const now = Date.now();
  if (now - STATE.lastScanAt < SCAN_MIN_INTERVAL_MS) return;

  STATE.scanning = true;
  STATE.lastScanAt = now;
  setToolbarStatus("scanning…");

  try {
    const root = findBoardRoot() || document.body;
    const loads = scanForLoads(root);

    for (let i = 0; i < loads.length; i += 1) {
      processLoadRow(loads[i]);
      if (i > 0 && i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    STATE.overlay.repositionAll();
    setToolbarStatus(`${loads.length} loads`);
  } finally {
    STATE.scanning = false;
  }
}

function scheduleScan() {
  if (STATE.scanTimer) clearTimeout(STATE.scanTimer);
  STATE.scanTimer = setTimeout(() => runScanWhenIdle(() => scanPage()), 800);
}

function resetEnhancements() {
  STATE.processedIds.clear();
  STATE.overlay?.clear();
}

function ensureToolbar() {
  let toolbar = document.getElementById("loadextension-toolbar");
  if (toolbar) return toolbar;

  toolbar = document.createElement("div");
  toolbar.id = "loadextension-toolbar";
  toolbar.className = "le-toolbar";
  toolbar.innerHTML = `
    <img src="${chrome.runtime.getURL("icons/icon16.png")}" alt="" width="16" height="16" />
    <strong>LoadExtension</strong>
    <span class="le-version">v${BUILD_VERSION}</span>
    <span id="le-load-count">starting…</span>
    <button type="button" id="le-rescan-btn">Rescan</button>
  `;
  toolbar.querySelector("#le-rescan-btn")?.addEventListener("click", () => {
    resetEnhancements();
    STATE.lastScanAt = 0;
    scanPage();
  });
  document.documentElement.appendChild(toolbar);
  return toolbar;
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

function setupDatScrollRescan() {
  if (detectBoard() !== "dat") return;

  window.addEventListener(
    "scroll",
    () => {
      if (STATE.scrollTimer) clearTimeout(STATE.scrollTimer);
      STATE.scrollTimer = setTimeout(() => scheduleScan(), 600);
    },
    true
  );
}

async function waitForBoard(maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const root = findBoardRoot();
    if (root && !isPageLoading()) return root;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return findBoardRoot();
}

async function init() {
  if (STATE.started) return;
  STATE.started = true;

  ensureToolbar();
  STATE.settings = await getSettings();

  if (!STATE.settings.enabled) {
    setToolbarStatus("disabled");
    return;
  }

  STATE.overlay = new OverlayManager();
  setToolbarStatus("waiting for board…");

  const boardRoot = await waitForBoard();
  setTimeout(() => runScanWhenIdle(() => scanPage()), INITIAL_SCAN_DELAY_MS);
  setInterval(() => runScanWhenIdle(() => scanPage()), PERIODIC_SCAN_MS);

  if (boardRoot && detectBoard() !== "dat") {
    setupBoardObserver(boardRoot);
  }

  setupDatScrollRescan();
  setupAutoRefresh();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.loadExtensionSettings) return;
  STATE.settings = changes.loadExtensionSettings.newValue;
  resetEnhancements();
  STATE.lastScanAt = 0;
  scheduleScan();
  setupAutoRefresh();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "RESCAN") {
    resetEnhancements();
    STATE.lastScanAt = 0;
    scanPage().then(() => sendResponse({ ok: true, count: STATE.overlay?.count() ?? 0 }));
    return true;
  }
  if (message.type === "GET_STATUS") {
    sendResponse({
      enabled: STATE.settings?.enabled ?? false,
      loads: STATE.overlay?.count() ?? 0
    });
  }
});

export async function boot() {
  ensureToolbar();
  if (document.readyState === "loading") {
    await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }
  await init();
}
