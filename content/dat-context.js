const CITY_STATE_RE = /([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2})\b/;

export function parseDatSearchOrigin() {
  for (const el of document.querySelectorAll("input, textarea, button, span, div, label")) {
    const text = (el.textContent || el.value || "").replace(/\s+/g, " ").trim();
    if (text.length > 60) continue;

    const nearOrigin = el.closest('[class*="origin" i], [aria-label*="origin" i]');
    if (nearOrigin) {
      const match = nearOrigin.textContent.match(CITY_STATE_RE);
      if (match) {
        return { city: match[1].trim(), state: match[2], label: `${match[1].trim()}, ${match[2]}` };
      }
    }

    if (/^origin$/i.test(text) || /^dh-o$/i.test(text)) {
      const parent = el.parentElement?.parentElement;
      const match = parent?.textContent.match(CITY_STATE_RE);
      if (match) {
        return { city: match[1].trim(), state: match[2], label: `${match[1].trim()}, ${match[2]}` };
      }
    }
  }

  const header = document.body?.textContent || "";
  const block = header.match(/Origin[\s\S]{0,120}?([A-Za-z .'-]+,\s*[A-Z]{2})/i);
  if (block) {
    const match = block[0].match(CITY_STATE_RE);
    if (match) {
      return { city: match[1].trim(), state: match[2], label: `${match[1].trim()}, ${match[2]}` };
    }
  }

  return null;
}

export function parseDeadheadMiles(text, originCity = "") {
  if (!text) return 0;

  if (originCity) {
    const escaped = originCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nearOrigin = text.match(new RegExp(`\\((\\d{1,3})\\)[^(]{0,40}${escaped}`, "i"));
    if (nearOrigin) return Number(nearOrigin[1]);
  }

  const dhO = text.match(/DH[-\s]?O\D*(\d{1,3})/i);
  if (dhO) return Number(dhO[1]);

  const parenDh = text.match(/\((\d{1,3})\)\s*(?:mi|miles)?/i);
  if (parenDh) return Number(parenDh[1]);

  return 0;
}
