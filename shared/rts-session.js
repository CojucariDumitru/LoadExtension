export async function hasRtsSession() {
  const cookies = await chrome.cookies.getAll({ domain: "rtspro.com" });
  if (!cookies.length) return false;
  return cookies.some((cookie) =>
    /session|auth|token|aspnet|jwt|sid/i.test(cookie.name)
  );
}

export async function getRtsCookieHeader() {
  const cookies = await chrome.cookies.getAll({ domain: "rtspro.com" });
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

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

export function extractCreditsFromPayload(data) {
  return walkForCredit(data).filter((entry) => entry.grade || entry.mcNumber);
}

export async function lookupRtsViaSession({ mcNumber, brokerName }) {
  const cookie = await getRtsCookieHeader();
  if (!cookie) return null;

  const attempts = [];
  if (mcNumber) {
    attempts.push(`https://rtspro.com/api/credit/search?mc=${encodeURIComponent(mcNumber)}`);
    attempts.push(`https://rtspro.com/api/credit/broker?mcNumber=${encodeURIComponent(mcNumber)}`);
    attempts.push(`https://rtspro.com/credit/api/search?searchTerm=${encodeURIComponent(mcNumber)}`);
  }
  if (brokerName) {
    attempts.push(`https://rtspro.com/api/credit/search?name=${encodeURIComponent(brokerName)}`);
  }

  for (const url of attempts) {
    try {
      const response = await fetch(url, {
        headers: { Cookie: cookie, Accept: "application/json" },
        credentials: "include"
      });
      if (!response.ok) continue;
      const data = await response.json();
      const credits = extractCreditsFromPayload(data);
      if (credits.length) return credits[0];
    } catch {
      // try next endpoint pattern
    }
  }

  return null;
}
