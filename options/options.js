import { getSettings, saveSettings } from "../shared/storage.js";

const form = document.getElementById("settings-form");
const status = document.getElementById("status");

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

  const template =
    settings.emailTemplates.find((t) => t.id === settings.activeTemplateId) ||
    settings.emailTemplates[0];
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
  }, 2000);
});

loadForm();
