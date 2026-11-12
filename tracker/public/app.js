'use strict';

const REFRESH_MS = 5000;

const state = {
  config: null,
  posters: [],
  customer: '',
  selectedId: null,
  stats: null,
  mode: 'overview', // overview | detail | add
  draft: null, // { lat, lng } while adding
};

const $ = (sel) => document.querySelector(sel);
const panel = $('#panel');

// ---------- utils ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Admin key, only needed when the dashboard is opened from another device:
// open it once as https://your-address/#key=YOUR_ADMIN_TOKEN and it is remembered for the session.
const ADMIN_KEY = (() => {
  try {
    const m = /[#&]key=([^&]+)/.exec(location.hash);
    if (m) {
      sessionStorage.setItem('pp_admin_key', decodeURIComponent(m[1]));
      history.replaceState(null, '', location.pathname + location.search);
    }
    return sessionStorage.getItem('pp_admin_key') || '';
  } catch {
    return '';
  }
})();
// With an admin key, QR images are fetched with the key in a header and shown from memory,
// so the key never appears in an image or download address.
const qrBlobUrls = new Map(); // poster id -> blob: URL
async function qrUrl(id) {
  if (!ADMIN_KEY) return `/api/posters/${id}/qr.png`;
  if (!qrBlobUrls.has(id)) {
    const res = await fetch(`/api/posters/${id}/qr.png`, { headers: { Authorization: `Bearer ${ADMIN_KEY}` } });
    if (!res.ok) throw new Error(`QR code failed to load (${res.status})`);
    qrBlobUrls.set(id, URL.createObjectURL(await res.blob()));
  }
  return qrBlobUrls.get(id);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (ADMIN_KEY) headers.Authorization = `Bearer ${ADMIN_KEY}`;
  const res = await fetch(path, { headers, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'Europe/Dublin' });
}

const visiblePosters = () => state.posters.filter((p) => !state.customer || p.customer === state.customer);

// ---------- Poster Pal spots (shared with the order site's config.js) ----------

const ppSpots = () => (window.POSTERPAL_CONFIG && Array.isArray(window.POSTERPAL_CONFIG.spots) ? window.POSTERPAL_CONFIG.spots : []);

function spotPicker(selectedId = '') {
  const spots = ppSpots();
  if (!spots.length) return '';
  return `<label>Poster Pal spot<select id="spot-pick">
    <option value="">Pick a noticeboard…</option>
    ${spots.map((s) => `<option value="${esc(s.id)}"${s.id === selectedId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
  </select></label>`;
}

// Choosing a spot drops the pin on that building and fills in its name.
function bindSpotPicker() {
  const sel = $('#spot-pick');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const s = ppSpots().find((x) => x.id === sel.value);
    if (!s) return;
    const latlng = [s.lat, s.lon];
    state.draft = { lat: s.lat, lng: s.lon, spotId: s.id, label: s.name };
    if (draftMarker) draftMarker.setLatLng(latlng);
    else draftMarker = L.marker(latlng).addTo(map);
    map.panTo(latlng);
    $('#add-hint').hidden = true;
    renderAddForm();
  });
}

// ---------- map ----------

const map = L.map('map', { zoomControl: true, minZoom: 15, maxZoom: 19 });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);
let draftMarker = null;

function markerStyle(p, max, selected) {
  const share = max > 0 ? p.scans / max : 0;
  // Pale for few scans, deep orange for the busiest poster.
  const light = Math.round(78 - share * 30);
  return {
    radius: 9 + Math.min(18, Math.sqrt(p.scans) * 3),
    color: selected ? '#111' : '#fff',
    weight: selected ? 3 : 2,
    fillColor: p.scans === 0 ? '#a8a29e' : `hsl(16, 96%, ${light}%)`,
    fillOpacity: 0.9,
  };
}

function renderMarkers() {
  markerLayer.clearLayers();
  const list = visiblePosters();
  const max = Math.max(0, ...list.map((p) => p.scans));
  for (const p of list) {
    const m = L.circleMarker([p.lat, p.lng], markerStyle(p, max, p.id === state.selectedId));
    m.bindTooltip(`<strong>${esc(p.label)}</strong><br>${p.scans} scan${p.scans === 1 ? '' : 's'}`, { direction: 'top', offset: [0, -8] });
    m.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (state.mode !== 'add') selectPoster(p.id);
    });
    markerLayer.addLayer(m);
  }
}

map.on('click', (e) => {
  if (state.mode !== 'add') {
    if (state.mode === 'detail') showOverview();
    return;
  }
  const b = state.config.bounds;
  const { lat, lng } = e.latlng;
  if (lat < b.south || lat > b.north || lng < b.west || lng > b.east) {
    alert('Posters must be on a DCU campus.');
    return;
  }
  state.draft = { lat, lng };
  if (draftMarker) draftMarker.setLatLng(e.latlng);
  else draftMarker = L.marker(e.latlng).addTo(map);
  $('#add-hint').hidden = true;
  renderAddForm();
});

// ---------- campus tabs & filter ----------

function renderCampusTabs() {
  const nav = $('#campus-tabs');
  nav.innerHTML = state.config.campuses
    .map((c, i) => `<button type="button" class="tab${i === 0 ? ' active' : ''}" data-id="${esc(c.id)}">${esc(c.name)}</button>`)
    .join('');
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const c = state.config.campuses.find((x) => x.id === btn.dataset.id);
    nav.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
    map.flyTo([c.lat, c.lng], c.zoom, { duration: 0.6 });
  });
}

function renderCustomerFilter() {
  const sel = $('#customer-filter');
  const names = [...new Set(state.posters.map((p) => p.customer).filter(Boolean))].sort();
  const current = state.customer;
  sel.innerHTML = '<option value="">All customers</option>' + names.map((n) => `<option>${esc(n)}</option>`).join('');
  sel.value = names.includes(current) ? current : '';
  state.customer = sel.value;
}

$('#customer-filter').addEventListener('change', (e) => {
  state.customer = e.target.value;
  if (state.mode === 'detail') {
    const p = state.posters.find((x) => x.id === state.selectedId);
    if (p && state.customer && p.customer !== state.customer) showOverview();
  }
  renderMarkers();
  if (state.mode === 'overview') renderOverview();
});

// ---------- panel: overview ----------

function renderOverview() {
  const list = visiblePosters();
  const scans = list.reduce((n, p) => n + p.scans, 0);
  const visitors = list.reduce((n, p) => n + p.visitors, 0);
  const ranked = [...list].sort((a, b) => b.scans - a.scans);
  panel.innerHTML = `
    <div class="panel-head">
      <p class="eyebrow">${state.customer ? esc(state.customer) : 'All customers'}</p>
      <h2>Overview</h2>
    </div>
    <div class="stats">
      <div class="stat"><span class="num">${list.length}</span><span class="lbl">Posters</span></div>
      <div class="stat"><span class="num">${scans}</span><span class="lbl">Scans</span></div>
      <div class="stat"><span class="num">${visitors}</span><span class="lbl">Unique</span></div>
    </div>
    <h3>Top spots</h3>
    ${
      ranked.length
        ? `<ol class="ranking">${ranked
            .map(
              (p) => `<li><button type="button" data-id="${p.id}">
                <span class="r-label">${esc(p.label)}<small>${esc(p.customer || 'No customer')}</small></span>
                <span class="r-num">${p.scans}</span></button></li>`,
            )
            .join('')}</ol>`
        : '<p class="empty">No posters yet. Press <strong>+ Add poster</strong> and click the map where one is.</p>'
    }`;
  panel.querySelectorAll('.ranking button').forEach((b) => b.addEventListener('click', () => selectPoster(Number(b.dataset.id), true)));
}

function showOverview() {
  state.mode = 'overview';
  state.selectedId = null;
  state.stats = null;
  renderMarkers();
  renderOverview();
}

// ---------- panel: poster detail ----------

async function selectPoster(id, pan = false) {
  state.mode = 'detail';
  state.selectedId = id;
  renderMarkers();
  const p = state.posters.find((x) => x.id === id);
  if (pan && p) map.panTo([p.lat, p.lng]);
  try {
    state.stats = await api(`/api/posters/${id}`);
    if (state.selectedId === id) renderDetail();
  } catch (err) {
    panel.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

function bars(items, labelOf, { tickEvery = 1 } = {}) {
  const max = Math.max(1, ...items.map((i) => i.scans));
  return `<div class="bars">${items
    .map(
      (it, idx) => `<div class="bar" title="${esc(labelOf(it))}: ${it.scans}">
        <span class="fill" style="height:${(it.scans / max) * 100}%"></span>
        <span class="tick">${idx % tickEvery === 0 ? esc(labelOf(it, true)) : ''}</span>
      </div>`,
    )
    .join('')}</div>`;
}

function renderDetail() {
  const s = state.stats;
  const p = s.poster;
  const devTotal = Object.values(s.devices).reduce((a, b) => a + b, 0);
  const busiest = s.hours.reduce((a, b) => (b.scans > a.scans ? b : a), { hour: -1, scans: 0 });
  panel.innerHTML = `
    <div class="panel-head">
      <button type="button" class="link back" id="back">&larr; Overview</button>
      <p class="eyebrow">${esc(p.customer || 'No customer')}</p>
      <h2>${esc(p.label)}</h2>
      <p class="meta">Placed ${fmtDate(p.placed_at)} &middot; last scan ${timeAgo(s.last_scan)}</p>
    </div>
    <div class="stats">
      <div class="stat"><span class="num">${s.total}</span><span class="lbl">Scans</span></div>
      <div class="stat"><span class="num">${s.visitors}</span><span class="lbl">Unique</span></div>
      <div class="stat"><span class="num">${busiest.hour < 0 ? '–' : `${String(busiest.hour).padStart(2, '0')}:00`}</span><span class="lbl">Busiest hour</span></div>
    </div>
    <h3>Last 14 days</h3>
    ${bars(s.days, (d, short) => (short ? d.day.slice(8) : d.day), { tickEvery: 2 })}
    <h3>Time of day</h3>
    ${bars(s.hours, (h, short) => (short ? String(h.hour) : `${String(h.hour).padStart(2, '0')}:00`), { tickEvery: 3 })}
    <h3>Devices</h3>
    <div class="devices">
      ${Object.entries(s.devices)
        .map(
          ([name, n]) => `<div class="device"><span>${esc(name)}</span>
            <span class="track"><span class="fill" style="width:${devTotal ? (n / devTotal) * 100 : 0}%"></span></span>
            <span class="n">${n}</span></div>`,
        )
        .join('')}
    </div>
    <h3>QR code</h3>
    <div class="qr">
      <img id="qr-img" alt="QR code for ${esc(p.label)}" width="140" height="140">
      <div class="qr-info">
        <code>${esc(p.scan_url)}</code>
        <p class="meta">${p.target_url ? `Goes to ${esc(p.target_url)}` : 'No link set: shows a thank-you page.'}</p>
        <a class="btn" id="qr-dl" download="qr-${esc(p.code)}.png">Download PNG</a>
      </div>
    </div>
    <p class="note">Unique counts one phone per day. Opening the scan link in this browser also counts as a scan.</p>
    <button type="button" class="btn danger" id="delete">Delete poster</button>`;
  qrUrl(p.id)
    .then((src) => {
      const img = $('#qr-img');
      const dl = $('#qr-dl');
      if (img) img.src = src;
      if (dl) dl.href = ADMIN_KEY ? src : `/api/posters/${p.id}/qr.png?download=1`;
    })
    .catch((err) => console.warn(err.message));
  $('#back').addEventListener('click', showOverview);
  $('#delete').addEventListener('click', async () => {
    if (!confirm(`Delete "${p.label}" and all its scans?`)) return;
    try {
      await api(`/api/posters/${p.id}`, { method: 'DELETE' });
      await refresh();
      showOverview();
    } catch (err) {
      alert(err.message);
    }
  });
}

// ---------- panel: add poster ----------

function startAdd() {
  state.mode = 'add';
  state.selectedId = null;
  state.draft = null;
  $('#add-hint').hidden = false;
  map.getContainer().classList.add('adding');
  renderMarkers();
  panel.innerHTML = `
    <div class="panel-head"><h2>Add poster</h2></div>
    <p class="empty">Click the map where the poster is up${ppSpots().length ? ', or pick a Poster Pal spot' : ''}.</p>
    <div class="form">${spotPicker()}</div>
    <button type="button" class="link" id="cancel-panel">Cancel</button>`;
  $('#cancel-panel').addEventListener('click', cancelAdd);
  bindSpotPicker();
}

function cancelAdd() {
  if (draftMarker) {
    map.removeLayer(draftMarker);
    draftMarker = null;
  }
  state.draft = null;
  $('#add-hint').hidden = true;
  map.getContainer().classList.remove('adding');
  showOverview();
}

function renderAddForm() {
  const customers = [...new Set(state.posters.map((p) => p.customer).filter(Boolean))].sort();
  const today = new Date().toISOString().slice(0, 10);
  panel.innerHTML = `
    <div class="panel-head"><h2>Add poster</h2>
      <p class="meta">${state.draft.lat.toFixed(5)}, ${state.draft.lng.toFixed(5)} &middot; click the map again to move it</p>
    </div>
    <form id="add-form" class="form">
      ${spotPicker(state.draft.spotId)}
      <label>Location name<input name="label" required maxlength="120" placeholder="e.g. Library entrance" value="${esc(state.draft.label ?? '')}"></label>
      <label>Customer<input name="customer" maxlength="120" list="customer-list" placeholder="e.g. Hub Café" value="${esc(state.customer)}"></label>
      <datalist id="customer-list">${customers.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <label>Link (optional)<input name="target_url" type="url" placeholder="https://… leave empty for now"></label>
      <label>Placed on<input name="placed_at" type="date" value="${today}"></label>
      <p class="error" id="form-error" hidden></p>
      <div class="row">
        <button class="btn primary" type="submit">Save poster</button>
        <button class="link" type="button" id="cancel-form">Cancel</button>
      </div>
    </form>`;
  $('#cancel-form').addEventListener('click', cancelAdd);
  bindSpotPicker();
  const form = $('#add-form');
  form.label.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      const poster = await api('/api/posters', {
        method: 'POST',
        body: JSON.stringify({ ...data, lat: state.draft.lat, lng: state.draft.lng }),
      });
      if (draftMarker) {
        map.removeLayer(draftMarker);
        draftMarker = null;
      }
      map.getContainer().classList.remove('adding');
      await refresh();
      selectPoster(poster.id);
    } catch (err) {
      const el = $('#form-error');
      el.textContent = err.message;
      el.hidden = false;
    }
  });
}

$('#add-btn').addEventListener('click', startAdd);
$('#cancel-add').addEventListener('click', cancelAdd);

// ---------- data refresh ----------

async function refresh() {
  state.posters = await api('/api/posters');
  renderCustomerFilter();
  renderMarkers();
}

async function tick() {
  try {
    await refresh();
    if (state.mode === 'overview') renderOverview();
    if (state.mode === 'detail' && state.selectedId != null) {
      if (!state.posters.some((p) => p.id === state.selectedId)) return showOverview();
      const id = state.selectedId;
      const stats = await api(`/api/posters/${id}`);
      if (state.mode === 'detail' && state.selectedId === id) {
        state.stats = stats;
        renderDetail();
      }
    }
  } catch (err) {
    console.warn('Refresh failed', err);
  }
}

async function start() {
  state.config = await api('/api/config');
  const b = state.config.bounds;
  map.setMaxBounds([[b.south, b.west], [b.north, b.east]]);
  const first = state.config.campuses[0];
  map.setView([first.lat, first.lng], first.zoom);
  renderCampusTabs();
  await refresh();
  showOverview();
  setInterval(tick, REFRESH_MS);
}

start().catch((err) => {
  panel.innerHTML = `<p class="error">Could not load: ${esc(err.message)}</p>`;
});
