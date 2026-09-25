// =====================================================================
//  TMBO: There Must Be Order
//  Main app: UI, tasks, events, study timer, reminders, app lock.
//  Data is always saved on the device first. When signed in, every change
//  is also sent to Supabase through the sync queue in cloud.js.
// =====================================================================
import { APP_VERSION } from './config.js';
import * as cloud from './cloud.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
const shake = (el) => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ================= ICONS ================= */
const sv = (p, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  logo: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="14" width="4.5" height="7" rx="1.2"/><rect x="9.75" y="9" width="4.5" height="12" rx="1.2"/><rect x="16.5" y="3" width="4.5" height="18" rx="1.2"/></svg>',
  check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3.2),
  repeat: sv('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 01-4 4H3"/>', 2.4),
  arrow: sv('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.4),
  dots: sv('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', 2.2),
  left: sv('<path d="M15 5l-7 7 7 7"/>', 2.4),
  right: sv('<path d="M9 5l7 7-7 7"/>', 2.4),
  plus: sv('<path d="M12 5v14M5 12h14"/>', 2.6),
  home: sv('<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>'),
  list: sv('<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.5 1.5L7.5 5"/><path d="M3.5 12l1.5 1.5L7.5 11"/><path d="M3.5 18l1.5 1.5L7.5 17"/>'),
  cal: sv('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
  timer: sv('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>'),
  gear: sv('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  shuffle: sv('<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>'),
  brush: sv('<path d="M14.5 4.5l5 5L10 19l-5.5.5L5 14z"/><path d="M12 7l5 5"/>'),
  lock: sv('<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>'),
  back: sv('<path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-6 6M11 9l6 6"/>'),
  x: sv('<path d="M6 6l12 12M18 6L6 18"/>', 2.4),
  bell: sv('<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a2 2 0 003.4 0"/>'),
  image: sv('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  flag: sv('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  share: sv('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>'),
};

/* ================= DATES ================= */
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const diffDays = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 864e5);
const today = () => toKey(new Date());
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtLong = (k) => fromKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const fmtShort = (k) => fromKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtDay = (k) => fromKey(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
const fmtClock = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/* ================= CONSTANTS ================= */
const TEXT_SIZES = [14, 16, 18, 20];
const ACCENTS = ['#4f46e5', '#2563eb', '#0d9488', '#16a34a', '#ea580c', '#db2777', '#7c3aed', '#334155'];
const DEFAULT_TIERS = ['Must do', 'Should do', 'Could do', 'Nice to have'];
const REPEAT_LABEL = { once: 'One-time', daily: 'Every day', weekdays: 'Weekdays', custom: 'Custom' };
const TYPE_LABEL = { test: 'Test / exam', interview: 'Interview', deadline: 'Deadline', other: 'Event' };
const REMIND_OPTS = [{ v: 14, l: '2 weeks before' }, { v: 7, l: '1 week before' }, { v: 3, l: '3 days before' }, { v: 1, l: '1 day before' }, { v: 0, l: 'Day of' }];
const QUOTES = [
  { id: 'q0', text: 'There Must Be Order.', author: '' },
  { id: 'q1', text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
  { id: 'q2', text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant' },
  { id: 'q3', text: 'It always seems impossible until it’s done.', author: 'Nelson Mandela' },
  { id: 'q4', text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { id: 'q5', text: 'Order is the shape upon which beauty depends.', author: 'Pearl S. Buck' },
  { id: 'q6', text: 'Small deeds done are better than great deeds planned.', author: 'Peter Marshall' },
  { id: 'q7', text: 'You don’t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { id: 'q8', text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier' },
  { id: 'q9', text: 'Dream big. Start small. Act now.', author: 'Robin Sharma' },
  { id: 'q10', text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { id: 'q11', text: 'Plan your work. Work your plan.', author: 'Proverb' },
  { id: 'q12', text: 'Order today. Freedom tomorrow.', author: 'TMBO' },
  { id: 'q13', text: 'One task at a time. One day at a time.', author: 'TMBO' },
];
const SCENES = [{ id: 'summit', l: 'Summit' }, { id: 'sunrise', l: 'Sunrise' }, { id: 'steps', l: 'Steps' }, { id: 'waves', l: 'Waves' }, { id: 'photo', l: 'Your photo' }];
const PALETTES = {
  midnight: { l: 'Midnight', bg1: '#0f1535', bg2: '#46307a', l1: '#2d3170', l2: '#1d2152', l3: '#10133a', sun: '#f5c26b' },
  dawn: { l: 'Dawn', bg1: '#5b3a9c', bg2: '#ff8a5c', l1: '#b04a6e', l2: '#7d2f5e', l3: '#4a1a45', sun: '#ffe29a' },
  ocean: { l: 'Ocean', bg1: '#0b3d6b', bg2: '#2aa5b8', l1: '#1f6f95', l2: '#155577', l3: '#0b3a57', sun: '#e9fbff' },
  forest: { l: 'Forest', bg1: '#1f4d3a', bg2: '#9fcf8f', l1: '#3e7d59', l2: '#2b6146', l3: '#1a3f2e', sun: '#fff1b8' },
  gold: { l: 'Onyx & gold', bg1: '#0c0c0c', bg2: '#2e2a22', l1: '#3a3326', l2: '#26211a', l3: '#15120d', sun: '#d4af37' },
  accent: { l: 'Match app color' },
};
const FONTS = [{ v: 'bold', l: 'Bold' }, { v: 'classic', l: 'Classic' }, { v: 'modern', l: 'Modern' }];

/* ================= STATE ================= */
const defaultData = () => ({
  tasks: [], events: [], sessions: [], customQuotes: [],
  profile: { name: '' },
  home: { scene: 'summit', palette: 'midnight', font: 'bold', photo: null, photoPath: null, quoteId: 'q0', randomOnOpen: false },
  notif: { enabled: false, time: '09:00', summary: true },
  settings: { accent: ACCENTS[0], mode: 'system', textSize: 1, template: 'classic', tierLabels: [...DEFAULT_TIERS], defaultCarry: true, showDone: true },
});
const DATA_KEYS = Object.keys(defaultData());
const state = { selected: today(), calMonth: null, tab: 'home', ...defaultData() };

// Device-only settings (never synced)
const device = { onboarded: false, mode: 'guest', push: false, installDismissed: false, ...LS.get('tmbo:device', {}) };
const saveDevice = () => LS.set('tmbo:device', device);

// Current session: guest (this device only) or account (Supabase)
const session = { mode: 'guest', db: null, user: null, queue: null, channel: null, hadCloudSettings: false };
const isAccount = () => session.mode === 'account' && !!session.user;
const cacheKey = () => (isAccount() ? `tmbo:acct:${session.user.id}` : 'tmbo:guest');

function snapshot() { const o = {}; DATA_KEYS.forEach((k) => (o[k] = state[k])); return o; }
function loadData(obj) {
  const d = defaultData();
  DATA_KEYS.forEach((k) => {
    const v = obj?.[k];
    state[k] = v == null ? d[k] : Array.isArray(d[k]) ? v : { ...d[k], ...v };
  });
  if (!Array.isArray(state.settings.tierLabels) || state.settings.tierLabels.length !== 4) state.settings.tierLabels = [...DEFAULT_TIERS];
}
let persistT;
function persist() {
  clearTimeout(persistT);
  persistT = setTimeout(() => { if (!LS.set(cacheKey(), snapshot())) toast('Your device storage is full. Try removing your home photo.'); }, 200);
}

/* ================= STORE (local + cloud) ================= */
const up = (table, key, row, onConflict) => session.queue?.push({ kind: 'upsert', table, key, row, onConflict });
const del = (table, key, match) => session.queue?.push({ kind: 'delete', table, key, match });
const cloudOn = () => isAccount() && !!session.queue;
const Store = {
  saveTask(t) { persist(); if (cloudOn()) up('tasks', t.id, cloud.toTaskRow(t)); },
  deleteTask(id) { persist(); if (cloudOn()) del('tasks', id, { id }); },
  setCompletion(id, day, done) {
    persist(); if (!cloudOn()) return;
    const key = `${id}:${day}`;
    if (done) up('task_completions', key, { task_id: id, completed_on: day }, 'task_id,completed_on');
    else del('task_completions', key, { task_id: id, completed_on: day });
  },
  saveEvent(e) { persist(); if (cloudOn()) up('events', e.id, cloud.toEventRow(e)); },
  deleteEvent(id) { persist(); if (cloudOn()) del('events', id, { id }); },
  saveSettings() { persist(); if (cloudOn()) up('user_settings', session.user.id, cloud.toSettingsRow(state, session.user.id), 'user_id'); },
  saveQuote(q) { persist(); if (cloudOn()) up('custom_quotes', q.id, cloud.toQuoteRow(q)); },
  deleteQuote(id) { persist(); if (cloudOn()) del('custom_quotes', id, { id }); },
  saveSession(s) { persist(); if (cloudOn()) up('study_sessions', s.id, cloud.toSessionRow(s)); },
};

/* ================= TASK LOGIC ================= */
function occursOn(t, k) {
  if (t.repeat === 'once') return t.date === k;
  if (k < t.date) return false;
  if (t.until && k > t.until) return false;
  const d = fromKey(k).getDay();
  if (t.repeat === 'daily') return true;
  if (t.repeat === 'weekdays') return d > 0 && d < 6;
  return (t.days || []).includes(d);
}
const isDone = (t, k) => (t.repeat === 'once' ? !!t.done : !!t.completions?.[k]);
const tasksFor = (k) => state.tasks.filter((t) => occursOn(t, k));
const sortTasks = (list, k) => list.sort((a, b) => (isDone(a, k) - isDone(b, k)) || (a.tier - b.tier) || (a.createdAt - b.createdAt));
const byTier = (list) => [...list].sort((a, b) => (a.tier - b.tier) || (a.createdAt - b.createdAt));
const findTask = (id) => state.tasks.find((t) => t.id === id);
function streak(t) {
  let k = today(), n = 0, g = 0;
  if (!t.completions?.[k]) k = addDays(k, -1);
  while (g++ < 400 && k >= t.date) { if (occursOn(t, k)) { if (t.completions?.[k]) n++; else break; } k = addDays(k, -1); }
  return n;
}
// Move unfinished one-time tasks (with carry-over on) forward to today.
function rollover() {
  const td = today(); let moved = 0;
  state.tasks.forEach((t) => {
    if (t.repeat === 'once' && !t.done && t.carryOver && t.date < td) {
      t.carried = (t.carried || 0) + diffDays(t.date, td); t.date = td; moved++; Store.saveTask(t);
    }
  });
  return moved;
}
const repeatText = (t) => (t.repeat === 'custom' ? (t.days || []).slice().sort((a, b) => a - b).map((d) => DOW[d].slice(0, 2)).join(' ') : REPEAT_LABEL[t.repeat]);
const newTask = (o) => ({ id: uuid(), notes: '', days: [], completions: {}, done: false, doneOn: null, carried: 0, carryOver: false, remindAt: '', until: null, eventId: null, createdAt: Date.now(), ...o, originalDate: o.originalDate || o.date });

/* ================= EVENTS ================= */
const daysUntil = (ev) => diffDays(today(), ev.date);
const upcomingEvents = () => state.events.filter((e) => daysUntil(e) >= 0).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
const eventsOn = (k) => state.events.filter((e) => e.date === k);
function syncPrepTask(ev) {
  let t = ev.prepTaskId && findTask(ev.prepTaskId);
  const lastDay = addDays(ev.date, -1);
  const lead = Math.max(1, ...ev.remind);
  let start = addDays(ev.date, -lead);
  if (start < today()) start = today();
  if (t && t.date < start) start = t.date;
  if (ev.prep && lastDay >= start) {
    const fields = { title: `Prepare: ${ev.title}`, notes: `${TYPE_LABEL[ev.type]} on ${fmtDay(ev.date)}${ev.time ? ' at ' + fmtTime(ev.time) : ''}`, tier: 1, repeat: 'daily', days: [], date: start, until: lastDay, carryOver: false, eventId: ev.id };
    if (t) Object.assign(t, fields); else { t = newTask(fields); state.tasks.push(t); ev.prepTaskId = t.id; }
    Store.saveTask(t);
  } else if (t) {
    state.tasks = state.tasks.filter((x) => x !== t); Store.deleteTask(t.id); ev.prepTaskId = null;
  }
}

/* ================= HERO GRAPHIC ================= */
function mix(a, b, t) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function pal(name) {
  if (name !== 'accent') return PALETTES[name] || PALETTES.midnight;
  const a = /^#[0-9a-f]{6}$/i.test(state.settings.accent) ? state.settings.accent : ACCENTS[0];
  return { bg1: mix(a, '#000000', 0.6), bg2: mix(a, '#ffffff', 0.2), l1: mix(a, '#000000', 0.3), l2: mix(a, '#000000', 0.5), l3: mix(a, '#000000', 0.7), sun: mix(a, '#ffffff', 0.85) };
}
let svgSeq = 0;
function heroSVG(scene, palName) {
  const p = pal(palName), id = 'g' + (++svgSeq);
  const defs = `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient><radialGradient id="${id}g"><stop offset="0" stop-color="${p.sun}" stop-opacity=".6"/><stop offset="1" stop-color="${p.sun}" stop-opacity="0"/></radialGradient></defs><rect width="400" height="320" fill="url(#${id}s)"/>`;
  const stars = [[40, 40], [92, 72], [150, 28], [232, 52], [362, 38], [20, 112], [190, 92], [120, 130]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1 : 1.7}" fill="#fff" opacity=".55"/>`).join('');
  let art = '';
  if (scene === 'sunrise') {
    let rays = ''; for (let a = -80; a <= 80; a += 16) { const r = a * Math.PI / 180; rays += `<line x1="200" y1="215" x2="${(200 + 420 * Math.sin(r)).toFixed(1)}" y2="${(215 - 420 * Math.cos(r)).toFixed(1)}" stroke="${p.sun}" stroke-width="16" opacity=".1"/>`; }
    art = `${rays}<circle cx="200" cy="215" r="120" fill="url(#${id}g)"/><circle cx="200" cy="215" r="58" fill="${p.sun}"/>
      <path d="M0 212 Q100 190 200 210 T400 204 V320 H0Z" fill="${p.l1}"/><rect y="226" width="400" height="94" fill="${p.l2}"/>
      <rect x="150" y="240" width="100" height="5" rx="2.5" fill="${p.sun}" opacity=".45"/><rect x="170" y="256" width="60" height="5" rx="2.5" fill="${p.sun}" opacity=".35"/><rect x="186" y="272" width="28" height="5" rx="2.5" fill="${p.sun}" opacity=".25"/>
      <path d="M0 292 Q200 268 400 294 V320 H0Z" fill="${p.l3}"/>`;
  } else if (scene === 'steps') {
    let grid = ''; for (let x = 40; x < 400; x += 40) grid += `<line x1="${x}" y1="0" x2="${x}" y2="320" stroke="#fff" opacity=".06"/>`; for (let y = 40; y < 320; y += 40) grid += `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#fff" opacity=".06"/>`;
    let steps = ''; for (let i = 0; i < 6; i++) { const h = 42 + i * 34, x = 26 + i * 60, c = i % 2 ? p.l2 : p.l1; steps += `<rect x="${x}" y="${300 - h}" width="54" height="${h + 20}" rx="8" fill="${c}"/><rect x="${x}" y="${300 - h}" width="54" height="6" rx="3" fill="${p.sun}" opacity=".35"/>`; }
    art = `${grid}${stars}${steps}<circle cx="353" cy="62" r="46" fill="url(#${id}g)"/><circle cx="353" cy="62" r="15" fill="${p.sun}"/><rect y="300" width="400" height="20" fill="${p.l3}"/>`;
  } else if (scene === 'waves') {
    art = `${stars}<circle cx="110" cy="110" r="80" fill="url(#${id}g)"/><circle cx="110" cy="110" r="32" fill="${p.sun}"/>
      <path d="M0 190 Q50 168 100 190 T200 190 T300 190 T400 190 V320 H0Z" fill="${p.l1}"/>
      <path d="M0 232 Q50 254 100 232 T200 232 T300 232 T400 232 V320 H0Z" fill="${p.l2}"/>
      <path d="M0 276 Q50 256 100 276 T200 276 T300 276 T400 276 V320 H0Z" fill="${p.l3}"/>`;
  } else {
    art = `${stars}<circle cx="300" cy="100" r="80" fill="url(#${id}g)"/><circle cx="300" cy="100" r="30" fill="${p.sun}"/>
      <path d="M0 230 L70 150 L120 195 L190 105 L250 180 L305 135 L400 215 V320 H0Z" fill="${p.l1}"/>
      <path d="M190 105 L173 127 L183 123 L190 132 L198 122 L207 126Z" fill="#fff" opacity=".75"/>
      <path d="M0 262 L95 185 L150 230 L220 150 L285 220 L345 185 L400 238 V320 H0Z" fill="${p.l2}"/>
      <path d="M220 150 V116" stroke="${p.sun}" stroke-width="2.5"/><path d="M220 116 L241 123 L220 130Z" fill="${p.sun}"/>
      <path d="M0 292 Q100 255 200 282 T400 272 V320 H0Z" fill="${p.l3}"/>`;
  }
  return `<svg viewBox="0 0 400 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${defs}${art}</svg>`;
}
const allQuotes = () => [...QUOTES, ...state.customQuotes];
const currentQuote = () => allQuotes().find((q) => q.id === state.home.quoteId) || QUOTES[0];
const qSize = (t) => (t.length <= 24 ? '2.15rem' : t.length <= 60 ? '1.55rem' : t.length <= 110 ? '1.25rem' : '1.05rem');
const heroBg = () => (state.home.scene === 'photo' && state.home.photo ? `<img src="${state.home.photo}" alt="">` : heroSVG(state.home.scene === 'photo' ? 'summit' : state.home.scene, state.home.palette));
function heroHTML(actions) {
  const h = state.home, q = currentQuote();
  return `<div class="hero" data-font="${h.font}"><div class="hero-bg">${heroBg()}</div><div class="hero-shade"></div><div class="hero-badge">TMBO</div>
    <div class="hero-content"><div class="hero-quote" style="font-size:${qSize(q.text)}">${esc(q.text)}</div>${q.author ? `<div class="hero-author">— ${esc(q.author)}</div>` : ''}</div>
    ${actions ? `<div class="hero-actions"><button id="heroShuffle" aria-label="Random quote">${IC.shuffle}</button><button id="heroCustomize" aria-label="Customize home">${IC.brush}</button></div>` : ''}</div>`;
}
function randomQuote(rerender) {
  const pool = allQuotes().filter((q) => q.id !== state.home.quoteId);
  if (!pool.length) return;
  state.home.quoteId = pool[Math.floor(Math.random() * pool.length)].id;
  Store.saveSettings();
  if (rerender) renderAll();
}

/* ================= INSTALL HINT ================= */
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; renderAll(); });
function installHTML(dismissible) {
  if (isStandalone()) return '';
  if (isIOS()) return `<div class="installcard">${IC.share}<div style="flex:1"><b>Install TMBO on your iPhone</b>In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. You'll need this for notifications.</div>${dismissible ? '<button data-dismiss-install aria-label="Dismiss">×</button>' : ''}</div>`;
  if (installPrompt) return `<div class="installcard">${IC.share}<div style="flex:1"><b>Install TMBO</b>Add it to your device like an app.<br><button class="linkbtn" data-install>Install now</button></div>${dismissible ? '<button data-dismiss-install aria-label="Dismiss">×</button>' : ''}</div>`;
  return '';
}

/* ================= HOME ================= */
function renderHome() {
  const td = today(), name = state.profile.name.trim();
  const hr = new Date().getHours();
  $('#greet').innerHTML = `<h2>${hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'}${name ? `, ${esc(name)}` : ''}</h2><p>${fmtLong(td)}</p>`;
  $('#installSlot').innerHTML = device.installDismissed ? '' : installHTML(true);
  $('#heroSlot').innerHTML = heroHTML(true);
  const all = tasksFor(td), top = byTier(all).slice(0, 3), L = state.settings.tierLabels;
  const topDone = top.filter((t) => isDone(t, td)).length;
  $('#top3').innerHTML = `<div class="card-h"><b>Today’s Top 3</b><small>${top.length ? `${topDone} of ${top.length} done` : 'by priority'}</small></div>` +
    (top.length ? top.map((t, i) => `<div class="top3-item${isDone(t, td) ? ' done' : ''}" data-tier="${t.tier}" data-id="${t.id}">
        <span class="rank">${i + 1}</span>
        <div class="body" data-act="edit"><div class="title">${esc(t.title)}</div><div class="meta"><span class="chip tier">T${t.tier} · ${esc(L[t.tier - 1])}</span>${t.remindAt ? `<span class="chip">${IC.bell}${fmtTime(t.remindAt)}</span>` : ''}</div></div>
        <button class="check" data-act="toggle" aria-label="Mark done">${IC.check}</button></div>`).join('')
      : `<div class="empty" style="padding:18px 8px 22px;border-top:1px solid var(--border)"><b>No tasks for today yet</b>Tap + to add your first one.</div>`) +
    `<button class="link" id="seeAll">See all ${all.length} task${all.length === 1 ? '' : 's'} for today →</button>`;
  const ev = upcomingEvents()[0];
  $('#nextEvent').innerHTML = ev ? `<div class="addrow"><b>Next up</b><button class="smallbtn" id="homeEvents">All events</button></div>${eventCard(ev)}`
    : `<div class="addrow"><b>Next up</b><button class="smallbtn" id="homeEvents">+ Add a test or interview</button></div>`;
  const done = all.filter((t) => isDone(t, td)).length;
  const mins = state.sessions.filter((s) => s.date === td).reduce((a, s) => a + s.minutes, 0);
  $('#stats').innerHTML = `<button class="stat" data-go="todo"><b>${done}/${all.length}</b><span>Tasks done today</span></button><button class="stat" data-go="study"><b>${mins} min</b><span>Focus time today</span></button>`;
}
function countdownHTML(ev) {
  const n = daysUntil(ev);
  return n === 0 ? '<div class="ev-count now"><b>Today</b></div>' : `<div class="ev-count"><b>${n}</b><span>day${n > 1 ? 's' : ''}</span></div>`;
}
function eventCard(ev) {
  const next = nextReminderFor(ev);
  return `<div class="event" data-type="${ev.type}" data-eid="${ev.id}">${countdownHTML(ev)}
    <div class="ev-body" data-act="edit-ev"><div class="title">${esc(ev.title)}</div>
    <div class="meta"><span class="chip ev">${TYPE_LABEL[ev.type]}</span><span class="chip">${fmtDay(ev.date)}${ev.time ? ' · ' + fmtTime(ev.time) : ''}</span>${ev.prep ? '<span class="chip ok">Daily prep on</span>' : ''}</div>
    <small>${state.notif.enabled ? (next ? `Next reminder: ${next}` : 'No more reminders scheduled') : 'Reminders are off. Turn them on in Settings.'}</small></div>
    <button class="more" data-act="edit-ev" aria-label="Edit event">${IC.dots}</button></div>`;
}

/* ================= TO-DO ================= */
function relLabel(k) {
  const td = today();
  if (k === td) return 'Today'; if (k === addDays(td, 1)) return 'Tomorrow'; if (k === addDays(td, -1)) return 'Yesterday';
  return k < td ? 'Past day' : 'Upcoming';
}
function renderWeek() {
  const sel = state.selected, td = today(), start = addDays(sel, -fromKey(sel).getDay());
  let h = '';
  for (let i = 0; i < 7; i++) {
    const k = addDays(start, i), ts = tasksFor(k), open = ts.filter((t) => !isDone(t, k)).length;
    h += `<button class="wd${k === sel ? ' sel' : ''}${k === td ? ' today' : ''}" data-k="${k}"><span>${DOW[i][0]}</span><b>${fromKey(k).getDate()}</b><i class="${ts.length ? (open ? 'has' : 'all') : ''}"></i></button>`;
  }
  $('#week').innerHTML = h;
}
function taskHTML(t, k) {
  const d = isDone(t, k), td = today(), L = state.settings.tierLabels, chips = [];
  if (state.settings.template !== 'planner') chips.push(`<span class="chip tier">T${t.tier} · ${esc(L[t.tier - 1])}</span>`);
  if (t.repeat !== 'once') {
    chips.push(`<span class="chip">${IC.repeat}${esc(repeatText(t))}</span>`);
    const s = streak(t); if (s > 1) chips.push(`<span class="chip ok">${s}-day streak</span>`);
  } else if (!d) {
    if (t.carried) chips.push(`<span class="chip warn">${IC.arrow}Carried ${t.carried} day${t.carried > 1 ? 's' : ''} · from ${fmtShort(t.originalDate)}</span>`);
    else if (k < td && !t.carryOver) chips.push('<span class="chip bad">Missed</span>');
    else if (t.carryOver) chips.push(`<span class="chip">${IC.arrow}Carries over</span>`);
  }
  if (t.eventId) { const ev = state.events.find((e) => e.id === t.eventId); if (ev) { const n = diffDays(k, ev.date); chips.push(`<span class="chip ev" data-type="${ev.type}">${IC.flag}${n <= 0 ? 'Event today' : `${n} day${n > 1 ? 's' : ''} to go`}</span>`); } }
  if (t.remindAt) chips.push(`<span class="chip">${IC.bell}${fmtTime(t.remindAt)}</span>`);
  return `<div class="task${d ? ' done' : ''}" data-tier="${t.tier}" data-id="${t.id}">
    <button class="check" data-act="toggle" aria-label="${d ? 'Mark not done' : 'Mark done'}">${IC.check}</button>
    <div class="body" data-act="edit"><div class="title">${esc(t.title)}</div>${t.notes ? `<div class="tnotes">${esc(t.notes)}</div>` : ''}<div class="meta">${chips.join('')}</div></div>
    <button class="more" data-act="edit" aria-label="Edit task">${IC.dots}</button></div>`;
}
function renderTodo() {
  const k = state.selected, s = state.settings;
  $('#dateLabel').textContent = fmtLong(k); $('#dateSub').textContent = relLabel(k);
  renderWeek();
  let list = sortTasks(tasksFor(k), k);
  const total = list.length, done = list.filter((t) => isDone(t, k)).length;
  $('#progText').textContent = `${done} of ${total} done`;
  $('#progBar').style.width = total ? `${(done / total) * 100}%` : '0';
  const carried = list.filter((t) => t.repeat === 'once' && !t.done && t.carried).length;
  $('#notice').innerHTML = carried ? `<div class="notice">${IC.arrow}${carried} unfinished task${carried > 1 ? 's' : ''} carried over from earlier</div>` : '';
  if (!s.showDone) list = list.filter((t) => !isDone(t, k));
  let html;
  if (!list.length) html = `<div class="empty"><b>${total ? 'All done for this day' : 'Nothing planned'}</b>${total ? 'Completed tasks are hidden in Settings.' : 'Tap + to add a task.'}</div>`;
  else if (s.template === 'planner') {
    html = [1, 2, 3, 4].map((tr) => {
      const g = list.filter((t) => t.tier === tr); if (!g.length) return '';
      const left = g.filter((t) => !isDone(t, k)).length;
      return `<div class="group" data-tier="${tr}"><div class="group-h"><span>Tier ${tr} · ${esc(s.tierLabels[tr - 1])}</span><small>${left ? left + ' left' : 'done'}</small></div>${g.map((t) => taskHTML(t, k)).join('')}</div>`;
    }).join('');
  } else html = `<div class="list">${list.map((t) => taskHTML(t, k)).join('')}</div>`;
  $('#todoList').innerHTML = html;
}
function toggleTask(id, k = state.selected) {
  const t = findTask(id); if (!t) return;
  if (t.repeat === 'once') { t.done = !t.done; t.doneOn = t.done ? k : null; Store.saveTask(t); }
  else { t.completions ||= {}; const on = !t.completions[k]; if (on) t.completions[k] = true; else delete t.completions[k]; Store.setCompletion(t.id, k, on); }
  renderAll();
}

/* ---------- Task sheet ---------- */
let draft = null, editingId = null, deleteArmed = false;
function openSheet(task, dateKey) {
  editingId = task ? task.id : null; deleteArmed = false;
  const d0 = dateKey || state.selected;
  draft = task ? { ...task, days: [...(task.days || [])] }
    : { title: '', notes: '', tier: 2, repeat: 'once', days: [fromKey(d0).getDay()], date: d0, carryOver: state.settings.defaultCarry, remindAt: '' };
  $('#sheetTitle').textContent = task ? 'Edit task' : 'New task';
  $('#fTitle').value = draft.title; $('#fNotes').value = draft.notes || ''; $('#fDate').value = draft.date; $('#fRemind').value = draft.remindAt || '';
  $('#fDelete').hidden = !task; $('#fDelete').textContent = 'Delete';
  $('#fTier').innerHTML = state.settings.tierLabels.map((l, i) => `<button type="button" data-tier="${i + 1}" data-v="${i + 1}"><b>${i + 1}</b><span>${esc(l)}</span></button>`).join('');
  $('#fDays').innerHTML = DOW.map((d, i) => `<button type="button" data-v="${i}" aria-label="${d}">${d[0]}</button>`).join('');
  syncSheet();
  $('#sheetWrap').classList.add('open');
  if (!task) setTimeout(() => $('#fTitle').focus(), 60);
}
function syncSheet() {
  $$('#fTier button').forEach((b) => b.classList.toggle('on', +b.dataset.v === draft.tier));
  $$('#fRepeat button').forEach((b) => b.classList.toggle('on', b.dataset.v === draft.repeat));
  $('#fDays').hidden = draft.repeat !== 'custom';
  $$('#fDays button').forEach((b) => b.classList.toggle('on', draft.days.includes(+b.dataset.v)));
  const once = draft.repeat === 'once';
  $('#fDateLabel').textContent = once ? 'Date' : 'Starts on';
  $('#fCarry').disabled = !once; $('#fCarry').checked = once && !!draft.carryOver;
  $('#carryHint').textContent = once ? 'Moves to the next day automatically until it’s done.' : 'Repeating tasks reset each day, so carry-over doesn’t apply.';
}
function closeSheet() { $('#sheetWrap').classList.remove('open'); draft = null; }
function saveSheet(e) {
  e.preventDefault();
  const title = $('#fTitle').value.trim();
  if (!title) { toast('Give the task a name'); $('#fTitle').focus(); return; }
  if (draft.repeat === 'custom' && !draft.days.length) { toast('Pick at least one day'); return; }
  const date = $('#fDate').value || state.selected;
  const fields = { title, notes: $('#fNotes').value.trim(), tier: draft.tier, repeat: draft.repeat, days: draft.repeat === 'custom' ? draft.days : [], carryOver: draft.repeat === 'once' && !!draft.carryOver, remindAt: $('#fRemind').value || '' };
  let t;
  if (editingId) { t = findTask(editingId); if (t.date !== date) { t.originalDate = date; t.carried = 0; } Object.assign(t, fields, { date }); }
  else { t = newTask({ ...fields, date }); state.tasks.push(t); }
  Store.saveTask(t);
  const wasEdit = !!editingId; closeSheet(); renderAll();
  if (fields.remindAt && !state.notif.enabled) toast('Saved. Turn on notifications in Settings to get the reminder.');
  else toast(wasEdit ? 'Task updated' : (occursOn(t, state.tab === 'home' ? today() : state.selected) ? 'Task added' : `Task added to ${fmtShort(date)}`));
}
function deleteFromSheet() {
  if (!deleteArmed) { deleteArmed = true; $('#fDelete').textContent = 'Tap again to delete'; return; }
  const t = findTask(editingId);
  if (t?.eventId) { const ev = state.events.find((e) => e.id === t.eventId); if (ev) { ev.prep = false; ev.prepTaskId = null; Store.saveEvent(ev); } }
  state.tasks = state.tasks.filter((x) => x.id !== editingId); Store.deleteTask(editingId);
  closeSheet(); renderAll(); toast('Task deleted');
}

/* ================= GENERIC PANEL ================= */
let panelOnClose = null;
function openPanel(html, onClose) {
  panelOnClose = onClose || null;
  $('#panel').innerHTML = '<div class="grabber"></div>' + html;
  $('#panelWrap').classList.add('open'); $('#panel').scrollTop = 0;
}
function closePanel(cancelled = true) {
  $('#panelWrap').classList.remove('open');
  const cb = panelOnClose; panelOnClose = null;
  if (cancelled && cb) cb();
}

/* ================= EVENTS ================= */
function openEventSheet(ev) {
  const isNew = !ev;
  const d = ev ? { ...ev, remind: [...ev.remind] } : { title: '', type: 'test', date: addDays(today(), 7), time: '', notes: '', remind: [7, 3, 1, 0], prep: true };
  let armed = false;
  openPanel(`<h3>${isNew ? 'Add an event' : 'Edit event'}</h3>
    <p class="hint" style="margin:2px 0 0">Tests, interviews, deadlines. TMBO counts down and reminds you to prepare.</p>
    <label class="f" for="eTitle">What’s coming up?</label><input class="txt" id="eTitle" maxlength="80" placeholder="e.g., Statistics midterm" value="${esc(d.title)}">
    <label class="f">Type</label><div class="seg" id="eType">${Object.keys(TYPE_LABEL).map((k) => `<button type="button" data-v="${k}">${k === 'test' ? 'Test' : TYPE_LABEL[k]}</button>`).join('')}</div>
    <div class="two"><div><label class="f" for="eDate">Date</label><input class="txt" type="date" id="eDate" value="${d.date}"></div>
    <div><label class="f" for="eTime">Time <span class="opt">(optional)</span></label><input class="txt" type="time" id="eTime" value="${d.time || ''}"></div></div>
    <label class="f" for="eNotes">Notes <span class="opt">(optional)</span></label><textarea class="txt" id="eNotes" rows="2" placeholder="Location, topics to cover, who you’re meeting…">${esc(d.notes || '')}</textarea>
    <label class="f">Remind me to prepare</label><div class="pick" id="eRemind">${REMIND_OPTS.map((o) => `<button type="button" data-v="${o.v}">${o.l}</button>`).join('')}</div>
    <div class="row"><div><b>Add a daily prep task</b><small>Puts “Prepare: …” on your to-do list every day until the event.</small></div><label class="switch"><input type="checkbox" id="ePrep"><span></span></label></div>
    <div class="formerr" id="eErr"></div>
    <div class="actions">${isNew ? '' : '<button type="button" class="btn danger" id="eDelete">Delete</button>'}<button type="button" class="btn ghost" id="eCancel">Cancel</button><button type="button" class="btn primary" id="eSave">Save</button></div>`);
  const paint = () => {
    $$('#eType button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.type));
    $$('#eRemind button').forEach((b) => b.classList.toggle('on', d.remind.includes(+b.dataset.v)));
    $('#ePrep').checked = d.prep;
  };
  paint();
  $('#eType').onclick = (e) => { const b = e.target.closest('button'); if (b) { d.type = b.dataset.v; paint(); } };
  $('#eRemind').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const v = +b.dataset.v; d.remind = d.remind.includes(v) ? d.remind.filter((x) => x !== v) : [...d.remind, v].sort((a, c) => c - a); paint(); };
  $('#ePrep').onchange = (e) => { d.prep = e.target.checked; };
  $('#eCancel').onclick = () => closePanel();
  if (!isNew) $('#eDelete').onclick = (e) => {
    if (!armed) { armed = true; e.target.textContent = 'Tap again to delete'; return; }
    const cur = state.events.find((x) => x.id === ev.id);
    if (cur) { cur.prep = false; syncPrepTask(cur); }
    state.events = state.events.filter((x) => x.id !== ev.id); Store.deleteEvent(ev.id); closePanel(false); renderAll(); toast('Event deleted');
  };
  $('#eSave').onclick = () => {
    const title = $('#eTitle').value.trim(), date = $('#eDate').value;
    if (!title) { $('#eErr').textContent = 'Give the event a name.'; return; }
    if (!date) { $('#eErr').textContent = 'Pick a date.'; return; }
    const fields = { title, type: d.type, date, time: $('#eTime').value || '', notes: $('#eNotes').value.trim(), remind: d.remind, prep: d.prep };
    let cur;
    if (isNew) { cur = { id: uuid(), prepTaskId: null, ...fields }; state.events.push(cur); }
    else { cur = state.events.find((x) => x.id === ev.id); Object.assign(cur, fields); }
    Store.saveEvent(cur); syncPrepTask(cur); Store.saveEvent(cur);
    closePanel(false); renderAll();
    const n = daysUntil(cur);
    toast(n < 0 ? 'Saved (this date has passed)' : `${isNew ? 'Added' : 'Saved'}: ${n === 0 ? 'it’s today' : n + ' day' + (n > 1 ? 's' : '') + ' to go'}`);
  };
}
function renderEvents() {
  const upc = upcomingEvents();
  $('#eventList').innerHTML = upc.length ? upc.map(eventCard).join('')
    : '<div class="card"><div class="empty" style="padding:20px 8px"><b>No upcoming events</b>Add a test, interview or deadline and TMBO will help you prepare.</div></div>';
}

/* ================= CALENDAR ================= */
function renderCalendar() {
  renderEvents();
  if (!state.calMonth) { const d = fromKey(state.selected); state.calMonth = toKey(new Date(d.getFullYear(), d.getMonth(), 1)); }
  const first = fromKey(state.calMonth), td = today(), sel = state.selected;
  $('#monthLabel').textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const start = addDays(state.calMonth, -first.getDay());
  let h = DOW.map((d) => `<div class="dow">${d[0]}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const k = addDays(start, i), dd = fromKey(k), ts = sortTasks(tasksFor(k), k).filter((t) => !isDone(t, k)).slice(0, 3), ev = eventsOn(k)[0];
    h += `<button class="day${dd.getMonth() !== first.getMonth() ? ' other' : ''}${k === td ? ' today' : ''}${k === sel ? ' sel' : ''}${ev ? ' hasev' : ''}" ${ev ? `data-type="${ev.type}"` : ''} data-k="${k}">${dd.getDate()}<span class="dots">${ts.map((t) => `<i data-tier="${t.tier}"></i>`).join('')}</span></button>`;
  }
  $('#cal').innerHTML = h;
  $('#agendaTitle').textContent = `${fmtLong(sel)} · ${relLabel(sel)}`;
  const evs = eventsOn(sel), list = sortTasks(tasksFor(sel), sel);
  const rows = [
    ...evs.map((e) => `<div class="agenda-item" data-type="${e.type}"><i class="evdot"></i><span><b>${esc(e.title)}</b></span><small class="chip ev">${e.time ? fmtTime(e.time) : TYPE_LABEL[e.type]}</small></div>`),
    ...list.map((t) => `<div class="agenda-item${isDone(t, sel) ? ' done' : ''}" data-tier="${t.tier}"><i></i><span>${esc(t.title)}</span><small class="chip">T${t.tier}</small></div>`),
  ];
  $('#agenda').innerHTML = rows.length ? rows.join('') : '<div class="agenda-item"><span style="color:var(--muted)">Nothing planned.</span></div>';
}

/* ================= STUDY TIMER ================= */
const C = 2 * Math.PI * 108;
const study = { mode: 'focus', len: { focus: 25, short: 5, long: 15 }, remaining: 25 * 60, running: false, endAt: 0, int: null };
const MODE_LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
function renderTimer() {
  const total = study.len[study.mode] * 60, r = study.remaining;
  $('#timeText').textContent = `${pad(Math.floor(r / 60))}:${pad(r % 60)}`;
  $('#timeLabel').textContent = MODE_LABEL[study.mode] + (study.running ? '' : ' · paused');
  const fg = $('#ringFg'); fg.style.strokeDasharray = C; fg.style.strokeDashoffset = C * (1 - r / total);
  $('#tStart').textContent = study.running ? 'Pause' : (r < total ? 'Resume' : 'Start');
  $$('#studyMode button').forEach((b) => b.classList.toggle('on', b.dataset.m === study.mode));
  $$('#focusLen button').forEach((b) => b.classList.toggle('on', +b.dataset.v === study.len.focus));
}
function setMode(m) { stopTimer(); study.mode = m; study.remaining = study.len[m] * 60; renderTimer(); }
function stopTimer() { clearInterval(study.int); study.running = false; }
function startTimer() {
  study.running = true; study.endAt = Date.now() + study.remaining * 1000;
  study.int = setInterval(() => { study.remaining = Math.max(0, Math.round((study.endAt - Date.now()) / 1000)); if (study.remaining === 0) { finishTimer(); return; } renderTimer(); }, 250);
  renderTimer();
}
function finishTimer() {
  stopTimer();
  if (study.mode === 'focus') {
    const s = { id: uuid(), date: today(), subject: $('#subject').value.trim() || 'General study', minutes: study.len.focus };
    state.sessions.push(s); Store.saveSession(s); renderSessions();
    notify({ title: 'Focus session complete', body: 'Nice work. Take a short break.' }); setMode('short');
  } else { notify({ title: 'Break’s over', body: 'Ready for another focus block?' }); setMode('focus'); }
}
function renderSessions() {
  const list = state.sessions.filter((s) => s.date === today()), mins = list.reduce((a, s) => a + s.minutes, 0);
  $('#sessions').innerHTML = list.length ? list.map((s) => `<div class="sess"><b>${esc(s.subject)}</b><span>${s.minutes} min</span></div>`).join('') + `<div class="sess"><b>Total</b><span>${mins} min</span></div>`
    : '<div class="sess"><span>No sessions yet. Finish a focus block to log one.</span></div>';
}

/* ================= NOTIFICATIONS & REMINDERS =================
   Signed in + push allowed: the send-reminders Edge Function delivers
   reminders, even when TMBO is closed. Otherwise reminders are shown by
   the app while it is open.                                            */
const fired = (() => { const f = LS.get('tmbo:fired', {}); return f.day === today() ? new Set(f.keys) : new Set(); })();
const saveFired = () => LS.set('tmbo:fired', { day: today(), keys: [...fired] });
const atTime = (k, t) => { const d = fromKey(k); const [h, m] = (t || '09:00').split(':').map(Number); d.setHours(h, m, 0, 0); return d; };
const serverPush = () => isAccount() && device.push;
function eventReminderText(ev, n) {
  const when = ev.time ? ` at ${fmtTime(ev.time)}` : '';
  if (n === 0) return { title: `Today: ${ev.title}${when}`, body: ev.type === 'interview' ? 'Review your notes, arrive early, and breathe. You’ve got this.' : 'Final review, then trust your preparation. You’ve got this.' };
  if (n === 1) return { title: `Tomorrow: ${ev.title}${when}`, body: ev.type === 'test' ? 'Do a final review today and get good sleep tonight.' : ev.type === 'interview' ? 'Prep your answers and questions, and lay out what you’ll wear.' : 'Wrap up the last pieces today.' };
  return { title: `${ev.title} in ${n} days`, body: ev.type === 'test' ? 'Block out study time today. Start a focus session to prepare.' : ev.type === 'interview' ? 'Research the company and practice your stories today.' : `Your ${TYPE_LABEL[ev.type].toLowerCase()} is coming up. Plan your prep today.` };
}
function remindersFor(k) {
  const list = [];
  state.tasks.forEach((t) => { if (t.remindAt && occursOn(t, k) && !isDone(t, k)) list.push({ key: `t:${t.id}:${k}`, at: atTime(k, t.remindAt), title: t.title, body: `Tier ${t.tier} · ${state.settings.tierLabels[t.tier - 1]}${t.repeat === 'once' ? ' — due today' : ''}` }); });
  state.events.forEach((ev) => ev.remind.forEach((n) => { if (addDays(ev.date, -n) === k) list.push({ key: `e:${ev.id}:${n}:${k}`, at: atTime(k, state.notif.time), ...eventReminderText(ev, n) }); }));
  if (state.notif.summary) {
    const top = byTier(tasksFor(k)).slice(0, 3);
    if (top.length) list.push({ key: `s:${k}`, at: atTime(k, state.notif.time), title: 'Your Top 3 today', body: top.map((t, i) => `${i + 1}. ${t.title}`).join('  ') });
  }
  return list.sort((a, b) => a.at - b.at);
}
function nextReminderFor(ev) {
  const now = new Date();
  const times = ev.remind.map((n) => atTime(addDays(ev.date, -n), state.notif.time)).filter((d) => d > now).sort((a, b) => a - b);
  return times.length ? `${fmtDay(toKey(times[0]))}, ${fmtClock(times[0])}` : '';
}
function checkReminders() {
  if (!state.notif.enabled || serverPush() || lock.locked) return;
  const now = new Date(), due = remindersFor(today()).filter((r) => r.at <= now && !fired.has(r.key));
  if (!due.length) return;
  due.forEach((r) => fired.add(r.key)); saveFired();
  if (due.length > 1) notify({ title: `${due.length} reminders for today`, body: due.map((r) => r.title).join(' · ') });
  else notify(due[0]);
}
async function notify({ title, body }) {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  if (document.hidden && perm === 'granted') {
    try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) { await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/badge-72.png' }); return; } } catch { /* fall back to banner */ }
  }
  const el = document.createElement('div'); el.className = 'nbanner';
  el.innerHTML = `<span class="logo">${IC.logo}</span><div style="flex:1;min-width:0"><div class="napp"><span>TMBO</span><span>now</span></div><b>${esc(title)}</b><p>${esc(body)}</p></div>`;
  el.onclick = () => el.remove();
  $('#nstack').prepend(el);
  setTimeout(() => el.remove(), 6500);
}
const permNow = () => ('Notification' in window ? Notification.permission : 'unsupported');
async function enableNotifications() {
  let perm = permNow();
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { perm = permNow(); } }
  state.notif.enabled = true; Store.saveSettings();
  if (perm === 'granted' && isAccount() && cloud.pushSupported()) {
    try { await subscribePushNow(); } catch (e) { console.warn('TMBO: push subscribe failed', e); }
  }
  return perm;
}
async function subscribePushNow() {
  await session.queue?.flush();
  await Promise.race([cloud.subscribePush(session.db), new Promise((_, rej) => setTimeout(() => rej(new Error('Service worker not ready')), 10000))]);
  device.push = true; saveDevice();
}
function deviceStatus() {
  const perm = permNow();
  if (isIOS() && !isStandalone()) return { text: 'On iPhone, add TMBO to your Home Screen first (Share → Add to Home Screen), then open it from there and turn this on.', action: '' };
  if (perm === 'denied') return { text: 'Notifications are blocked for TMBO in this browser or in your iPhone Settings. Reminders show inside TMBO while it’s open.', action: '' };
  if (!isAccount()) return { text: 'Without an account, reminders show while TMBO is open. Create a free account to get them even when TMBO is closed.', action: '' };
  if (!cloud.pushSupported()) return { text: 'Reminders show while TMBO is open. (Push notifications aren’t set up for this copy of TMBO yet.)', action: '' };
  if (device.push && perm === 'granted') return { text: 'This device gets reminders even when TMBO is closed.', action: '' };
  return { text: 'This device isn’t set up for push notifications yet.', action: '<button class="btn primary" id="nAllow">Allow on this device</button>' };
}
function renderNotifCard() {
  const n = state.notif, rems = n.enabled ? remindersFor(today()) : [];
  const st = deviceStatus();
  $('#notifCard').innerHTML = `
    <div class="row"><div><b>Reminders</b><small>${n.enabled ? 'Task reminders, event prep reminders and your morning Top 3.' : 'Get reminders for tasks and help preparing for tests and interviews.'}</small></div><label class="switch"><input type="checkbox" id="nOn" ${n.enabled ? 'checked' : ''}><span></span></label></div>
    ${n.enabled ? `
    <div class="row"><div><b>This device</b><small>${st.text}</small></div>${st.action}</div>
    <div class="row"><div><b>Prep reminder time</b><small>Event reminders and your morning summary arrive at this time.</small></div><input class="txt" type="time" id="nTime" value="${n.time}" style="width:auto"></div>
    <div class="row"><div><b>Morning Top 3 summary</b><small>A daily reminder of your 3 most important tasks.</small></div><label class="switch"><input type="checkbox" id="nSummary" ${n.summary ? 'checked' : ''}><span></span></label></div>
    <div class="block"><b>Today’s reminders</b>${rems.length ? rems.map((r) => `<div class="rem"><time>${fmtClock(r.at)}</time><span>${esc(r.title)}${fired.has(r.key) ? ' <span class="tag">shown</span>' : ''}</span></div>`).join('') : '<div class="rem"><span style="color:var(--muted)">None today. Add a reminder time to a task, or add an event in Calendar.</span></div>'}</div>
    <div class="block"><button class="btn ghost full" id="nTest">Send a test notification</button></div>` : ''}`;
}

/* ================= ACCOUNTS ================= */
async function hashSecret(secret, salt) {
  const enc = new TextEncoder();
  try {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 2166136261; const s = salt + '|' + secret;
    for (let r = 0; r < 2000; r++) for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return 'f' + h.toString(16);
  }
}
function authFormHTML(mode) {
  if (mode === 'signup') return `
    <h2>Create your account</h2><p class="lead">Your tasks, events and settings sync across your phone, laptop and tablet.</p>
    <form id="authForm" novalidate>
      <label class="f" for="aName">Name</label><input class="txt" id="aName" autocomplete="name" maxlength="30" placeholder="What should TMBO call you?">
      <label class="f" for="aEmail">Email</label><input class="txt" id="aEmail" type="email" autocomplete="email" placeholder="you@example.com">
      <label class="f" for="aPw">Password</label><input class="txt" id="aPw" type="password" autocomplete="new-password" placeholder="At least 8 characters">
      <div class="formerr" id="aErr"></div>
      <button class="btn primary full" id="aSubmit">Create account</button>
    </form>
    <button class="btn ghost full" data-w="signin" type="button">I already have an account</button>`;
  return `
    <h2>Welcome back</h2><p class="lead">Sign in to pick up where you left off on any device.</p>
    <form id="authForm" novalidate>
      <label class="f" for="aEmail">Email</label><input class="txt" id="aEmail" type="email" autocomplete="email" placeholder="you@example.com">
      <label class="f" for="aPw">Password</label><input class="txt" id="aPw" type="password" autocomplete="current-password" placeholder="Password">
      <div class="formerr" id="aErr"></div>
      <button class="btn primary full" id="aSubmit">Sign in</button>
    </form>
    <button class="linkbtn" id="aForgot" type="button">Forgot your password?</button>
    <button class="btn ghost full" data-w="signup" type="button">Create a new account instead</button>`;
}
const friendlyAuthError = (e) => {
  const m = String(e?.message || e || '');
  if (/invalid login/i.test(m)) return 'That email and password don’t match.';
  if (/already registered|already exists/i.test(m)) return 'An account with this email already exists. Try signing in.';
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first (check your inbox), then sign in.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/failed to fetch|network/i.test(m)) return 'Can’t reach the server. Check your connection.';
  return m || 'Something went wrong. Please try again.';
};
function bindAuthForm(root, mode, onSuccess) {
  $('#authForm', root).onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#aEmail', root).value.trim(), pw = $('#aPw', root).value, err = $('#aErr', root), btn = $('#aSubmit', root);
    const name = mode === 'signup' ? $('#aName', root).value.trim() : '';
    if (mode === 'signup' && !name) { err.textContent = 'Add your name.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Enter a valid email address.'; return; }
    if (pw.length < 8) { err.textContent = mode === 'signup' ? 'Use at least 8 characters for your password.' : 'Password must be at least 8 characters.'; return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    try {
      const db = await cloud.client(); ensureAuthListener(db);
      const res = mode === 'signup'
        ? await db.auth.signUp({ email, password: pw, options: { data: { display_name: name }, emailRedirectTo: location.origin + location.pathname } })
        : await db.auth.signInWithPassword({ email, password: pw });
      if (res.error) throw res.error;
      if (mode === 'signup' && !res.data.session) {
        err.style.color = 'var(--ok)';
        err.textContent = 'Almost done! Check your email to confirm your account, then come back here and sign in.';
        btn.disabled = false; btn.textContent = 'Create account';
        return;
      }
      if (name && !state.profile.name) state.profile.name = name;
      await startAccount(res.data.user, { pendingName: name });
      onSuccess();
    } catch (e2) {
      err.style.color = ''; err.textContent = friendlyAuthError(e2);
      btn.disabled = false; btn.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    }
  };
  const forgot = $('#aForgot', root);
  if (forgot) forgot.onclick = async () => {
    const email = $('#aEmail', root).value.trim(), err = $('#aErr', root);
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Type your email above first.'; return; }
    try {
      const db = await cloud.client();
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw error;
      err.style.color = 'var(--ok)'; err.textContent = 'Check your email for a link to reset your password.';
    } catch (e3) { err.style.color = ''; err.textContent = friendlyAuthError(e3); }
  };
}
let authListening = false;
function ensureAuthListener(db) {
  if (authListening || !db) return; authListening = true;
  db.auth.onAuthStateChange((event, s) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(openNewPasswordPanel, 300);
    if (event === 'SIGNED_OUT' && isAccount()) endAccountLocal();
    if (event === 'SIGNED_IN' && s?.user && !isAccount() && device.onboarded === false) { /* handled by forms */ }
  });
}
function openNewPasswordPanel() {
  openPanel(`<h3>Choose a new password</h3><p class="hint" style="margin:4px 0 0">You opened a password reset link.</p>
    <input class="txt" type="password" id="np1" placeholder="New password (at least 8 characters)" autocomplete="new-password" style="margin-top:14px">
    <input class="txt" type="password" id="np2" placeholder="Confirm new password" autocomplete="new-password" style="margin-top:8px">
    <div class="formerr" id="npErr"></div>
    <div class="actions"><button class="btn primary full" id="npSave">Save new password</button></div>`);
  $('#npSave').onclick = async () => {
    const a = $('#np1').value, b = $('#np2').value;
    if (a.length < 8) { $('#npErr').textContent = 'Use at least 8 characters.'; return; }
    if (a !== b) { $('#npErr').textContent = 'Those passwords don’t match.'; return; }
    const { error } = await session.db.auth.updateUser({ password: a });
    if (error) { $('#npErr').textContent = friendlyAuthError(error); return; }
    closePanel(false); toast('Password updated');
  };
}

// ---- switching between guest and account ----
function startGuest() {
  session.mode = 'guest'; session.user = null;
  loadData(LS.get('tmbo:guest', null));
  applySettings();
  rollover();
}
async function startAccount(user, { pendingName } = {}) {
  session.db = await cloud.client(); ensureAuthListener(session.db);
  session.mode = 'account'; session.user = user;
  device.mode = 'account'; device.onboarded = true; device.uid = user.id; saveDevice();
  loadData(LS.get(cacheKey(), null));
  if (pendingName && !state.profile.name) state.profile.name = pendingName;
  session.queue?.stop();
  session.queue = cloud.createQueue(session.db, user.id, {
    onIdle: () => { if (pendingPull) pull(); renderSyncPill(); },
    onError: () => toast('One change couldn’t be saved to your account.'),
  });
  applySettings(); renderAll();
  await pull(true);
  await migrateGuestData();
  if (session.hadCloudSettings) Store.saveSettings(); // refreshes the saved timezone for reminders
  subscribeRealtime();
  // Re-register this device for push if it was set up before
  if (state.notif.enabled && permNow() === 'granted' && cloud.pushSupported() && !device.push) subscribePushNow().catch(() => {});
}
let pulling = false, pendingPull = false;
async function pull(first = false) {
  if (!isAccount()) return;
  if (session.queue.size > 0) { pendingPull = true; session.queue.flush(); return; }
  if (pulling) { pendingPull = true; return; }
  pulling = true; pendingPull = false;
  try {
    const r = await cloud.pullAll(session.db, today());
    state.tasks = r.tasks; state.events = r.events; state.customQuotes = r.customQuotes; state.sessions = r.sessions;
    if (first) session.hadCloudSettings = !!r.settingsRow;
    if (r.settingsRow) {
      const oldPath = state.home.photoPath;
      cloud.applySettingsRow(state, r.settingsRow);
      if (state.home.photoPath && (state.home.photoPath !== oldPath || !state.home.photo)) loadPhoto();
      if (!state.home.photoPath && oldPath) state.home.photo = null;
    } else Store.saveSettings();
    rollover();
    persist(); applySettings(); renderAll();
  } catch (e) {
    console.warn('TMBO: could not load from Supabase', e);
  } finally {
    pulling = false; renderSyncPill();
    if (pendingPull && session.queue?.size === 0) setTimeout(() => pull(), 300);
  }
}
async function loadPhoto() {
  try { state.home.photo = await cloud.downloadPhoto(session.db, state.home.photoPath); persist(); renderAll(); }
  catch (e) { console.warn('TMBO: photo download failed', e); }
}
async function migrateGuestData() {
  const g = LS.get('tmbo:guest', null);
  if (!g) return;
  const has = (g.tasks?.length || 0) + (g.events?.length || 0) + (g.customQuotes?.length || 0) + (g.sessions?.length || 0);
  if (has) {
    const ids = new Set(state.tasks.map((t) => t.id));
    (g.tasks || []).forEach((t) => { if (!ids.has(t.id)) state.tasks.push(t); Store.saveTask(t); Object.keys(t.completions || {}).forEach((d) => Store.setCompletion(t.id, d, true)); });
    const eids = new Set(state.events.map((e) => e.id));
    (g.events || []).forEach((e) => { if (!eids.has(e.id)) state.events.push(e); Store.saveEvent(e); });
    const qids = new Set(state.customQuotes.map((q) => q.id));
    (g.customQuotes || []).forEach((q) => { if (!qids.has(q.id)) state.customQuotes.push(q); Store.saveQuote(q); });
    const sids = new Set(state.sessions.map((s) => s.id));
    (g.sessions || []).forEach((s) => { if (!sids.has(s.id)) state.sessions.push(s); Store.saveSession(s); });
  }
  if (!session.hadCloudSettings) {
    ['settings', 'home', 'notif'].forEach((k) => { if (g[k]) state[k] = { ...state[k], ...g[k] }; });
    if (g.profile?.name) state.profile.name = g.profile.name;
    if (state.home.photo && !state.home.photoPath) {
      try { state.home.photoPath = await cloud.uploadPhoto(session.db, session.user.id, state.home.photo); } catch (e) { console.warn(e); }
    }
    Store.saveSettings();
  }
  LS.del('tmbo:guest');
  persist(); applySettings(); renderAll();
  if (has) toast('Your data from this device was added to your account');
}
function subscribeRealtime() {
  if (session.channel) session.db.removeChannel(session.channel);
  const filter = `user_id=eq.${session.user.id}`;
  let t; const kick = () => { clearTimeout(t); t = setTimeout(() => pull(), 800); };
  let ch = session.db.channel(`tmbo-${session.user.id}`);
  ['tasks', 'task_completions', 'events', 'user_settings', 'custom_quotes'].forEach((table) => {
    ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, kick);
  });
  session.channel = ch.subscribe();
}
function endAccountLocal() {
  session.queue?.stop();
  if (session.channel) { try { session.db.removeChannel(session.channel); } catch { /* ignore */ } }
  if (session.user) LS.del(`tmbo:acct:${session.user.id}`);
  session.mode = 'guest'; session.user = null; session.queue = null; session.channel = null;
  device.mode = 'guest'; device.onboarded = false; device.push = false; delete device.uid; saveDevice();
  loadData(null); applySettings(); renderAll(); showWelcome();
}
async function signOut() {
  toast('Signing out…');
  try { await session.queue?.flush(); } catch { /* ignore */ }
  if (device.push) await cloud.unsubscribePush(session.db);
  session.queue?.discard();
  const db = session.db;
  endAccountLocal();
  try { await db.auth.signOut(); } catch { /* ignore */ }
}

/* ---------- Welcome / onboarding ---------- */
function renderWelcome(step = 'choice') {
  const body = $('#welcomeBody');
  if (step === 'choice') {
    body.innerHTML = cloud.isConfigured ? `
      <h2>Plan your day. Protect your focus.</h2>
      <p class="lead">To-dos by priority, a calendar with countdowns to your tests and interviews, and a study timer, all in one place.</p>
      <button class="btn primary full" data-w="signup">Create an account</button>
      <small class="sub">Best if you’ll use TMBO on more than one device. Your data syncs everywhere.</small>
      <button class="btn ghost full" data-w="signin">Sign in</button>
      <div class="or">or</div>
      <button class="btn ghost full" data-w="guest">Continue without an account</button>
      <small class="sub">Everything stays on this device. You can create an account later and keep all your data.</small>`
      : `
      <h2>Plan your day. Protect your focus.</h2>
      <p class="lead">To-dos by priority, a calendar with countdowns to your tests and interviews, and a study timer, all in one place.</p>
      <button class="btn primary full" data-w="guest">Get started</button>
      <small class="sub">Your data is saved on this device.</small>
      <p class="demo-note">Accounts aren’t set up on this copy of TMBO yet. Add your Supabase keys to <b>js/config.js</b> to turn on sign-up and sync.</p>`;
  } else if (step === 'signup' || step === 'signin') {
    body.innerHTML = '<button class="back" data-w="choice">← Back</button>' + authFormHTML(step);
    bindAuthForm(body, step, () => renderWelcome('notify'));
  } else if (step === 'notify') {
    body.innerHTML = `
      <div class="bell">${IC.bell}</div>
      <h2>Want reminders?</h2>
      <p class="lead">TMBO can remind you about tasks, send your Top 3 each morning, and nudge you to prepare for upcoming tests, interviews and deadlines.</p>
      ${isIOS() && !isStandalone() ? '<p class="demo-note">On iPhone, notifications only work after you add TMBO to your Home Screen (Share → Add to Home Screen). You can turn them on later in Settings.</p>' : ''}
      <button class="btn primary full" data-w="notify-yes">Turn on notifications</button>
      <button class="btn ghost full" data-w="notify-no">Not now</button>
      <small class="sub">You can change this anytime in Settings → Notifications.</small>`;
  }
  $('#welcome').scrollTop = 0;
}
function showWelcome() { $('#welcomeBg').innerHTML = heroSVG('summit', 'midnight'); renderWelcome('choice'); $('#welcome').classList.add('show'); }
function finishOnboarding(msg) {
  device.onboarded = true; if (!isAccount()) device.mode = 'guest'; saveDevice();
  persist();
  $('#welcome').classList.remove('show');
  setTab('home'); if (msg) toast(msg);
  setTimeout(checkReminders, 900);
}
function openAuthPanel(mode) {
  openPanel(`<div id="authPanel">${authFormHTML(mode)}</div>`);
  const root = $('#authPanel');
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (b) openAuthPanel(b.dataset.w); });
  bindAuthForm(root, mode, () => { closePanel(false); renderAll(); toast(mode === 'signup' ? 'Account created. You’re synced.' : `Signed in as ${session.user.email}`); });
}
function renderAcctCard() {
  if (!cloud.isConfigured) {
    $('#acctCard').innerHTML = '<div class="row"><div><b>This device only</b><small>Accounts aren’t set up on this copy of TMBO yet. Add your Supabase keys to js/config.js to turn on sign-up and sync.</small></div><span class="tag">No account</span></div>';
    return;
  }
  if (isAccount()) {
    const u = session.user, name = state.profile.name || u.email;
    const pending = session.queue?.size || 0;
    $('#acctCard').innerHTML = `
      <div class="row" style="justify-content:flex-start"><div class="avatar">${esc((name[0] || '?').toUpperCase())}</div><div style="flex:1;min-width:0"><b>${esc(name)}</b><small>${esc(u.email)}</small></div><span class="tag ${pending || !navigator.onLine ? 'warn' : 'ok'}">${!navigator.onLine ? 'Offline' : pending ? 'Syncing' : 'Synced'}</span></div>
      <div class="block"><button class="btn ghost full" data-acct="signout">Sign out</button></div>`;
  } else {
    $('#acctCard').innerHTML = `
      <div class="row"><div><b>This device only</b><small>Your data is saved on this device. Create a free account to sync across devices and get reminders when TMBO is closed.</small></div><span class="tag">No account</span></div>
      <div class="block btnrow"><button class="btn primary" data-acct="signup">Create account</button><button class="btn ghost" data-acct="signin">Sign in</button></div>`;
  }
}
function renderSyncPill() {
  const p = $('#syncPill'), pending = session.queue?.size || 0;
  p.classList.toggle('ok', isAccount() && navigator.onLine && !pending);
  $('#syncText').textContent = !isAccount() ? 'This device' : !navigator.onLine ? 'Offline' : pending ? 'Syncing…' : 'Synced';
  $('#hdrLock').hidden = lock.type === 'off';
}

/* ================= APP LOCK (device-only) ================= */
const lock = { type: 'off', hash: null, salt: null, pinLen: 0, after: 0, ...LS.get('tmbo:lock', {}), failed: 0, until: 0, locked: false, hiddenAt: 0 };
const saveLock = () => LS.set('tmbo:lock', { type: lock.type, hash: lock.hash, salt: lock.salt, pinLen: lock.pinLen, after: lock.after });
function keypad(el, { max, onSubmit, okLabel }) {
  let val = '';
  el.innerHTML = `<div class="pindots"></div><div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" class="key" data-k="${n}">${n}</button>`).join('')}<button type="button" class="key fn" data-k="ok">${okLabel || ''}</button><button type="button" class="key" data-k="0">0</button><button type="button" class="key fn" data-k="del" aria-label="Delete">${IC.back}</button></div>`;
  const dots = $('.pindots', el);
  const draw = () => { dots.innerHTML = Array.from({ length: max || Math.max(4, val.length) }, (_, i) => `<i class="${i < val.length ? 'f' : ''}"></i>`).join(''); };
  $('.keypad', el).onclick = (e) => {
    const b = e.target.closest('.key'); if (!b) return; const k = b.dataset.k;
    if (k === 'del') val = val.slice(0, -1);
    else if (k === 'ok') { if (okLabel && val.length >= 4) onSubmit(val); return; }
    else if (val.length < (max || 8)) val += k;
    draw();
    if (max && val.length === max) { const v = val; setTimeout(() => onSubmit(v), 120); }
  };
  draw();
  return { reset() { val = ''; draw(); }, type(k) { $(`.key[data-k="${k}"]`, el)?.click(); } };
}
function patternPad(el, onDone) {
  const P = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) P.push({ x: 50 + c * 100, y: 50 + r * 100 });
  el.innerHTML = `<svg class="ppad" viewBox="0 0 300 300"><polyline points=""/><line class="ptrail" style="display:none"/>${P.map((p, i) => `<circle class="pring" data-i="${i}" cx="${p.x}" cy="${p.y}" r="30"/><circle class="pdot" data-i="${i}" cx="${p.x}" cy="${p.y}" r="10"/>`).join('')}</svg>`;
  const svg = $('svg', el), pl = $('polyline', svg), tr = $('.ptrail', svg);
  let seq = [], drawing = false;
  const paint = () => { pl.setAttribute('points', seq.map((i) => `${P[i].x},${P[i].y}`).join(' ')); $$('.pdot,.pring', svg).forEach((c) => c.classList.toggle('on', seq.includes(+c.dataset.i))); };
  const add = (i) => {
    if (seq.includes(i)) return;
    const last = seq[seq.length - 1];
    if (last != null) {
      const lr = Math.floor(last / 3), lc = last % 3, ir = Math.floor(i / 3), ic = i % 3;
      if ((lr + ir) % 2 === 0 && (lc + ic) % 2 === 0) { const m = ((lr + ir) / 2) * 3 + (lc + ic) / 2; if (!seq.includes(m)) seq.push(m); }
    }
    seq.push(i); paint(); if (navigator.vibrate) navigator.vibrate(8);
  };
  const pt = (e) => { const r = svg.getBoundingClientRect(); return { x: ((e.clientX - r.left) * 300) / r.width, y: ((e.clientY - r.top) * 300) / r.height }; };
  const move = (e) => {
    const p = pt(e); P.forEach((q, i) => { if (Math.hypot(q.x - p.x, q.y - p.y) < 34) add(i); });
    if (seq.length) { const l = P[seq[seq.length - 1]]; tr.style.display = ''; tr.setAttribute('x1', l.x); tr.setAttribute('y1', l.y); tr.setAttribute('x2', p.x); tr.setAttribute('y2', p.y); }
  };
  const api = { reset() { seq = []; svg.classList.remove('bad'); tr.style.display = 'none'; paint(); }, bad() { svg.classList.add('bad'); setTimeout(api.reset, 650); } };
  svg.addEventListener('pointerdown', (e) => { e.preventDefault(); api.reset(); drawing = true; try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ } move(e); });
  svg.addEventListener('pointermove', (e) => { if (drawing) move(e); });
  const end = () => { if (!drawing) return; drawing = false; tr.style.display = 'none'; if (seq.length) onDone(seq.join(''), api); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  return api;
}
function openLockSetup(type, onDone) {
  let first = null;
  const title = { pin: 'Set a PIN', pattern: 'Draw a pattern', password: 'Set a password' }[type];
  openPanel(`<h3>${title}</h3><p class="hint" id="lsMsg" style="margin:4px 0 0;font-size:.88rem"></p><div id="lsBody" style="margin-top:6px"></div><div class="actions"><button type="button" class="btn ghost full" id="lsCancel">Cancel</button></div>`, () => onDone(false));
  const msg = $('#lsMsg'), body = $('#lsBody');
  $('#lsCancel').onclick = () => closePanel(true);
  const finish = async (secret) => {
    lock.salt = uuid(); lock.hash = await hashSecret(secret, lock.salt); lock.type = type; lock.pinLen = type === 'pin' ? secret.length : 0; lock.failed = 0;
    saveLock(); closePanel(false); onDone(true);
  };
  if (type === 'pin') {
    msg.textContent = 'Choose 4–8 digits, then tap OK.';
    const kp = keypad(body, { okLabel: 'OK', onSubmit: (v) => {
      if (first === null) { first = v; kp.reset(); msg.textContent = 'Enter the same PIN again, then tap OK.'; }
      else if (v === first) finish(v);
      else { first = null; kp.reset(); msg.textContent = 'Those didn’t match. Choose a new PIN (4–8 digits).'; shake(body); }
    } });
  } else if (type === 'pattern') {
    msg.textContent = 'Connect at least 4 dots.';
    patternPad(body, (v, api) => {
      if (v.length < 4) { msg.textContent = 'Too short. Connect at least 4 dots.'; api.bad(); return; }
      if (first === null) { first = v; msg.textContent = 'Draw the same pattern again to confirm.'; setTimeout(api.reset, 300); }
      else if (v === first) finish(v);
      else { first = null; msg.textContent = 'Those didn’t match. Draw a new pattern.'; api.bad(); }
    });
  } else {
    msg.textContent = 'Use something you’ll remember but others can’t guess.';
    body.innerHTML = '<input class="txt" type="password" id="pw1" placeholder="New password (at least 6 characters)" autocomplete="new-password"><input class="txt" type="password" id="pw2" placeholder="Confirm password" style="margin-top:8px" autocomplete="new-password"><button type="button" class="btn primary full" id="pwSave" style="margin-top:12px">Save password</button>';
    $('#pwSave').onclick = () => {
      const a = $('#pw1').value, b = $('#pw2').value;
      if (a.length < 6) { msg.textContent = 'Use at least 6 characters.'; return; }
      if (a !== b) { msg.textContent = 'Those passwords don’t match.'; return; }
      finish(a);
    };
  }
}
let lockWidget = null, cdTimer = null;
function setLockMsg(t, err) { const m = $('#lockMsg'); m.textContent = t; m.classList.toggle('err', !!err); }
function showLock() {
  if (lock.type === 'off') return;
  lock.locked = true; closeSheet(); closePanel(true);
  $('#lockBg').innerHTML = heroBg();
  $('#lockScreen').classList.add('show');
  $('#lockTitle').textContent = { pin: 'Enter your PIN', pattern: 'Draw your pattern', password: 'Enter your password' }[lock.type];
  setLockMsg(''); $('#forgotBox').hidden = true; lockWidget = null;
  const body = $('#lockBody');
  if (lock.type === 'pin') lockWidget = keypad(body, { max: lock.pinLen, onSubmit: (v) => tryUnlock(v) });
  else if (lock.type === 'pattern') patternPad(body, (v, api) => tryUnlock(v, api));
  else {
    body.innerHTML = '<form id="lockPwForm"><input class="txt lockinput" type="password" id="lockPw" placeholder="Password" autocomplete="current-password"><button class="btn primary full" style="margin-top:10px">Unlock</button></form>';
    $('#lockPwForm').onsubmit = (e) => { e.preventDefault(); tryUnlock($('#lockPw').value); };
  }
  checkCooldown();
}
function unlockNow() { lock.locked = false; lock.failed = 0; $('#lockScreen').classList.remove('show'); }
async function tryUnlock(v, api) {
  if (Date.now() < lock.until) { checkCooldown(); api?.reset(); lockWidget?.reset(); return; }
  if ((await hashSecret(v, lock.salt)) === lock.hash) { unlockNow(); setTimeout(checkReminders, 600); return; }
  lock.failed++;
  const left = 5 - lock.failed, word = { pin: 'PIN', pattern: 'pattern', password: 'password' }[lock.type];
  if (left <= 0) { lock.until = Date.now() + 30000; lock.failed = 0; checkCooldown(); }
  else setLockMsg(`Wrong ${word}. ${left} ${left === 1 ? 'try' : 'tries'} left.`, true);
  shake($('#lockBody'));
  if (api) api.bad(); else lockWidget?.reset();
  if (lock.type === 'password') $('#lockPw').value = '';
}
function checkCooldown() {
  clearInterval(cdTimer);
  if (Date.now() >= lock.until) return;
  const tick = () => { const s = Math.ceil((lock.until - Date.now()) / 1000); if (s <= 0) { clearInterval(cdTimer); setLockMsg('Try again.'); return; } setLockMsg(`Too many tries. Wait ${s}s.`, true); };
  tick(); cdTimer = setInterval(tick, 500);
}
function turnOffLock() { lock.type = 'off'; lock.hash = null; lock.salt = null; saveLock(); }
function showForgot() {
  const box = $('#forgotBox'); box.hidden = false;
  if (isAccount()) {
    box.innerHTML = `Enter your TMBO account password for <b>${esc(session.user.email)}</b> to remove the lock.
      <input class="txt lockinput" type="password" id="fgPw" placeholder="Account password" style="margin-top:10px"><div class="lockmsg" id="fgMsg"></div>
      <button class="btn primary full" id="fgGo">Verify &amp; remove lock</button>`;
    $('#fgGo').onclick = async () => {
      const { error } = await session.db.auth.signInWithPassword({ email: session.user.email, password: $('#fgPw').value });
      if (!error) { turnOffLock(); unlockNow(); renderAll(); toast('Lock removed. You can set a new one in Settings.'); }
      else { $('#fgMsg').textContent = friendlyAuthError(error); $('#fgMsg').classList.add('err'); }
    };
  } else {
    let armed = false;
    box.innerHTML = 'Without an account, TMBO can’t confirm it’s you. You can erase TMBO’s data on this device and start fresh.<button class="btn full" id="fgErase" style="background:#e5484d;color:#fff">Erase data &amp; remove lock</button>';
    $('#fgErase').onclick = (e) => {
      if (!armed) { armed = true; e.target.textContent = 'Tap again to erase everything'; return; }
      eraseDevice();
    };
  }
}
function eraseDevice() {
  turnOffLock(); unlockNow();
  LS.del('tmbo:guest'); LS.del('tmbo:fired');
  device.onboarded = false; device.mode = 'guest'; saveDevice();
  loadData(null); applySettings(); renderAll(); showWelcome();
}
function renderLockCard() {
  const on = lock.type !== 'off';
  $('#lockCard').innerHTML = `
    <div class="block"><b>Lock TMBO with</b><div class="seg" id="lockSeg"><button data-v="off">Off</button><button data-v="pin">PIN</button><button data-v="pattern">Pattern</button><button data-v="password">Password</button></div></div>
    ${on ? `<div class="block"><b>Lock after leaving the app</b><div class="seg" id="lockAfterSeg"><button data-v="0">Right away</button><button data-v="1">1 min</button><button data-v="5">5 min</button><button data-v="15">15 min</button></div></div>
    <div class="block btnrow"><button class="btn ghost" id="lockChange">Change ${lock.type === 'pin' ? 'PIN' : lock.type}</button><button class="btn primary" id="lockNowBtn">Lock now</button></div>` : ''}
    <div class="block"><small style="color:var(--muted);font-size:.78rem;line-height:1.4;display:block">The lock is saved only on this device and keeps others from opening TMBO. It’s a privacy screen, not encryption.</small></div>`;
  $$('#lockSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === lock.type));
  $$('#lockAfterSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.v === lock.after));
}

/* ================= CUSTOMIZE HOME ================= */
function openCustomize() {
  openPanel(`<h3>Customize home</h3>
    <div class="preview" id="cPreview"></div>
    <label class="f">Scene</label><div class="scenes" id="cScenes"></div>
    <input type="file" id="cFile" accept="image/*" hidden>
    <div class="btnrow" id="cPhotoBtns" hidden><button type="button" class="clearbtn" id="cPhotoChange">Change photo</button><button type="button" class="clearbtn" id="cPhotoRemove" style="color:var(--t1)">Remove photo</button></div>
    <label class="f" id="cPalLabel">Colors</label><div class="palettes" id="cPal"></div>
    <label class="f">Quote style</label><div class="seg" id="cFont">${FONTS.map((f) => `<button type="button" data-v="${f.v}">${f.l}</button>`).join('')}</div>
    <label class="f">Quote</label><div class="qlist" id="cQuotes"></div>
    <div class="row"><div><b>New random quote each time</b><small>Shows a different quote whenever you open TMBO.</small></div><label class="switch"><input type="checkbox" id="cRandom"><span></span></label></div>
    <button type="button" class="btn ghost full" id="cShuffle">Shuffle a quote now</button>
    <label class="f">Write your own</label>
    <div class="addq"><textarea class="txt" id="cNewQ" rows="2" maxlength="160" placeholder="A quote, a goal, or a personal motto"></textarea><input class="txt" id="cNewA" maxlength="40" placeholder="Author (optional)"><button type="button" class="btn primary" id="cAddQ">Add &amp; use this quote</button></div>
    <div class="actions"><button type="button" class="btn primary full" id="cDone">Done</button></div>`);
  const h = state.home;
  const paint = () => {
    $('#cPreview').innerHTML = heroHTML(false);
    $('#cScenes').innerHTML = SCENES.map((s) => {
      const th = s.id === 'photo' ? (h.photo ? `<img src="${h.photo}" alt="">` : `<span class="plus">${IC.image}</span>`) : heroSVG(s.id, h.palette);
      return `<button type="button" class="scene${h.scene === s.id ? ' on' : ''}" data-v="${s.id}"><span class="th">${th}</span><span>${s.id === 'photo' && !h.photo ? 'Add photo' : s.l}</span></button>`;
    }).join('');
    $('#cPhotoBtns').hidden = !h.photo;
    const photoMode = h.scene === 'photo' && h.photo;
    $('#cPalLabel').hidden = $('#cPal').hidden = !!photoMode;
    $('#cPal').innerHTML = Object.keys(PALETTES).map((k) => { const p = pal(k); return `<button type="button" class="pal${h.palette === k ? ' on' : ''}" data-v="${k}" title="${PALETTES[k].l}" aria-label="${PALETTES[k].l}" style="background:linear-gradient(160deg,${p.bg1},${p.bg2})"></button>`; }).join('');
    $$('#cFont button').forEach((b) => b.classList.toggle('on', b.dataset.v === h.font));
    $('#cQuotes').innerHTML = allQuotes().map((q) => {
      const mine = !QUOTES.includes(q);
      return `<div class="qitem${h.quoteId === q.id ? ' on' : ''}" data-q="${q.id}"><span class="radio"></span><p>${esc(q.text)}${mine ? '<span class="mine">YOURS</span>' : ''}${q.author ? `<small>— ${esc(q.author)}</small>` : ''}</p>${mine ? `<button type="button" class="del" data-del="${q.id}" aria-label="Delete quote">${IC.x}</button>` : ''}</div>`;
    }).join('');
    $('#cRandom').checked = h.randomOnOpen;
  };
  paint();
  const save = () => { Store.saveSettings(); paint(); renderHome(); };
  $('#cScenes').onclick = (e) => { const b = e.target.closest('.scene'); if (!b) return; if (b.dataset.v === 'photo' && !h.photo) { $('#cFile').click(); return; } h.scene = b.dataset.v; save(); };
  $('#cPhotoChange').onclick = () => $('#cFile').click();
  $('#cPhotoRemove').onclick = async () => {
    const path = h.photoPath; h.photo = null; h.photoPath = null; if (h.scene === 'photo') h.scene = 'summit'; save();
    if (isAccount() && path) { try { await session.db.storage.from('home-photos').remove([path]); } catch { /* ignore */ } }
  };
  $('#cFile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const s = Math.min(1, 1200 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        h.photo = c.toDataURL('image/jpeg', 0.82); h.scene = 'photo'; save(); toast('Photo added');
        if (isAccount()) {
          try { h.photoPath = await cloud.uploadPhoto(session.db, session.user.id, h.photo); Store.saveSettings(); }
          catch (err) { console.warn(err); toast('Photo saved on this device. Upload to your account failed.'); }
        }
      };
      img.src = r.result;
    };
    r.readAsDataURL(f); e.target.value = '';
  };
  $('#cPal').onclick = (e) => { const b = e.target.closest('.pal'); if (b) { h.palette = b.dataset.v; save(); } };
  $('#cFont').onclick = (e) => { const b = e.target.closest('button'); if (b) { h.font = b.dataset.v; save(); } };
  $('#cQuotes').onclick = (e) => {
    const d = e.target.closest('[data-del]');
    if (d) { const id = d.dataset.del; state.customQuotes = state.customQuotes.filter((q) => q.id !== id); Store.deleteQuote(id); if (h.quoteId === id) h.quoteId = 'q0'; save(); return; }
    const it = e.target.closest('.qitem'); if (it) { h.quoteId = it.dataset.q; save(); }
  };
  $('#cRandom').onchange = (e) => { h.randomOnOpen = e.target.checked; Store.saveSettings(); toast(h.randomOnOpen ? 'You’ll see a new quote each time you open TMBO' : 'Your chosen quote will stay put'); };
  $('#cShuffle').onclick = () => { randomQuote(false); save(); };
  $('#cAddQ').onclick = () => {
    const text = $('#cNewQ').value.trim(); if (!text) { toast('Type a quote first'); return; }
    const q = { id: uuid(), text, author: $('#cNewA').value.trim() }; state.customQuotes.push(q); Store.saveQuote(q); h.quoteId = q.id;
    $('#cNewQ').value = ''; $('#cNewA').value = ''; save(); toast('Your quote is on the home screen');
  };
  $('#cDone').onclick = () => closePanel(false);
}

/* ================= SETTINGS ================= */
function applySettings() {
  const s = state.settings, root = document.documentElement;
  root.style.setProperty('--accent', s.accent); root.dataset.mode = s.mode;
  root.style.fontSize = TEXT_SIZES[s.textSize] + 'px'; document.body.dataset.template = s.template;
  $('meta[name="theme-color"]').setAttribute('content', s.accent);
}
function buildSettings() {
  $('#swatches').innerHTML = ACCENTS.map((c) => `<button class="sw" data-c="${c}" style="background:${c}" aria-label="Accent ${c}"></button>`).join('') + '<label class="sw custom" title="Custom color"><input type="color" id="customColor" aria-label="Custom color"></label>';
  $('#tierLabels').innerHTML = [0, 1, 2, 3].map((i) => `<div class="tierlabel" data-tier="${i + 1}"><b>${i + 1}</b><input class="txt" data-i="${i}" maxlength="18" aria-label="Tier ${i + 1} name"></div>`).join('');
  $('#aboutLine').textContent = `TMBO · There Must Be Order · v${APP_VERSION}`;
}
function renderDataCard() {
  $('#dataCard').innerHTML = `
    <div class="row"><div><b>Download a backup</b><small>Saves your tasks, events, quotes and settings as a file.</small></div><button class="btn ghost" id="dExport">Download</button></div>
    ${isAccount() ? '' : '<div class="row"><div><b>Erase this device</b><small>Deletes all TMBO data saved on this device.</small></div><button class="btn ghost" id="dErase" style="color:var(--t1)">Erase</button></div>'}`;
}
function syncSettingsUI() {
  const s = state.settings;
  $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.mode));
  $$('#sizeSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.v === s.textSize));
  $$('#tpls .tpl').forEach((b) => b.classList.toggle('on', b.dataset.v === s.template));
  $$('#swatches .sw[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === s.accent));
  $('#swatches .custom').classList.toggle('on', !ACCENTS.includes(s.accent));
  $('#customColor').value = /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : ACCENTS[0];
  $('#sDefCarry').checked = s.defaultCarry; $('#sShowDone').checked = s.showDone;
  if (document.activeElement !== $('#sName')) $('#sName').value = state.profile.name;
  $$('#tierLabels input').forEach((inp, i) => { if (document.activeElement !== inp) inp.value = s.tierLabels[i]; });
  $('#installSettings').innerHTML = installHTML(false);
  renderAcctCard(); renderLockCard(); renderNotifCard(); renderDataCard();
}
function updateSetting(k, v) { state.settings[k] = v; applySettings(); syncSettingsUI(); Store.saveSettings(); }
function exportData() {
  const data = { app: 'TMBO', version: APP_VERSION, exportedAt: new Date().toISOString(), ...snapshot() };
  delete data.home.photo;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tmbo-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ================= NAVIGATION ================= */
const TITLES = { calendar: 'Calendar', study: 'Study', settings: 'Settings' };
function setTab(tab) {
  if (!['home', 'todo', 'calendar', 'study', 'settings'].includes(tab)) tab = 'home';
  state.tab = tab;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab));
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#todoHead').hidden = tab !== 'todo';
  $('#viewTitle').hidden = !TITLES[tab]; $('#viewTitle').textContent = TITLES[tab] || '';
  $('#fab').hidden = !['home', 'todo', 'calendar'].includes(tab);
  $('#fab').setAttribute('aria-label', tab === 'calendar' ? 'Add event' : 'Add task');
  if (tab === 'calendar') { const d = fromKey(state.selected); state.calMonth = toKey(new Date(d.getFullYear(), d.getMonth(), 1)); }
  if (location.hash !== '#' + tab) history.replaceState(null, '', tab === 'home' ? location.pathname : '#' + tab);
  renderAll(); window.scrollTo(0, 0);
}
function renderAll() {
  renderSyncPill();
  if (state.tab === 'home') renderHome();
  if (state.tab === 'todo') renderTodo();
  if (state.tab === 'calendar') renderCalendar();
  if (state.tab === 'study') { renderTimer(); renderSessions(); }
  if (state.tab === 'settings') syncSettingsUI();
}
let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2800); }

/* ================= EVENT WIRING ================= */
function bind() {
  $$('[data-logo]').forEach((e) => (e.innerHTML = IC.logo));
  $('#hdrLock').innerHTML = IC.lock;
  $('#prevDay').innerHTML = IC.left; $('#nextDay').innerHTML = IC.right; $('#prevMonth').innerHTML = IC.left; $('#nextMonth').innerHTML = IC.right;
  $('#fab').innerHTML = IC.plus;
  $$('[data-ic]').forEach((s) => (s.outerHTML = IC[s.dataset.ic]));

  $('.tabbar').onclick = (e) => { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.tab); };
  $('#syncPill').onclick = () => setTab('settings');
  $('#hdrLock').onclick = showLock;
  $('#fab').onclick = () => { if (state.tab === 'calendar') openEventSheet(null); else openSheet(null, state.tab === 'home' ? today() : state.selected); };
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1) || 'home'));

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-dismiss-install]')) { device.installDismissed = true; saveDevice(); renderAll(); }
    if (e.target.closest('[data-install]') && installPrompt) { installPrompt.prompt(); installPrompt = null; }
  });

  // home
  $('#view-home').addEventListener('click', (e) => {
    if (e.target.closest('#heroShuffle')) { randomQuote(true); return; }
    if (e.target.closest('#heroCustomize')) { openCustomize(); return; }
    if (e.target.closest('#seeAll')) { state.selected = today(); setTab('todo'); return; }
    if (e.target.closest('#homeEvents')) { if (upcomingEvents().length) setTab('calendar'); else openEventSheet(null); return; }
    const go = e.target.closest('[data-go]'); if (go) { if (go.dataset.go === 'todo') state.selected = today(); setTab(go.dataset.go); return; }
    const ev = e.target.closest('[data-act="edit-ev"]'); if (ev) { openEventSheet(state.events.find((x) => x.id === ev.closest('.event').dataset.eid)); return; }
    const a = e.target.closest('.top3-item [data-act]'); if (!a) return;
    const id = a.closest('.top3-item').dataset.id;
    if (a.dataset.act === 'toggle') toggleTask(id, today()); else openSheet(findTask(id));
  });

  // to-do
  $('#prevDay').onclick = () => { state.selected = addDays(state.selected, -1); renderTodo(); };
  $('#nextDay').onclick = () => { state.selected = addDays(state.selected, 1); renderTodo(); };
  $('#dateBtn').onclick = () => { state.selected = today(); renderTodo(); };
  $('#week').onclick = (e) => { const b = e.target.closest('.wd'); if (b) { state.selected = b.dataset.k; renderTodo(); } };
  $('#todoList').onclick = (e) => { const a = e.target.closest('[data-act]'); if (!a) return; const id = a.closest('.task').dataset.id; if (a.dataset.act === 'toggle') toggleTask(id); else openSheet(findTask(id)); };

  // task sheet
  $('#taskForm').onsubmit = saveSheet;
  $('#fCancel').onclick = closeSheet; $('#fDelete').onclick = deleteFromSheet;
  $('#fRemindClear').onclick = () => { $('#fRemind').value = ''; };
  $('#sheetWrap').onclick = (e) => { if (e.target.id === 'sheetWrap') closeSheet(); };
  $('#fTier').onclick = (e) => { const b = e.target.closest('button'); if (b) { draft.tier = +b.dataset.v; syncSheet(); } };
  $('#fRepeat').onclick = (e) => { const b = e.target.closest('button'); if (b) { draft.repeat = b.dataset.v; syncSheet(); } };
  $('#fCarry').onchange = (e) => { draft.carryOver = e.target.checked; };
  $('#fDays').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const v = +b.dataset.v; draft.days = draft.days.includes(v) ? draft.days.filter((x) => x !== v) : [...draft.days, v]; syncSheet(); };
  $('#panelWrap').onclick = (e) => { if (e.target.id === 'panelWrap') closePanel(true); };
  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape' || lock.locked) return; if (draft) closeSheet(); else if ($('#panelWrap').classList.contains('open')) closePanel(true); });

  // calendar
  $('#addEventBtn').onclick = () => openEventSheet(null);
  $('#eventList').onclick = (e) => { const a = e.target.closest('[data-act="edit-ev"]'); if (a) openEventSheet(state.events.find((x) => x.id === a.closest('.event').dataset.eid)); };
  $('#prevMonth').onclick = () => { const d = fromKey(state.calMonth); state.calMonth = toKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)); renderCalendar(); };
  $('#nextMonth').onclick = () => { const d = fromKey(state.calMonth); state.calMonth = toKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)); renderCalendar(); };
  $('#cal').onclick = (e) => { const b = e.target.closest('.day'); if (b) { state.selected = b.dataset.k; renderCalendar(); } };
  $('#openDay').onclick = () => setTab('todo');

  // study
  $('#studyMode').onclick = (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); };
  $('#focusLen').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; study.len.focus = +b.dataset.v; if (study.mode === 'focus') setMode('focus'); else renderTimer(); };
  $('#tStart').onclick = () => { if (study.running) { stopTimer(); renderTimer(); } else startTimer(); };
  $('#tReset').onclick = () => setMode(study.mode);

  // welcome
  $('#welcomeBody').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-w]'); if (!b) return; const w = b.dataset.w;
    if (w === 'guest') { startGuest(); device.mode = 'guest'; saveDevice(); renderWelcome('notify'); }
    else if (w === 'notify-yes') { const p = await enableNotifications(); finishOnboarding(p === 'granted' ? 'Notifications are on' : 'Reminders are on. They’ll show inside TMBO.'); }
    else if (w === 'notify-no') finishOnboarding(isAccount() ? `Welcome to TMBO${state.profile.name ? ', ' + state.profile.name : ''}` : 'You’re all set. Your data stays on this device.');
    else renderWelcome(w);
  });

  // settings
  $('#view-settings').addEventListener('click', async (e) => {
    const ac = e.target.closest('[data-acct]');
    if (ac) { if (ac.dataset.acct === 'signout') signOut(); else openAuthPanel(ac.dataset.acct); return; }
    const ls = e.target.closest('#lockSeg button');
    if (ls) {
      const v = ls.dataset.v; if (v === lock.type) return;
      if (v === 'off') { turnOffLock(); renderAll(); toast('App lock is off'); }
      else openLockSetup(v, (ok) => { renderAll(); if (ok) toast(`App lock is on (${v === 'pin' ? 'PIN' : v})`); });
      return;
    }
    const la = e.target.closest('#lockAfterSeg button'); if (la) { lock.after = +la.dataset.v; saveLock(); renderLockCard(); return; }
    if (e.target.closest('#lockChange')) { openLockSetup(lock.type, (ok) => { renderAll(); if (ok) toast('Lock updated'); }); return; }
    if (e.target.closest('#lockNowBtn')) { showLock(); return; }
    if (e.target.closest('#nAllow')) {
      let p = permNow(); if (p === 'default') p = await Notification.requestPermission();
      if (p === 'granted') { try { await subscribePushNow(); toast('This device will get reminders'); } catch (err) { toast('Couldn’t set up push on this device.'); console.warn(err); } }
      renderNotifCard(); return;
    }
    if (e.target.closest('#nTest')) { const was = document.hidden; notify({ title: 'TMBO test notification', body: 'Reminders are working. There must be order.' }); if (!was && permNow() === 'granted') { try { (await navigator.serviceWorker?.getRegistration())?.showNotification('TMBO test notification', { body: 'Reminders are working.', icon: 'icons/icon-192.png' }); } catch { /* ignore */ } } return; }
    if (e.target.closest('#dExport')) { exportData(); return; }
    const er = e.target.closest('#dErase');
    if (er) { if (er.dataset.armed) eraseDevice(); else { er.dataset.armed = '1'; er.textContent = 'Tap again'; } return; }
  });
  $('#view-settings').addEventListener('change', async (e) => {
    if (e.target.id === 'nOn') {
      if (e.target.checked) { const p = await enableNotifications(); toast(p === 'granted' ? 'Notifications are on' : 'Reminders are on (shown inside TMBO)'); checkReminders(); }
      else { state.notif.enabled = false; Store.saveSettings(); toast('Reminders are off'); }
      renderNotifCard();
    }
    if (e.target.id === 'nTime') { state.notif.time = e.target.value || '09:00'; Store.saveSettings(); renderNotifCard(); }
    if (e.target.id === 'nSummary') { state.notif.summary = e.target.checked; Store.saveSettings(); renderNotifCard(); }
  });
  $('#sCustomize').onclick = openCustomize;
  $('#sName').addEventListener('input', (e) => { state.profile.name = e.target.value; Store.saveSettings(); });
  $('#modeSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) updateSetting('mode', b.dataset.v); };
  $('#sizeSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) updateSetting('textSize', +b.dataset.v); };
  $('#tpls').onclick = (e) => { const b = e.target.closest('.tpl'); if (b) updateSetting('template', b.dataset.v); };
  $('#swatches').onclick = (e) => { const b = e.target.closest('.sw[data-c]'); if (b) updateSetting('accent', b.dataset.c); };
  $('#swatches').addEventListener('input', (e) => { if (e.target.id === 'customColor') updateSetting('accent', e.target.value); });
  $('#tierLabels').addEventListener('input', (e) => { const i = e.target.dataset.i; if (i == null) return; state.settings.tierLabels[i] = e.target.value.trim() || DEFAULT_TIERS[i]; Store.saveSettings(); });
  $('#sDefCarry').onchange = (e) => updateSetting('defaultCarry', e.target.checked);
  $('#sShowDone').onchange = (e) => updateSetting('showDone', e.target.checked);

  // lock screen
  $('#forgotBtn').onclick = showForgot;
  document.addEventListener('keydown', (e) => { if (lock.locked && lock.type === 'pin' && lockWidget) { if (/^\d$/.test(e.key)) lockWidget.type(e.key); else if (e.key === 'Backspace') lockWidget.type('del'); } });

  // app lifecycle
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { lock.hiddenAt = Date.now(); return; }
    if (lock.type !== 'off' && !lock.locked && lock.hiddenAt && Date.now() - lock.hiddenAt >= lock.after * 60000) showLock();
    if (isAccount()) pull();
    checkDayChange(); checkReminders();
  });
  window.addEventListener('online', renderSyncPill); window.addEventListener('offline', renderSyncPill);
  setInterval(() => { checkDayChange(); checkReminders(); renderSyncPill(); }, 30000);
}
let lastDay = today();
function checkDayChange() {
  const td = today(); if (td === lastDay) return;
  if (state.selected === lastDay) state.selected = td;
  lastDay = td; fired.clear(); saveFired();
  rollover(); renderAll();
}

