// =====================================================================
//  TMBO cloud layer: Supabase client, row mapping, offline-safe sync
//  queue, push subscriptions and photo storage.
// =====================================================================
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, VAPID_PUBLIC_KEY } from './config.js';

export const isConfigured =
  /^https:\/\/\S+/.test(SUPABASE_URL) && !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  !!SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.startsWith('PASTE');

export const pushConfigured = isConfigured && !!VAPID_PUBLIC_KEY && !VAPID_PUBLIC_KEY.startsWith('PASTE');

let sb = null;
export async function client() {
  if (!isConfigured) return null;
  if (sb) return sb;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return sb;
}

/* ---------------- row mapping (app object <-> database row) ---------------- */
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

export const toTaskRow = (t) => ({
  id: t.id, title: t.title, notes: t.notes || null, tier: t.tier, repeat: t.repeat,
  repeat_days: t.days || [], task_date: t.date, until_date: t.until || null,
  original_date: t.originalDate || t.date, carry_over: !!t.carryOver, carried_days: t.carried || 0,
  done: !!t.done, done_on: t.doneOn || null, remind_at: t.remindAt || null,
  event_id: t.eventId || null, created_at: new Date(t.createdAt || Date.now()).toISOString(),
});
export const fromTaskRow = (r, completions = {}) => ({
  id: r.id, title: r.title, notes: r.notes || '', tier: r.tier, repeat: r.repeat,
  days: r.repeat_days || [], date: r.task_date, until: r.until_date, originalDate: r.original_date,
  carryOver: r.carry_over, carried: r.carried_days, done: r.done, doneOn: r.done_on,
  remindAt: hhmm(r.remind_at), eventId: r.event_id, completions, createdAt: Date.parse(r.created_at),
});
export const toEventRow = (e) => ({
  id: e.id, title: e.title, type: e.type, event_date: e.date, event_time: e.time || null,
  notes: e.notes || null, remind_days: e.remind || [], prep_task: !!e.prep, prep_task_id: e.prepTaskId || null,
});
export const fromEventRow = (r) => ({
  id: r.id, title: r.title, type: r.type, date: r.event_date, time: hhmm(r.event_time),
  notes: r.notes || '', remind: r.remind_days || [], prep: r.prep_task, prepTaskId: r.prep_task_id,
});
export const toSessionRow = (s) => ({ id: s.id, subject: s.subject, minutes: s.minutes, studied_on: s.date });
export const fromSessionRow = (r) => ({ id: r.id, subject: r.subject, minutes: r.minutes, date: r.studied_on });
export const toQuoteRow = (q) => ({ id: q.id, text: q.text, author: q.author || null });
export const fromQuoteRow = (r) => ({ id: r.id, text: r.text, author: r.author || '' });

export function toSettingsRow(state, uid) {
  const s = state.settings, h = state.home, n = state.notif;
  return {
    user_id: uid, display_name: state.profile.name || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    accent: s.accent, mode: s.mode, text_size: s.textSize, template: s.template,
    tier_labels: s.tierLabels, default_carry: s.defaultCarry, show_done: s.showDone,
    home_scene: h.scene, home_palette: h.palette, home_font: h.font, home_photo_path: h.photoPath || null,
    quote_id: h.quoteId, random_quote: h.randomOnOpen,
    notify_enabled: n.enabled, notify_time: n.time, notify_summary: n.summary,
  };
}
export function applySettingsRow(state, r) {
  Object.assign(state.settings, {
    accent: r.accent, mode: r.mode, textSize: r.text_size, template: r.template,
    tierLabels: Array.isArray(r.tier_labels) && r.tier_labels.length === 4 ? r.tier_labels : state.settings.tierLabels,
    defaultCarry: r.default_carry, showDone: r.show_done,
  });
  Object.assign(state.home, {
    scene: r.home_scene, palette: r.home_palette, font: r.home_font,
    quoteId: r.quote_id, randomOnOpen: r.random_quote, photoPath: r.home_photo_path || null,
  });
  Object.assign(state.notif, { enabled: r.notify_enabled, time: hhmm(r.notify_time) || '09:00', summary: r.notify_summary });
  if (r.display_name) state.profile.name = r.display_name;
}

