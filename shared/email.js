export function applyTemplate(template, load, settings) {
  const replacements = {
    origin: load.origin || "",
    destination: load.destination || "",
    miles: load.miles ?? "",
    rate: load.rate ?? "",
    rpm: load.rpm != null ? load.rpm.toFixed(2) : "",
    equipment: load.equipment || "",
    broker: load.broker || "",
    mcNumber: settings.mcNumber || "",
    dotNumber: settings.dotNumber || "",
    companyName: settings.companyName || ""
  };

  const fill = (text) =>
    String(text).replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] ?? "");

  return {
    subject: fill(template.subject),
    body: fill(template.body)
  };
}

export function buildMailtoUrl(email, subject, body) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const query = params.toString();
  return `mailto:${encodeURIComponent(email)}${query ? `?${query}` : ""}`;
}