/* ================= BOOT ================= */
async function boot() {
  bind(); buildSettings(); applySettings(); renderTimer();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch((e) => console.warn('TMBO: service worker failed', e));

  let user = null;
  const authInUrl = /access_token|refresh_token|type=recovery|type=signup/.test(location.hash) || /[?&]code=/.test(location.search);
  if (cloud.isConfigured && (device.mode === 'account' || authInUrl)) {
    try {
      const db = await cloud.client(); ensureAuthListener(db);
      const { data } = await db.auth.getSession();
      user = data.session?.user || null;
    } catch (e) { console.warn('TMBO: could not start Supabase', e); }
  }
  if (user) {
    startAccount(user).catch((e) => console.warn(e));
  } else {
    if (device.mode === 'account') { device.mode = 'guest'; device.onboarded = false; saveDevice(); }
    if (device.onboarded) startGuest();
  }
  if (state.home.randomOnOpen) randomQuote(false);
  state.selected = today();
  const hashTab = location.hash.slice(1);
  setTab(['todo', 'calendar', 'study', 'settings'].includes(hashTab) ? hashTab : 'home');
  if (!device.onboarded && !user) showWelcome();
  else if (user && !device.onboarded) { device.onboarded = true; saveDevice(); }
  if (lock.type !== 'off') showLock();
  $('#boot')?.remove();
  setTimeout(checkReminders, 1200);
}
boot();
