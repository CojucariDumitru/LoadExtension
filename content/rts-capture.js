import { extractCreditsFromPayload } from "../shared/rts-session.js";

function parseCreditFromPage() {
  const text = document.body?.innerText || "";
  const gradeMatch = text.match(/\b(?:Grade|Rating|Credit Score)\s*[:\-]?\s*([A-F][+-]?|\d{1,3})\b/i);
  const daysMatch = text.match(/(?:average\s+days?\s+to\s+pay|avg\.?\s+days?\s+to\s+pay)[:\s]*(\d+)/i);
  const mcMatch = text.match(/\bMC\s*#?\s*(\d{5,8})\b/i);
  const dotMatch = text.match(/\bDOT\s*#?\s*(\d{5,8})\b/i);

  if (!gradeMatch && !daysMatch) return null;

  return {
    grade: gradeMatch ? String(gradeMatch[1]).toUpperCase() : "",
    averageDaysToPay: daysMatch ? Number(daysMatch[1]) : null,
    brokerName: document.title || "",
    mcNumber: mcMatch ? mcMatch[1] : "",
    dotNumber: dotMatch ? dotMatch[1] : "",
    source: "rtspro-page"
  };
}

function cacheCredit(credit) {
  if (!credit?.grade && credit?.averageDaysToPay == null) return;
  chrome.runtime.sendMessage({ type: "CACHE_CREDIT", payload: credit }).catch(() => {});
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "loadextension-rts") return;
  if (event.data.type !== "RTS_RESPONSE") return;

  const credits = extractCreditsFromPayload(event.data.data);
  for (const credit of credits) {
    cacheCredit({ ...credit, source: "rtspro-api" });
  }
});

const initial = parseCreditFromPage();
if (initial) cacheCredit(initial);

const observer = new MutationObserver(() => {
  const credit = parseCreditFromPage();
  if (credit) cacheCredit(credit);
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
}
