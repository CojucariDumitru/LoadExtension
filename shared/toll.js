const TOLLGURU_URL = "https://apis.tollguru.com/toll/v2/origin-destination-waypoints";

const AXLE_TYPES = {
  2: "2AxlesTruck",
  3: "3AxlesTruck",
  4: "4AxlesTruck",
  5: "5AxlesTruck",
  6: "6AxlesTruck",
  7: "7AxlesTruck",
  8: "8AxlesTruck",
  9: "9AxlesTruck"
};

function addressPayload(label) {
  return { address: label };
}

export async function calculateRouteTolls({
  apiKey,
  deadheadCity,
  deadheadState,
  origin,
  destination,
  truckAxles = 5
}) {
  if (!apiKey) {
    throw new Error("TollGuru API key is required.");
  }
  if (!origin || !destination) {
    throw new Error("Origin and destination are required for toll calculation.");
  }

  const waypoints = [];
  if (deadheadCity && deadheadState) {
    waypoints.push(addressPayload(`${deadheadCity}, ${deadheadState}`));
  }

  const body = {
    from: addressPayload(origin),
    to: addressPayload(destination),
    serviceProvider: "here",
    vehicle: {
      type: AXLE_TYPES[truckAxles] || "5AxlesTruck"
    }
  };

  if (waypoints.length) {
    body.waypoints = waypoints;
  }

  const response = await fetch(TOLLGURU_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `TollGuru error (${response.status})`);
  }

  const route = data?.routes?.[0];
  const costs = route?.summary?.costs || route?.costs || {};
  const tollCost =
    costs.tag ??
    costs.minimumTollCost ??
    costs.tagAndCash ??
    costs.cash ??
    null;

  return {
    tollCost: tollCost != null ? Number(tollCost) : null,
    fuelCost: costs.fuel != null ? Number(costs.fuel) : null,
    distanceText: route?.summary?.distance?.text || "",
    durationText: route?.summary?.duration?.text || "",
    hasTolls: Boolean(route?.summary?.hasTolls)
  };
}

export function netRpmAfterTolls(rate, tripMiles, deadheadMiles, tollCost) {
  const totalMiles = Number(tripMiles) + Number(deadheadMiles);
  if (!rate || !totalMiles) return 0;
  const netRate = Number(rate) - Number(tollCost || 0);
  return netRate / totalMiles;
}
