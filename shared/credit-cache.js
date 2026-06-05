export const CREDIT_CACHE_KEY = "loadExtensionCreditCache";
export const CREDIT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function creditCacheKey({ mcNumber, dotNumber, brokerName }) {
  if (mcNumber) return `mc:${mcNumber}`;
  if (dotNumber) return `dot:${dotNumber}`;
  if (brokerName) return `name:${brokerName.trim().toLowerCase()}`;
  return null;
}

export async function getCachedCredit(getLocal, key) {
  if (!key) return null;
  const cache = await getLocal(CREDIT_CACHE_KEY, {});
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CREDIT_CACHE_TTL_MS) return null;
  return entry;
}

export async function setCachedCredit(setLocal, getLocal, key, credit) {
  if (!key) return;
  const cache = await getLocal(CREDIT_CACHE_KEY, {});
  cache[key] = { ...credit, fetchedAt: Date.now() };
  await setLocal(CREDIT_CACHE_KEY, cache);
}

export function gradeClass(grade) {
  const value = String(grade || "").toUpperCase();
  if (value.startsWith("A")) return "le-grade-a";
  if (value.startsWith("B")) return "le-grade-b";
  if (value.startsWith("C")) return "le-grade-c";
  if (value.startsWith("D") || value.startsWith("F")) return "le-grade-bad";
  return "le-grade-unknown";
}
