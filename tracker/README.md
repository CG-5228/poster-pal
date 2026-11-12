# Poster Pal scan tracker

Each poster location gets its own QR code. When someone scans it, the scan is counted against that location and the visitor is sent on to the customer's link (for example a study sign-up form). The dashboard shows scans per location on a campus map, by day, hour and device.

Built by Cian Cabrera (source: https://github.com/cjjcab/qr-tracker, commit `d16cca7`). Integrated into Poster Pal with three small changes:

- the dashboard loads the order site's noticeboard list (`../config.js`), so adding a poster at a known spot is one pick from a list;
- the header links back to the order site;
- the order site has an "Add scan tracking" option, which puts the request and the destination link into the order code.

## Run it

Needs Node 20 or newer.

```bash
cd tracker
npm install
npm start
```

The dashboard opens at http://localhost:4317. QR codes point at this laptop's Wi-Fi address, so phones must be on the same network. To use a public address instead, start it with `PUBLIC_URL=https://your-address npm start`.

Data is stored in `tracker/data/tracker.db` (not committed). Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to use a hosted database.

## Before putting it on the public internet

The API has no login: anyone who can reach the server can add or delete posters. Add an admin key before hosting it publicly.

No names or raw IP addresses are stored. Unique visitors are counted with a salted hash that changes every day.
