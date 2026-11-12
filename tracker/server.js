import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { all, get, run, init } from './db.js';

const PORT = Number(process.env.PORT ?? 4317);
const TZ = 'Europe/Dublin';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');

// Phones scan the QR code, so it must point at an address they can reach:
// this laptop's Wi-Fi/Ethernet IP, not localhost. PUBLIC_URL overrides it.
function lanAddress() {
  const skip = /^(lo|virbr|docker|br-|veth|tun|tap|tailscale|zt)/;
  const found = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) found.push({ name, address: a.address });
    }
  }
  const preferred = found.find((f) => /^(wl|en|eth)/.test(f.name)) ?? found[0];
  return preferred?.address ?? 'localhost';
}

// DCU only for now: Glasnevin, St Patrick's (Drumcondra) and All Hallows.
// Centres are approximate; the bounds box covers all three with some margin.
const CAMPUSES = [
  { id: 'glasnevin', name: 'Glasnevin', lat: 53.3858, lng: -6.2564, zoom: 17 },
  { id: 'st-pats', name: "St Patrick's", lat: 53.3707, lng: -6.256, zoom: 18 },
  { id: 'all-hallows', name: 'All Hallows', lat: 53.3713, lng: -6.2481, zoom: 18 },
];
const DCU_BOUNDS = { south: 53.362, west: -6.272, north: 53.394, east: -6.236 };
const insideDcu = (lat, lng) =>
  lat >= DCU_BOUNDS.south && lat <= DCU_BOUNDS.north && lng >= DCU_BOUNDS.west && lng <= DCU_BOUNDS.east;

const BASE_URL = (process.env.PUBLIC_URL ?? `http://${lanAddress()}:${PORT}`).replace(/\/$/, '');
let visitorSecret = '';

// ---------- access control ----------
// The dashboard API (/api/*) is for the operator only. Requests made on this machine are
// allowed. Anything that arrives over the network, or through a proxy or tunnel, must present
// ADMIN_TOKEN. The scan link /p/<code> stays public, because that is what phones open.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const sha = (s) => createHash('sha256').update(String(s)).digest();

// Trusting "this machine" is only safe for a plain local run. Once the tracker has a public
// address (PUBLIC_URL) or sits behind a proxy (TRUST_PROXY), a proxy or tunnel can make outside
// requests look local, so local trust switches off and every API call needs ADMIN_TOKEN.
// LOCAL_ADMIN=1 or LOCAL_ADMIN=0 overrides that default.
const LOCAL_ADMIN = process.env.LOCAL_ADMIN ? process.env.LOCAL_ADMIN === '1' : !process.env.PUBLIC_URL && !TRUST_PROXY;
const LOOPBACK_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);

