(() => {
  // shared/rts-session.js
  function walkForCredit(node, results = []) {
    if (!node || typeof node !== "object") return results;
    if (Array.isArray(node)) {
      node.forEach((item) => walkForCredit(item, results));
      return results;
    }
    const keys = Object.keys(node);
    const lower = Object.fromEntries(keys.map((k) => [k.toLowerCase(), node[k]]));
    const mc = lower.mcnumber || lower.mc || lower.motorcarrier || lower.brokermc;
    const grade = lower.grade || lower.creditgrade || lower.rating;
    const score = lower.creditscore || lower.score;
    const days = lower.averagedaystopay || lower.avgdaystopay || lower.daystopay;
    if (mc || grade || score) {
      results.push({
        mcNumber: String(mc || ""),
        grade: grade ? String(grade).toUpperCase() : score ? String(score) : "",
        averageDaysToPay: days != null ? Number(days) : null,
        brokerName: lower.name || lower.companyname || lower.legalname || "",
        dotNumber: lower.dotnumber || lower.dot || ""
      });
    }
    for (const value of Object.values(node)) {
      walkForCredit(value, results);
    }
    return results;
  }
  function extractCreditsFromPayload(data) {
    return walkForCredit(data).filter((entry) => entry.grade || entry.mcNumber);
  }

  // content/rts-capture.js
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
    chrome.runtime.sendMessage({ type: "CACHE_CREDIT", payload: credit }).catch(() => {
    });
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "loadextension-rts") return;
    if (event.data.type !== "RTS_RESPONSE") return;
    const credits = extractCreditsFromPayload(event.data.data);
    for (const credit of credits) {
      cacheCredit({ ...credit, source: "rtspro-api" });
    }
  });
  var initial = parseCreditFromPage();
  if (initial) cacheCredit(initial);
  var observer = new MutationObserver(() => {
    const credit = parseCreditFromPage();
    if (credit) cacheCredit(credit);
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
