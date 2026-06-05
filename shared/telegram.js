export async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) {
    throw new Error("Telegram bot token and chat ID are required.");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${body}`);
  }

  return response.json();
}

export function formatLoadAlert(load) {
  const lines = [
    "New matching load",
    `${load.origin || "?"} → ${load.destination || "?"}`,
    `Rate: $${load.rate || "?"}`,
    `Miles: ${load.miles || "?"}`,
    `RPM+: ${load.rpm != null ? load.rpm.toFixed(2) : "?"}`,
    load.broker ? `Broker: ${load.broker}` : null,
    load.equipment ? `Eq: ${load.equipment}` : null
  ].filter(Boolean);

  return lines.join("\n");
}
