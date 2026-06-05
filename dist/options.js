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

  // options/options.js
  var form = document.getElementById("settings-form");
  var status = document.getElementById("status");
  function setValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = value ?? "";
  }
  async function loadForm() {
    const settings = await getSettings();
    setValue("minRpm", settings.minRpm);
    setValue("minRate", settings.minRate);
    setValue("minMiles", settings.minMiles);
    setValue("maxMiles", settings.maxMiles);
    setValue("hideBelowThreshold", settings.hideBelowThreshold);
    setValue("highlightGoodLoads", settings.highlightGoodLoads);
    setValue("deadheadCity", settings.deadheadCity);
    setValue("deadheadState", settings.deadheadState);
    setValue("companyName", settings.companyName);
    setValue("mcNumber", settings.mcNumber);
    setValue("dotNumber", settings.dotNumber);
    setValue("autoRefreshSeconds", settings.autoRefreshSeconds);
    const template = settings.emailTemplates.find((t) => t.id === settings.activeTemplateId) || settings.emailTemplates[0];
    setValue("templateName", template?.name);
    setValue("templateSubject", template?.subject);
    setValue("templateBody", template?.body);
    setValue("telegramEnabled", settings.telegram?.enabled);
    setValue("telegramBotToken", settings.telegram?.botToken);
    setValue("telegramChatId", settings.telegram?.chatId);
    setValue("rtsEnabled", settings.rts?.enabled);
    setValue("rtsUserId", settings.rts?.userId);
    setValue("rtsUserPass", settings.rts?.userPass);
    setValue("tollguruEnabled", settings.tollguru?.enabled);
    setValue("tollguruApiKey", settings.tollguru?.apiKey);
    setValue("tollguruTruckAxles", settings.tollguru?.truckAxles ?? 5);
    setValue("tollguruShowNetRpm", settings.tollguru?.showNetRpm);
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const current = await getSettings();
    const templateId = current.activeTemplateId || "default";
    const next = {
      minRpm: Number(document.getElementById("minRpm").value) || 0,
      minRate: Number(document.getElementById("minRate").value) || 0,
      minMiles: Number(document.getElementById("minMiles").value) || 0,
      maxMiles: Number(document.getElementById("maxMiles").value) || 0,
      hideBelowThreshold: document.getElementById("hideBelowThreshold").checked,
      highlightGoodLoads: document.getElementById("highlightGoodLoads").checked,
      deadheadCity: document.getElementById("deadheadCity").value.trim(),
      deadheadState: document.getElementById("deadheadState").value.trim().toUpperCase(),
      companyName: document.getElementById("companyName").value.trim(),
      mcNumber: document.getElementById("mcNumber").value.trim(),
      dotNumber: document.getElementById("dotNumber").value.trim(),
      autoRefreshSeconds: Number(document.getElementById("autoRefreshSeconds").value) || 0,
      emailTemplates: [
        {
          id: templateId,
          name: document.getElementById("templateName").value.trim() || "Standard inquiry",
          subject: document.getElementById("templateSubject").value,
          body: document.getElementById("templateBody").value
        }
      ],
      activeTemplateId: templateId,
      telegram: {
        enabled: document.getElementById("telegramEnabled").checked,
        botToken: document.getElementById("telegramBotToken").value.trim(),
        chatId: document.getElementById("telegramChatId").value.trim()
      },
      rts: {
        enabled: document.getElementById("rtsEnabled").checked,
        userId: document.getElementById("rtsUserId").value.trim(),
        userPass: document.getElementById("rtsUserPass").value
      },
      tollguru: {
        enabled: document.getElementById("tollguruEnabled").checked,
        apiKey: document.getElementById("tollguruApiKey").value.trim(),
        truckAxles: Number(document.getElementById("tollguruTruckAxles").value) || 5,
        showNetRpm: document.getElementById("tollguruShowNetRpm").checked
      }
    };
    await saveSettings(next);
    status.textContent = "Saved.";
    setTimeout(() => {
      status.textContent = "";
    }, 2e3);
  });
  loadForm();
})();
