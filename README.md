# Bank navbat tizimi

A "take-a-number" queue ticketing system for a bank branch. Three views stay in
sync **in real time** from one Node.js process. The entire UI is in **Uzbek
(Latin script)**; code, comments and this README are in English.

| View | Path | Purpose |
|------|------|---------|
| Customer kiosk | `/kiosk` | Mobile-first page (opened via QR). Pick a service type → get a ticket number |
| TV display | `/tv` | Large read-only board: "Hozir xizmat koʻrsatilmoqda" per operator + "Navbatdagilar" |
| Staff panel | `/staff` | One per operator: Keyingisini chaqirish / Qayta chaqirish / Oʻtkazib yuborish |
| QR poster | `/qr` | Printable page with a scannable QR that points phones at `/kiosk` |
| Admin panel | `/admin` | Per-service stats: issued, served, no-shows, average wait |

## Run it

Requires **Node.js 18+**. One dependency (`qrcode`).

```bash
cd bank-navbat
npm install
npm start
```

The console prints local + LAN URLs. Open the three views at once (separate tabs,
or real devices on the same Wi-Fi):

- Kiosk (phone): scan the QR shown at <http://localhost:3000/qr>, or open `http://<LAN-IP>:3000/kiosk`
- TV display: <http://localhost:3000/tv> on the big screen
- Staff panel: <http://localhost:3000/staff> on each operator's machine (they pick their operator number once)

Everything updates live — no manual refresh.

Options:

```bash
PORT=8080 npm start                         # change port
PUBLIC_URL=http://bank.local:3000 npm start  # force the URL encoded in the QR
```

## Architecture

```
bank-navbat/
  server.js            HTTP server + queue logic + SSE + QR generation (no framework)
  package.json
  public/
    index.html         hub with links to every view
    kiosk.html/.js      customer kiosk (mobile-first)
    tv.html/.js         TV display (6 operators, notification sounds)
    staff.html/.js      operator panel
    qr.html/.js         printable QR poster
    admin.html/.js      admin dashboard
    common.js           SSE client, notification sounds (WebAudio), formatting
    style.css           all styles (system font stack renders oʻ / gʻ / ʼ cleanly)
  data/state.json       queue state, written on every change (auto-created)
```

- **Real-time sync:** server → clients over **Server-Sent Events** (`GET /events`).
  Every mutation pushes a fresh view model to all connected screens. Clients send
  commands with plain JSON `POST`. `GET /api/state` is available for polling if SSE
  is blocked. (SSE is used instead of WebSockets/Socket.io because traffic is
  one-directional broadcast + occasional POST — no need for a socket library.)
- **State** lives in memory and is mirrored to `data/state.json` (debounced), so a
  restart during the day keeps every counter and ticket.
- **Daily reset:** ticket counters reset to zero at **midnight**, independently per
  service type (a timer fires just after 00:00, with a 60-second safety check).
  Manual reset: `POST /api/reset` or the button on `/admin`.
- **Ticket numbers:** `<prefix><3 digits>` per service, incrementing per day
  (`A001`, `A002`, … / `B001`, …).

### Service types (5)

| # | Icon | Title | Subtitle | Prefix |
|---|------|-------|----------|--------|
| 1 | 💳 | Kreditlash | Isteʼmol, avtokredit, ipoteka, mikroqarz | **A** |
| 2 | 💰 | Depozitlar | Omonat, jamgʻarma, mijoz mablagʻlari | **B** |
| 3 | 💸 | Toʻlovlar va pul oʻtkazmalari | Kartalar, transferlar, toʻlovlar | **C** |
| 4 | 💳 | Bank kartalari | Visa/Uzcard/Humo, karta mahsulotlari | **D** |
| 5 | 👥 | Mijozlarga xizmat koʻrsatish | Jismoniy shaxslar bilan ishlash | **E** |

### Operators (6)

Any operator can serve any service type. Each staff panel:

- **Keyingisini chaqirish** — completes the current customer (served) and pulls the
  **longest-waiting** ticket across the queues that operator is assigned to
  (FIFO across queues). Shortcut: <kbd>Space</kbd>.
- **Muayyan navbatdan chaqirish** — per-queue buttons to pull specifically from
  one service queue.
- **Qayta chaqirish** — re-alerts the current number on the TV (urgent triple-tone signal).
- **Oʻtkazib yuborish** — marks the current customer as a no-show and pulls the next
  one (from the same queue, falling back to auto).
- **Operator dam olishda** — pause/resume; a paused operator is removed from the
  wait-time estimate and shown as "dam olishda" on the TV.
- **Men xizmat koʻrsatadigan turlar** — checkboxes to choose which queues this
  operator's "Keyingisini chaqirish" draws from.
- **Navbatda kutayotganlar** — live count broken down by service type.

### Queue position

The customer's ticket screen shows their **position** and how many people are
**ahead of them** (`peopleAhead`), updated live — no minute-based estimate.
The server still tracks average handling time (`avgServiceMin`, a rolling sample
clamped to 2–20 min) for the TV footer and the admin dashboard.

## How to add operators or service types

Edit the two constants at the top of [`server.js`](server.js):

```js
const OPERATOR_COUNT = 6;              // change the number of operators

const DEFAULT_SERVICES = [             // add / edit a service type
  { id: 'kreditlash', name: 'Kreditlash',
    subtitle: 'Isteʼmol, avtokredit, ipoteka, mikroqarz',
    prefix: 'A', icon: '💳', color: '#6366f1' },
  // ...add another { id, name, subtitle, prefix, icon, color }
];
```

Then delete `data/state.json` (or `POST /api/reset`) and restart. Every view — kiosk
cards, TV board, staff panel, admin table — picks up the change automatically from
the server's view model. New operators default to serving all service types and
start online.

## API reference

| Method + path | Body | Effect |
|---------------|------|--------|
| `GET /events` | — | SSE stream of the view model |
| `GET /api/state` | — | current view model (polling fallback) |
| `GET /api/qr` | — | `{ url, dataUrl }` for the kiosk QR |
| `POST /api/ticket` | `{ serviceId }` | issue a ticket |
| `POST /api/call-next` | `{ operatorId, serviceId? }` | call next (auto, or from one queue) |
| `POST /api/recall` | `{ operatorId }` | re-announce current ticket |
| `POST /api/skip` | `{ operatorId }` | no-show current, call next |
| `POST /api/operator` | `{ operatorId, online?, serviceIds? }` | pause/resume, set queues |
| `POST /api/reset` | — | reset all queues for the day |

## Stretch goals included

- **Admin dashboard** (`/admin`) — tickets issued/served today, no-shows, average
  wait & handling time per service type, busiest service type. Labels in Uzbek.
- **Notification sounds** on the TV when a number is called — a two-tone PA chime
  for a normal call, an urgent triple-tone for a recall — generated with WebAudio
  (no audio files), with an on-screen **Signal: yoniq / oʻchiq** toggle and a test
  button.
- **Pause/resume an operator** ("Operator dam olishda").
