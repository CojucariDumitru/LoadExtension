const SOAP_URL = "http://webservice.rtscredit.com/CreditReport.asmx";
const SOAP_NS = "http://tempuri.org/";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEnvelope(action, body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/soap/envelope/">
  <soap12:Body>
    <${action} xmlns="${SOAP_NS}">
      ${body}
    </${action}>
  </soap12:Body>
</soap12:Envelope>`;
}

async function soapCall(action, body) {
  const response = await fetch(SOAP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8",
      SOAPAction: `${SOAP_NS}${action}`
    },
    body: buildEnvelope(action, body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`RTS SOAP ${action} failed (${response.status})`);
  }
  return text;
}

function readTag(xml, tag) {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)</(?:\\w+:)?${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1].trim() : "";
}

function parseLogin(xml) {
  const userIsValid = readTag(xml, "UserIsValid").toLowerCase() === "true";
  const token = readTag(xml, "UserToken");
  const code = readTag(xml, "Code");
  const description = readTag(xml, "Description");

  if (!userIsValid || !token) {
    throw new Error(description || code || "RTS login failed");
  }
  return token;
}

function parseBrokerList(xml) {
  const brokers = [];
  const blockRe = /<Broker\b[^>]*>([\s\S]*?)<\/Broker>/gi;
  let match;
  while ((match = blockRe.exec(xml))) {
    const block = match[1];
    const broker = {};
    for (const tag of ["ID", "Name", "MCNumber", "City", "St", "Zip", "CreditScore", "Grade"]) {
      broker[tag] = readTag(block, tag);
    }
    if (broker.ID || broker.Name || broker.MCNumber) brokers.push(broker);
  }
  return brokers;
}

function parseBrokerDetail(xml) {
  const detailBlock = xml.match(/<BrokerDetail\b[^>]*>([\s\S]*?)<\/BrokerDetail>/i);
  const block = detailBlock ? detailBlock[1] : xml;
  const fields = [
    "Name",
    "MCNumber",
    "DOTNumber",
    "CreditScore",
    "Grade",
    "AverageDaysToPay",
    "LastActivity",
    "City",
    "St"
  ];
  const detail = {};
  for (const tag of fields) {
    detail[tag] = readTag(block, tag);
  }
  return detail;
}

export function normalizeRtsCredit(detail, source = "rts-soap") {
  return {
    grade: detail.Grade || detail.CreditScore || "",
    averageDaysToPay: Number(detail.AverageDaysToPay) || null,
    brokerName: detail.Name || "",
    mcNumber: detail.MCNumber || "",
    dotNumber: detail.DOTNumber || "",
    city: detail.City || "",
    state: detail.St || "",
    source
  };
}

let cachedToken = null;
let tokenFetchedAt = 0;
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000;

async function getToken(userId, userPass) {
  if (cachedToken && Date.now() - tokenFetchedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }

  const xml = await soapCall(
    "Login",
    `<UserID>${escapeXml(userId)}</UserID><UserPass>${escapeXml(userPass)}</UserPass>`
  );
  cachedToken = parseLogin(xml);
  tokenFetchedAt = Date.now();
  return cachedToken;
}

export async function lookupBrokerCredit({ userId, userPass, mcNumber, brokerName }) {
  if (!userId || !userPass) {
    throw new Error("RTS webservice User ID and password are required.");
  }

  const token = await getToken(userId, userPass);
  let searchXml;

  if (mcNumber) {
    searchXml = await soapCall(
      "BrokerSearchByMC",
      `<UserToken>${escapeXml(token)}</UserToken><MCNumber>${escapeXml(mcNumber)}</MCNumber>`
    );
  } else if (brokerName) {
    searchXml = await soapCall(
      "BrokerSearchByName",
      `<UserToken>${escapeXml(token)}</UserToken><Name>${escapeXml(brokerName)}</Name>`
    );
  } else {
    throw new Error("Broker MC number or name is required for RTS lookup.");
  }

  const brokers = parseBrokerList(searchXml);
  if (!brokers.length) {
    return null;
  }

  const broker = brokers[0];
  const detailXml = await soapCall(
    "GetBrokerDetail",
    `<UserToken>${escapeXml(token)}</UserToken><ID>${escapeXml(broker.ID)}</ID>`
  );
  const detail = parseBrokerDetail(detailXml);
  return normalizeRtsCredit({ ...broker, ...detail });
}

export function buildRtsProSearchUrl({ mcNumber, dotNumber, brokerName }) {
  const base = "https://rtspro.com/credit/search";
  const params = new URLSearchParams();
  if (mcNumber) params.set("mc", mcNumber);
  if (dotNumber) params.set("dot", dotNumber);
  if (brokerName) params.set("q", brokerName);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
