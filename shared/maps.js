export function buildGoogleMapsRouteUrl(load, deadheadCity, deadheadState) {
  const stops = [];

  if (deadheadCity && deadheadState) {
    stops.push(`${deadheadCity}, ${deadheadState}`);
  }
  if (load.origin) stops.push(load.origin);
  if (load.destination) stops.push(load.destination);

  if (stops.length < 2) return null;

  const origin = encodeURIComponent(stops[0]);
  const destination = encodeURIComponent(stops[stops.length - 1]);
  const waypoints =
    stops.length > 2
      ? `&waypoints=${encodeURIComponent(stops.slice(1, -1).join("|"))}`
      : "";

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints}&travelmode=driving`;
}

export function buildFmcsaSaferUrl(dotNumber) {
  if (!dotNumber) return null;
  return `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(dotNumber)}`;
}