/* ---------------- loading ---------------- */
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// Loads everything the app needs for the signed-in user.
export async function pullAll(db, todayKey) {
  const back = (n) => { const d = new Date(todayKey + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const [tasks, comps, events, quotes, sessions, settings] = await Promise.all([
    fetchAll(() => db.from('tasks').select('*').or(`repeat.neq.once,done.eq.false,task_date.gte.${back(120)}`).order('created_at')),
    fetchAll(() => db.from('task_completions').select('task_id,completed_on').gte('completed_on', back(400))),
    fetchAll(() => db.from('events').select('*').gte('event_date', back(120)).order('event_date')),
    fetchAll(() => db.from('custom_quotes').select('*').order('created_at')),
    fetchAll(() => db.from('study_sessions').select('*').gte('studied_on', back(90)).order('created_at')),
    db.from('user_settings').select('*').maybeSingle(),
  ]);
  if (settings.error) throw settings.error;
  const byTask = {};
  comps.forEach((c) => ((byTask[c.task_id] ??= {})[c.completed_on] = true));
  return {
    tasks: tasks.map((r) => fromTaskRow(r, byTask[r.id] || {})),
    events: events.map(fromEventRow),
    customQuotes: quotes.map(fromQuoteRow),
    sessions: sessions.map(fromSessionRow),
    settingsRow: settings.data,
  };
}

/* ---------------- offline-safe write queue ----------------
   Every change is saved on the device first, then queued here and sent to
   Supabase in order. If the phone is offline, the queue waits and retries. */
export function createQueue(db, uid, { onIdle, onError } = {}) {
  const KEY = `tmbo:queue:${uid}`;
  let q = [];
  try { q = JSON.parse(localStorage.getItem(KEY)) || []; } catch { q = []; }
  let flushing = false, timer = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage full */ } };
  const idOf = (op) => `${op.table}:${op.key}`;

  function push(op) {
    const start = flushing ? 1 : 0; // never touch the op that is being sent right now
    if (op.kind === 'upsert') {
      const i = q.findIndex((o, idx) => idx >= start && o.kind === 'upsert' && idOf(o) === idOf(op));
      if (i >= 0) q[i] = op; else q.push(op);
    } else {
      q = q.filter((o, idx) => idx < start || !(o.kind === 'upsert' && idOf(o) === idOf(op)));
      q.push(op);
    }
    save();
    clearTimeout(timer); timer = setTimeout(flush, 350);
  }

  async function run(op) {
    const t = db.from(op.table);
    if (op.kind === 'upsert') return op.onConflict ? t.upsert(op.row, { onConflict: op.onConflict }) : t.upsert(op.row);
    return t.delete().match(op.match);
  }

  async function flush() {
    if (flushing || !q.length || !navigator.onLine) return;
    flushing = true;
    try {
      while (q.length) {
        let res;
        try { res = await run(q[0]); } catch (e) { res = { error: { message: String(e) } }; }
        if (res.error) {
          const code = String(res.error.code || '');
          if (/^(22|23|42)/.test(code)) {           // bad data / permission: will never succeed
            console.warn('TMBO: dropped a change that the server rejected', q[0], res.error);
            onError?.(res.error);
            q.shift(); save(); continue;
          }
          break;                                    // network or auth hiccup: retry later
        }
        q.shift(); save();
      }
    } finally { flushing = false; }
    if (!q.length) onIdle?.();
  }

  const online = () => flush();
  window.addEventListener('online', online);
  const iv = setInterval(flush, 20000);
  setTimeout(flush, 500);
  return {
    push, flush,
    get size() { return q.length; },
    stop() { clearInterval(iv); clearTimeout(timer); window.removeEventListener('online', online); },
    discard() { q = []; try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
  };
}

/* ---------------- push notifications ---------------- */
function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export const pushSupported = () => pushConfigured && 'serviceWorker' in navigator && 'PushManager' in window;

export async function subscribePush(db) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  const { error } = await db.from('push_subscriptions')
    .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
  return true;
}
export async function unsubscribePush(db) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await db?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch (e) { console.warn('TMBO: unsubscribe failed', e); }
}

/* ---------------- home-screen photo (Supabase Storage) ---------------- */
export async function uploadPhoto(db, uid, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${uid}/home.jpg`;
  const { error } = await db.storage.from('home-photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}
export async function downloadPhoto(db, path) {
  const { data, error } = await db.storage.from('home-photos').download(path);
  if (error) throw error;
  return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(data); });
}
