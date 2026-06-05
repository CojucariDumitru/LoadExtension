/**
 * Captures broker credit details from RTS Pro when the user is logged in.
 * Parsed text is sent to the extension cache for inline display on load boards.
 */
function parseCreditFromPage() {
  const text = document.body?.innerText || "";
  const gradeMatch = text.match(/\bGrade\s*[:\-]?\s*([A-F][+-]?|N\/A)\b/i);
  const daysMatch = text.match(/(?:average\s+days?\s+to\s+pay|avg\.?\s+days?\s+to\s+pay)[:\s]*(\d+)/i);
  const mcMatch = text.match(/\bMC\s*#?\s*(\d{5,8})\b/i);
  const dotMatch = text.match(/\bDOT\s*#?\s*(\d{5,8})\b/i);
  const nameEl = document.querySelector("h1, h2, [class*='company'], [class*='broker']");
  const brokerName = nameEl?.textContent?.trim() || "";

  if (!gradeMatch && !daysMatch) return null;

  return {
    grade: gradeMatch ? gradeMatch[1].toUpperCase() : "",
    averageDaysToPay: daysMatch ? Number(daysMatch[1]) : null,
    brokerName,
    mcNumber: mcMatch ? mcMatch[1] : "",
    dotNumber: dotMatch ? dotMatch[1] : "",
    source: "rtspro-page"
  };
}

function publishCredit(credit) {
  if (!credit?.grade && credit?.averageDaysToPay == null) return;
  chrome.runtime.sendMessage({ type: "CACHE_CREDIT", payload: credit }).catch(() => {});
}

const initial = parseCreditFromPage();
if (initial) publishCredit(initial);

const observer = new MutationObserver(() => {
  const credit = parseCreditFromPage();
  if (credit) publishCredit(credit);
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });
