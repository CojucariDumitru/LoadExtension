import { calculateRpm, estimateDeadheadMiles } from "../shared/rpm.js";
import { applyTemplate, buildMailtoUrl } from "../shared/email.js";
import { buildGoogleMapsRouteUrl, buildFmcsaSaferUrl } from "../shared/maps.js";
import { gradeClass } from "../shared/credit-cache.js";
import { netRpmAfterTolls } from "../shared/toll.js";

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

function createBadge(className, text, title = "") {
  const badge = document.createElement("span");
  badge.className = className;
  badge.textContent = text;
  if (title) badge.title = title;
  return badge;
}

function requestBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

export function attachAsyncInsights(bar, load, settings) {
  if (settings.rts?.enabled && (load.brokerMcNumber || load.broker || load.dotNumber)) {
    requestBackground("GET_CREDIT", {
      mcNumber: load.brokerMcNumber,
      dotNumber: load.dotNumber,
      brokerName: load.broker
    })
      .then((response) => {
        if (!response?.ok || !response.credit) return;
        const { credit } = response;

        if (credit.pending) {
          bar.appendChild(
            createButton(credit.needsLogin ? "Connect RTS" : "RTS", credit.needsLogin ? "Log into RTS Pro" : "Open RTS credit search", () => {
              window.open(credit.rtsUrl || "https://rtspro.com/credit/search", "_blank", "noopener");
            })
          );
          return;
        }

        if (credit.grade || credit.averageDaysToPay != null) {
          const label = credit.grade
            ? `RTS ${credit.grade}`
            : `${credit.averageDaysToPay}d pay`;
          bar.appendChild(
            createBadge(
              `le-credit-badge ${gradeClass(credit.grade)}`,
              label,
              credit.averageDaysToPay
                ? `Avg days to pay: ${credit.averageDaysToPay}`
                : "RTS factoring grade"
            )
          );
          return;
        }
      })
      .catch(() => {});
  }

  if (settings.tollguru?.enabled && settings.tollguru.apiKey && load.origin && load.destination) {
    requestBackground("GET_TOLLS", {
      origin: load.origin,
      destination: load.destination
    })
      .then((response) => {
        if (!response?.ok || !response.toll || response.toll.tollCost == null) return;
        const { toll } = response;

        bar.appendChild(
          createBadge(
            "le-toll-badge",
            `Tolls $${toll.tollCost.toFixed(0)}`,
            toll.durationText ? `${toll.durationText}, ${toll.distanceText}` : "Estimated route tolls"
          )
        );

        if (settings.tollguru.showNetRpm && load.rate && load.miles) {
          const netRpm = netRpmAfterTolls(
            load.rate,
            load.miles,
            load.deadheadMiles,
            toll.tollCost
          );
          bar.appendChild(createBadge("le-net-rpm-badge", `Net RPM $${netRpm.toFixed(2)}`));
        }
      })
      .catch(() => {});
  }
}

export function renderLoadEnhancements(load, settings) {
  const bar = document.createElement("div");
  bar.className = "le-load-bar";

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

  attachAsyncInsights(bar, load, settings);
  return bar;
}

