/**
 * Haversine distance in miles between two lat/lng points.
 */
export function haversineMiles(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Rough city-pair deadhead estimate using a small built-in lookup.
 * Falls back to 0 when coordinates are unknown.
 */
const CITY_COORDS = {
  "chicago,il": { lat: 41.8781, lng: -87.6298 },
  "dallas,tx": { lat: 32.7767, lng: -96.797 },
  "atlanta,ga": { lat: 33.749, lng: -84.388 },
  "los angeles,ca": { lat: 34.0522, lng: -118.2437 },
  "houston,tx": { lat: 29.7604, lng: -95.3698 },
  "memphis,tn": { lat: 35.1495, lng: -90.049 },
  "indianapolis,in": { lat: 39.7684, lng: -86.1581 },
  "phoenix,az": { lat: 33.4484, lng: -112.074 },
  "denver,co": { lat: 39.7392, lng: -104.9903 },
  "kansas city,mo": { lat: 39.0997, lng: -94.5786 }
};

function normalizeCityKey(city, state) {
  return `${(city || "").trim().toLowerCase()},${(state || "").trim().toLowerCase()}`;
}

export function estimateDeadheadMiles(deadheadCity, deadheadState, originCity, originState) {
  const from = CITY_COORDS[normalizeCityKey(deadheadCity, deadheadState)];
  const to = CITY_COORDS[normalizeCityKey(originCity, originState)];
  if (!from || !to) return 0;
  return Math.round(haversineMiles(from, to));
}

export function calculateRpm(rate, tripMiles, deadheadMiles = 0) {
  const totalMiles = Number(tripMiles) + Number(deadheadMiles);
  if (!rate || !totalMiles) return 0;
  return Number(rate) / totalMiles;
}

export function parseMoney(value) {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  return Number(cleaned) || 0;
}

export function parseMiles(value) {
  if (value == null) return 0;
  const match = String(value).match(/([\d,]+(?:\.\d+)?)/);
  if (!match) return 0;
  return Number(match[1].replace(/,/g, "")) || 0;
}
