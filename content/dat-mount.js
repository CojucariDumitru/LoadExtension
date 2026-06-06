import { buildGoogleMapsRouteUrl } from "../shared/maps.js";
import { applyTemplate, buildMailtoUrl } from "../shared/email.js";
import { gradeClass } from "../shared/credit-cache.js";
import { findDatAnchors } from "./dat-anchors.js";

function requestBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

function getActiveTemplate(settings) {
  return (
    settings.emailTemplates.find((t) => t.id === settings.activeTemplateId) ||
    settings.emailTemplates[0]
  );
}

function createWidget(className, html) {
  const el = document.createElement("div");
  el.className = `le-dat-widget ${className}`;
  el.innerHTML = html;
  return el;
}

function bindButton(widget, selector, handler) {
  widget.querySelector(selector)?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler();
  });
}

export function mountDatEnhancements(load, settings, overlay) {
  const anchors = findDatAnchors(load);
  const searchCity = load.searchOriginCity || settings.deadheadCity;
  const searchState = load.searchOriginState || settings.deadheadState;

  if (anchors.loadedRpm) {
    const totalMi = load.miles + load.deadheadMiles;
    const widget = createWidget(
      "le-dat-rpm",
      `<span class="le-dat-rpm-label">Full RPM</span>
       <strong>$${load.rpm.toFixed(2)}/mi</strong>
       <small>${load.miles} loaded + ${load.deadheadMiles} DH</small>`
    );
    widget.title = `Loaded $${(load.rate / load.miles || 0).toFixed(2)}/mi → Full $${load.rpm.toFixed(2)}/mi (${totalMi} total mi)`;
    overlay.mountAnchor(`${load.id}:rpm`, anchors.loadedRpm, widget, "cover");
  }

  if (anchors.originCity && anchors.destCity) {
    const mapsUrl = buildGoogleMapsRouteUrl(load, searchCity, searchState);
    if (mapsUrl) {
      const widget = createWidget(
        "le-dat-map",
        `<button type="button" class="le-dat-map-btn" title="Open route in Google Maps">🗺️</button>`
      );
      bindButton(widget, ".le-dat-map-btn", () => window.open(mapsUrl, "_blank", "noopener"));
      overlay.mountBetween(`${load.id}:map`, anchors.originCity, anchors.destCity, widget);
    }
  }

  if (settings.rts?.enabled && anchors.factoring && (load.brokerMcNumber || load.broker)) {
    const widget = createWidget("le-dat-rts", `<span class="le-dat-rts-pending">RTS…</span>`);
    overlay.mountAnchor(`${load.id}:rts`, anchors.factoring, widget, "below");

    requestBackground("GET_CREDIT", {
      mcNumber: load.brokerMcNumber,
      dotNumber: load.dotNumber,
      brokerName: load.broker
    })
      .then((response) => {
        if (!response?.ok || !response.credit) return;
        const { credit } = response;
        if (credit.pending) {
          widget.innerHTML = `<button type="button" class="le-dat-rts-btn">${credit.needsLogin ? "Connect RTS" : "RTS lookup"}</button>`;
          bindButton(widget, ".le-dat-rts-btn", () => {
            window.open(credit.rtsUrl || "https://rtspro.com/credit/search", "_blank", "noopener");
          });
        } else if (credit.grade || credit.averageDaysToPay != null) {
          const label = credit.grade ? `RTS ${credit.grade}` : `${credit.averageDaysToPay}d pay`;
          widget.innerHTML = `<span class="le-dat-rts-badge ${gradeClass(credit.grade)}">${label}</span>`;
        }
        overlay.repositionAll();
      })
      .catch(() => {});
  }

  const email = load.email || anchors.email?.href?.replace("mailto:", "") || "";
  const emailAnchor = anchors.email || anchors.emailText;
  if (email && emailAnchor) {
    const template = getActiveTemplate(settings);
    const widget = createWidget(
      "le-dat-email",
      `<button type="button" class="le-dat-email-btn">✉️ Quick email</button>`
    );
    bindButton(widget, ".le-dat-email-btn", () => {
      const { subject, body } = applyTemplate(template, { ...load, email }, settings);
      window.location.href = buildMailtoUrl(email, subject, body);
    });
    overlay.mountAnchor(`${load.id}:email`, emailAnchor, widget, "below");
  }
}
