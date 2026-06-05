(() => {
  // shared/constants.js
  var DEFAULT_SETTINGS = {
    enabled: true,
    minRpm: 2,
    minRate: 0,
    minMiles: 0,
    maxMiles: 0,
    hideBelowThreshold: false,
    highlightGoodLoads: true,
    deadheadCity: "",
    deadheadState: "",
    autoRefreshSeconds: 0,
    emailTemplates: [
      {
        id: "default",
        name: "Standard inquiry",
        subject: "Load inquiry \u2014 {{origin}} to {{destination}}",
        body: "Hi,\n\nI'm interested in your load from {{origin}} to {{destination}} ({{miles}} mi, {{equipment}}).\n\nPlease confirm availability and best rate.\n\nMC#: {{mcNumber}}\n\nThanks!"
      }
    ],
    activeTemplateId: "default",
    mcNumber: "",
    dotNumber: "",
    companyName: "",
    telegram: {
      enabled: false,
      botToken: "",
      chatId: ""
    },
    fmcsaWebKey: "",
    rts: {
      enabled: true,
      userId: "",
      userPass: "",
      minGrade: ""
    },
    tollguru: {
      enabled: false,
      apiKey: "",
      truckAxles: 5,
      showNetRpm: true
    }
  };
  var STORAGE_KEY = "loadExtensionSettings";

  // shared/storage.js
  async function getSettings() {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] || {} };
  }
  async function saveSettings(partial) {
    const current = await getSettings();
    const next = { ...current, ...partial };
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    return next;
  }

  // popup/popup.js
  var LOAD_BOARD_RE = /^https:\/\/(one\.dat\.com|power\.dat\.com|([a-z0-9-]+\.)*truckstop\.com|([a-z0-9-]+\.)*trucksmarter\.com)\//i;
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
      loadCountEl.textContent = "\u2014";
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
    setTimeout(refreshRtsStatus, 3e3);
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
})();