function isLocal(req) {
  if (!LOCAL_ADMIN) return false;
  const h = req.headers;
  if (h['x-forwarded-for'] || h.forwarded || h['x-real-ip'] || h['cf-connecting-ip']) return false;
  if (!LOOPBACK_HOSTS.has(h.host ?? '')) return false; // the browser must have asked for localhost itself
  const addr = req.socket.remoteAddress ?? '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// A website open in the operator's browser could try to call http://localhost behind their back.
// So API calls must be addressed to a host we actually serve, must come from our own pages when
// the browser says where they come from, and writes must be JSON, which another site cannot send
// without permission that this server never gives.
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`, `${lanAddress()}:${PORT}`, new URL(BASE_URL).host]);

function sameSite(req) {
  const host = req.headers.host ?? '';
  if (!ALLOWED_HOSTS.has(host)) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && !/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return false;
  return true;
}

// The key is only accepted in the Authorization header, never in an address, so it cannot end
// up in browser history, logs or shared links.
function isAdmin(req) {
  if (isLocal(req)) return true;
  if (!ADMIN_TOKEN) return false;
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  return given.length > 0 && timingSafeEqual(sha(given), sha(ADMIN_TOKEN));
}

// ---------- helpers ----------

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
const dublinDay = (d) => dayFmt.format(d); // YYYY-MM-DD
const dublinHour = (d) => Number(hourFmt.format(d));

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw Object.assign(new Error('Body too large'), { status: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function newCode() {
  // 6 characters, no look-alikes (0/O, 1/l/I).
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function deviceOf(ua = '') {
  if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone';
  if (/android/i.test(ua)) return 'Android';
  return 'Other';
}

// X-Forwarded-For can be set by anyone, so it is only believed behind a proxy we run
// (TRUST_PROXY=1), and then only its last hop, which is the one that proxy added.
function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',').pop().trim();
  }
  return req.socket.remoteAddress ?? '';
}

// One person on one day = one hash. The day is part of the hash, so the same
// person can't be followed across days, and no raw IP is ever stored.
function visitorHash(req, now) {
  return createHash('sha256')
    .update(`${visitorSecret}|${dublinDay(now)}|${clientIp(req)}|${req.headers['user-agent'] ?? ''}`)
    .digest('hex')
    .slice(0, 20);
}

const scanUrl = (code) => `${BASE_URL}/p/${code}`;

function validUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function scanPage(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#fafaf9;color:#1c1917;padding:24px;box-sizing:border-box;text-align:center}
h1{font-size:1.5rem;margin:0 0 8px}p{color:#57534e;margin:0;max-width:32ch}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

// ---------- routes ----------

async function listPosters() {
  const rows = await all(`
    SELECT p.id, p.code, p.label, p.customer, p.lat, p.lng, p.target_url, p.placed_at,
           COUNT(s.id) AS scans,
           COUNT(DISTINCT s.visitor) AS visitors,
           MAX(s.scanned_at) AS last_scan
    FROM posters p LEFT JOIN scans s ON s.poster_id = p.id
    GROUP BY p.id ORDER BY p.created_at`);
  return rows.map((r) => ({ ...r, scan_url: scanUrl(r.code) }));
}

async function posterStats(id) {
  const poster = await get('SELECT * FROM posters WHERE id = ?', [id]);
  if (!poster) return null;
  const scans = await all('SELECT scanned_at, visitor, device FROM scans WHERE poster_id = ? ORDER BY scanned_at', [id]);

  const now = new Date();
  const days = [];
  for (let i = 13; i >= 0; i--) days.push({ day: dublinDay(new Date(now.getTime() - i * 86_400_000)), scans: 0 });
  const dayIndex = new Map(days.map((d, i) => [d.day, i]));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, scans: 0 }));
  const devices = { iPhone: 0, Android: 0, Other: 0 };

  for (const s of scans) {
    const at = new Date(s.scanned_at);
    const i = dayIndex.get(dublinDay(at));
    if (i !== undefined) days[i].scans++;
    hours[dublinHour(at)].scans++;
    devices[s.device] = (devices[s.device] ?? 0) + 1;
  }

  return {
    poster: { ...poster, scan_url: scanUrl(poster.code) },
    total: scans.length,
    visitors: new Set(scans.map((s) => s.visitor)).size,
    first_scan: scans[0]?.scanned_at ?? null,
    last_scan: scans.at(-1)?.scanned_at ?? null,
    days,
    hours,
    devices,
  };
}

async function handleScan(req, res, code) {
  const poster = await get('SELECT id, label, target_url FROM posters WHERE code = ?', [code]);
  if (!poster) return send(res, 404, scanPage('Poster not found', 'This QR code is not linked to a poster.'), { 'Content-Type': 'text/html; charset=utf-8' });

  // Only real page loads count. HEAD requests come from link checkers, not people.
  if (req.method === 'GET') {
    const now = new Date();
    await run('INSERT INTO scans (poster_id, scanned_at, visitor, device) VALUES (?, ?, ?, ?)', [
      poster.id,
      now.toISOString(),
      visitorHash(req, now),
      deviceOf(req.headers['user-agent']),
    ]);
  }

  if (poster.target_url) return send(res, 302, '', { Location: poster.target_url });
  return send(res, 200, scanPage('Thanks for scanning!', `Your scan of "${poster.label}" was counted. This poster has no link set yet.`), {
    'Content-Type': 'text/html; charset=utf-8',
  });
}

const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, 'Not found');
  try {
    const body = await readFile(file);
    return send(res, 200, body, { 'Content-Type': STATIC_TYPES[path.extname(file)] ?? 'application/octet-stream' });
  } catch {
    return send(res, 404, 'Not found');
  }
}

async function route(req, res) {
  const url = new URL(req.url, 'http://local');
  const { pathname } = url;
  const method = req.method;
  let m;

  if ((m = pathname.match(/^\/p\/([a-z0-9]{1,32})\/?$/)) && (method === 'GET' || method === 'HEAD')) {
    return handleScan(req, res, m[1]);
  }

  if (pathname.startsWith('/api/')) {
    if (!sameSite(req)) return json(res, 403, { error: 'This request is not allowed from here.' });
    if (!isAdmin(req)) return json(res, 401, { error: 'Open the dashboard on the laptop running the tracker, or use the admin key.' });
  }

  if (pathname === '/api/config' && method === 'GET') {
    return json(res, 200, { base_url: BASE_URL, time_zone: TZ, campuses: CAMPUSES, bounds: DCU_BOUNDS });
  }

  if (pathname === '/api/posters' && method === 'GET') return json(res, 200, await listPosters());

  if (pathname === '/api/posters' && method === 'POST') {
    const body = await readJson(req);
    const label = String(body.label ?? '').trim();
    const customer = String(body.customer ?? '').trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const target = validUrl(String(body.target_url ?? '').trim());
    if (!label) return json(res, 400, { error: 'Give the poster a location name.' });
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return json(res, 400, { error: 'Pick a spot on the map.' });
    }
    if (!insideDcu(lat, lng)) return json(res, 400, { error: 'Posters must be on a DCU campus.' });
    if (target === undefined) return json(res, 400, { error: 'The link must start with http:// or https://' });
    const now = new Date().toISOString();
    const placedAt = body.placed_at && !Number.isNaN(Date.parse(body.placed_at)) ? new Date(body.placed_at).toISOString() : now;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { lastId } = await run(
          'INSERT INTO posters (code, label, customer, lat, lng, target_url, placed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [newCode(), label.slice(0, 120), customer.slice(0, 120), lat, lng, target, placedAt, now],
        );
        return json(res, 201, (await posterStats(lastId)).poster);
      } catch (err) {
        if (!/UNIQUE/i.test(String(err.message))) throw err; // code collision: try another
      }
    }
    return json(res, 500, { error: 'Could not create a unique code.' });
  }

  if ((m = pathname.match(/^\/api\/posters\/(\d+)$/))) {
    const id = Number(m[1]);
    if (method === 'GET') {
      const stats = await posterStats(id);
      return stats ? json(res, 200, stats) : json(res, 404, { error: 'Poster not found' });
    }
    if (method === 'DELETE') {
      await run('DELETE FROM scans WHERE poster_id = ?', [id]);
      const { changes } = await run('DELETE FROM posters WHERE id = ?', [id]);
      return changes ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Poster not found' });
    }
  }

  if ((m = pathname.match(/^\/api\/posters\/(\d+)\/qr\.png$/)) && method === 'GET') {
    const poster = await get('SELECT code, label FROM posters WHERE id = ?', [Number(m[1])]);
    if (!poster) return send(res, 404, 'Not found');
    const png = await QRCode.toBuffer(scanUrl(poster.code), { type: 'png', width: 1024, margin: 2, errorCorrectionLevel: 'M' });
    const headers = { 'Content-Type': 'image/png' };
    if (url.searchParams.has('download')) {
      const safe = poster.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'poster';
      headers['Content-Disposition'] = `attachment; filename="qr-${safe}-${poster.code}.png"`;
    }
    return send(res, 200, png, headers);
  }

  // Poster Pal: share the order site's noticeboard spots (../config.js) with the dashboard.
  if (pathname === '/posterpal-config.js' && method === 'GET') {
    const headers = { 'Content-Type': 'text/javascript; charset=utf-8' };
    try {
      return send(res, 200, await readFile(path.join(ROOT, '..', 'config.js')), headers);
    } catch {
      return send(res, 200, 'window.POSTERPAL_CONFIG = null;', headers);
    }
  }

  if (method === 'GET' && !pathname.startsWith('/api/')) return serveStatic(res, pathname);
  return json(res, 404, { error: 'Not found' });
}

visitorSecret = await init();

http
  .createServer((req, res) => {
    route(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) json(res, err.status ?? 500, { error: err.status ? err.message : 'Server error' });
    });
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`QR tracker running`);
    console.log(`  Dashboard:  http://localhost:${PORT}`);
    console.log(`  QR codes point at ${BASE_URL}/p/<code> (phones must be on the same Wi-Fi)`);
    if (!LOCAL_ADMIN && !ADMIN_TOKEN) console.log('  Dashboard is locked: start with ADMIN_TOKEN=<your key> to use it (see README).');
  });
