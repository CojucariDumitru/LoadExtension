# LoadExtension

Self-hosted Chrome extension inspired by LoadHunter — built so you can keep the dispatch workflow without a monthly subscription.

## What you get (free)

| Feature | LoadHunter | LoadExtension |
| --- | --- | --- |
| RPM+ with deadhead | Yes | Yes (basic city lookup) |
| Highlight / hide weak loads | Yes | Yes |
| One-click broker email | Yes | Yes (`mailto:` + templates) |
| Google Maps route | Yes | Yes |
| Telegram load alerts | Yes | Yes (free Bot API) |
| Auto page refresh | Yes | Yes |
| FMCSA DOT lookup | Yes | Yes (SAFER link) |
| Custom load board UI | Yes | No |
| AI email/call negotiation | Yes | No |
| Factoring scores | Yes | Yes (RTS webservice or rtspro.com cache) |
| Toll API | Yes | Yes (TollGuru free tier + your API key) |
| Built-in TMS | Yes | No |

Load boards like DAT and Truckstop change their UI often. This extension uses heuristic parsing (city pairs, rates, miles) instead of brittle hard-coded selectors, but you may need small tweaks for your exact board view.

## Install (developer mode)

1. Install dependencies and build:

```bash
npm install
npm run build
```

2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select this repo folder
5. Open DAT One, Truckstop, or TruckSmarter and run a load search
6. Click the extension icon → **Rescan page** if loads don't appear immediately

## Configure

Open **Settings** from the popup or extension options:

- **Filters** — min RPM+, rate, miles; highlight or hide weak loads
- **Deadhead** — your base city/state for RPM+ calculations
- **Email template** — one-click broker emails via your default mail client
- **RTS credit** — automatic grade lookup via RTS webservice, or cache from rtspro.com
- **TollGuru tolls** — route toll estimate and net RPM after tolls
- **Telegram** — optional alerts when a new matching load appears
- **Auto refresh** — reload the search tab on an interval

### RTS factoring scores

**Automatic (recommended):** Call RTS (855-851-1005) and request your **webservice User ID and password** for `webservice.rtscredit.com`. Enter them in extension Settings. The extension calls the same SOAP API LoadHunter-style tools use and shows grades inline on DAT.

**Manual cache:** Log into [rtspro.com/credit/search](https://rtspro.com/credit/search). When you open a broker's credit page, the extension caches the grade for 7 days and shows it on matching loads.

### TollGuru toll calculations

1. Sign up at [tollguru.com/toll-api-docs](https://tollguru.com/toll-api-docs) (free trial: 150 req/day business, 15/day personal)
2. Paste your API key in Settings
3. Set truck axle count (default 5)
4. Each load shows estimated tolls and optional **net RPM** (rate minus tolls, divided by miles)

### Telegram setup

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the bot token into settings
3. Send any message to your bot
4. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy your `chat.id`

## Development

```bash
npm run build
```

Source layout:

- `content/` — load board injection, parsing, UI overlays
- `background/` — Telegram alerts, deduplication
- `shared/` — settings, RPM, email, maps helpers
- `popup/`, `options/` — extension UI

After changing `content/`, `background/`, or `shared/`, rebuild before reloading the extension in Chrome.

## Legal / practical notes

- You still need your own load board subscription (DAT, Truckstop, etc.).
- Respect each platform's Terms of Service. This tool augments your browser; it does not scrape data off-site.
- Auto-email at scale can get your domain flagged. Start with one-click manual sends.
- AI calling, factoring integrations, and toll APIs can be added later with your own keys.

## Roadmap ideas

- Gmail API integration for true auto-email (OAuth)
- Toll API (e.g. TollGuru) behind an optional user API key
- Better DAT One selectors once you inspect your board version
- Multiple saved email templates
- Driver profiles per browser tab

Pull requests welcome.
