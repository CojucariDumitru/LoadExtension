import { calculateRpm, estimateDeadheadMiles } from "../shared/rpm.js";
import { applyTemplate, buildMailtoUrl } from "../shared/email.js";
import { buildGoogleMapsRouteUrl, buildFmcsaSaferUrl } from "../shared/maps.js";

export function enrichLoad(load, settings) {
  const deadheadMiles = estimateDeadheadMiles(
    settings.deadheadCity,
    settings.deadheadState,
    load.originCity,
    load.originState
  );
  const rpm = calculateRpm(load.rate, load.miles, deadheadMiles);

  return {
    ...load,
    deadheadMiles,
    rpm,
    passesFilters: matchesFilters({ ...load, rpm, deadheadMiles }, settings)
  };
}

export function matchesFilters(load, settings) {
  if (settings.minRate && load.rate < settings.minRate) return false;
  if (settings.minMiles && load.miles < settings.minMiles) return false;
  if (settings.maxMiles && load.miles > settings.maxMiles) return false;
  if (settings.minRpm && load.rpm < settings.minRpm) return false;
  return true;
}

function getActiveTemplate(settings) {
  return (
    settings.emailTemplates.find((t) => t.id === settings.activeTemplateId) ||
    settings.emailTemplates[0]
  );
}

function createButton(label, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "le-action-btn";
  button.textContent = label;
  button.title = title;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

export function renderLoadEnhancements(load, settings) {
  const bar = document.createElement("div");
  bar.className = "le-load-bar";
  bar.dataset.loadextensionProcessed = "true";

  const badge = document.createElement("span");
  badge.className = `le-rpm-badge ${load.passesFilters ? "le-good" : "le-weak"}`;
  badge.textContent = `RPM+ ${load.rpm.toFixed(2)}`;
  if (load.deadheadMiles) {
    badge.title = `Includes ~${load.deadheadMiles} mi deadhead`;
  }
  bar.appendChild(badge);

  const template = getActiveTemplate(settings);

  if (load.email && template) {
    bar.appendChild(
      createButton("Email", "Send templated email to broker", () => {
        const { subject, body } = applyTemplate(template, load, settings);
        window.location.href = buildMailtoUrl(load.email, subject, body);
      })
    );
  } else {
    bar.appendChild(
      createButton("Copy", "Copy load summary", async () => {
        const summary = [
          `${load.origin} → ${load.destination}`,
          `$${load.rate} / ${load.miles} mi`,
          `RPM+: ${load.rpm.toFixed(2)}`
        ].join(" | ");
        await navigator.clipboard.writeText(summary);
      })
    );
  }

  const mapsUrl = buildGoogleMapsRouteUrl(load, settings.deadheadCity, settings.deadheadState);
  if (mapsUrl) {
    bar.appendChild(
      createButton("Map", "Open route in Google Maps", () => {
        window.open(mapsUrl, "_blank", "noopener");
      })
    );
  }

  if (load.dotNumber) {
    const saferUrl = buildFmcsaSaferUrl(load.dotNumber);
    bar.appendChild(
      createButton("DOT", "Open FMCSA SAFER snapshot", () => {
        window.open(saferUrl, "_blank", "noopener");
      })
    );
  }

  return bar;
}

export function applyRowStyles(row, load, settings) {
  row.dataset.loadextensionProcessed = "true";
  row.classList.remove("le-row-good", "le-row-weak", "le-row-hidden");

  if (!load.passesFilters && settings.hideBelowThreshold) {
    row.classList.add("le-row-hidden");
    return;
  }

  if (load.passesFilters && settings.highlightGoodLoads) {
    row.classList.add("le-row-good");
  } else if (!load.passesFilters) {
    row.classList.add("le-row-weak");
  }
}
