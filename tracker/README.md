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

## Who can use the dashboard

The dashboard's data (`/api/*`) only answers requests made on the laptop running the tracker. Other devices on the network, and anything arriving through a proxy or tunnel, get a 401. The scan link `/p/<code>` stays public, because that is what phones open.

To use the dashboard from another device, start the tracker with an admin key and open the dashboard once with that key in the address:

```bash
ADMIN_TOKEN=choose-a-long-random-key npm start
# then open  https://your-address/#key=choose-a-long-random-key
```

The key is kept for that browser session and is only ever sent in a request header, never in an address.

If you give the tracker a public address (`PUBLIC_URL`) or run it behind a proxy (`TRUST_PROXY=1`), the laptop is no longer trusted automatically and the dashboard always needs `ADMIN_TOKEN`. `LOCAL_ADMIN=1` or `LOCAL_ADMIN=0` overrides that.

No names or raw IP addresses are stored. Unique visitors are counted with a salted hash that changes every day.
