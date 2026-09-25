// =====================================================================
//  TMBO: send-reminders (Supabase Edge Function)
//  Runs every 5 minutes (see supabase/cron.sql). Finds reminders that are
//  due for each user in their own timezone and sends them as Web Push
//  notifications to every device they turned notifications on for.
//
//  Required secrets (Supabase > Edge Functions > Secrets):
//    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
//  Provided automatically by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//  (If your project doesn't provide SUPABASE_SERVICE_ROLE_KEY, add a secret
//   named SERVICE_KEY containing your project's secret / service_role key.)
// =====================================================================
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const WINDOW_MIN = 30; // send reminders whose time passed within the last 30 minutes
const TYPE_LABEL: Record<string, string> = { test: 'test', interview: 'interview', deadline: 'deadline', other: 'event' };
const DEFAULT_TIERS = ['Must do', 'Should do', 'Could do', 'Nice to have'];

type Reminder = { key: string; title: string; body: string; url: string };

// ---------- date helpers (dates are 'YYYY-MM-DD' strings) ----------
function localNow(tz: string) {
  let parts: Record<string, string>;
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  } catch {
    return localNow('America/New_York');
  }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const toUTC = (k: string) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const addDays = (k: string, n: number) => new Date(toUTC(k) + n * 864e5).toISOString().slice(0, 10);
const weekday = (k: string) => new Date(toUTC(k)).getUTCDay();
const mins = (t: string | null) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmtTime = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

// deno-lint-ignore no-explicit-any
function occursOn(t: any, k: string) {
  if (t.repeat === 'once') return t.task_date === k;
  if (k < t.task_date) return false;
  if (t.until_date && k > t.until_date) return false;
  const d = weekday(k);
  if (t.repeat === 'daily') return true;
  if (t.repeat === 'weekdays') return d > 0 && d < 6;
  return (t.repeat_days ?? []).includes(d);
}

// deno-lint-ignore no-explicit-any
function eventText(ev: any, n: number) {
  const when = ev.event_time ? ` at ${fmtTime(ev.event_time)}` : '';
  if (n === 0) return {
    title: `Today: ${ev.title}${when}`,
    body: ev.type === 'interview' ? 'Review your notes, arrive early, and breathe. You’ve got this.'
                                  : 'Final review, then trust your preparation. You’ve got this.',
  };
  if (n === 1) return {
    title: `Tomorrow: ${ev.title}${when}`,
    body: ev.type === 'test' ? 'Do a final review today and get good sleep tonight.'
        : ev.type === 'interview' ? 'Prep your answers and questions, and lay out what you’ll wear.'
        : 'Wrap up the last pieces today.',
  };
  return {
    title: `${ev.title} in ${n} days`,
    body: ev.type === 'test' ? 'Block out study time today. Start a focus session to prepare.'
        : ev.type === 'interview' ? 'Research the company and practice your stories today.'
        : `Your ${TYPE_LABEL[ev.type] ?? 'event'} is coming up. Plan your prep today.`,
  };
}

// deno-lint-ignore no-explicit-any
async function remindersForUser(s: any): Promise<Reminder[]> {
  const { date: today, minutes: now } = localNow(s.timezone || 'America/New_York');
  const due = (m: number | null) => m !== null && m <= now && m > now - WINDOW_MIN;
  const tiers: string[] = Array.isArray(s.tier_labels) ? s.tier_labels : DEFAULT_TIERS;
  const out: Reminder[] = [];

  const [{ data: tasks }, { data: comps }, { data: events }] = await Promise.all([
    db.from('tasks').select('*').eq('user_id', s.user_id)
      .or(`repeat.neq.once,and(task_date.eq.${today},done.eq.false)`),
    db.from('task_completions').select('task_id').eq('user_id', s.user_id).eq('completed_on', today),
    db.from('events').select('*').eq('user_id', s.user_id)
      .gte('event_date', today).lte('event_date', addDays(today, 31)),
  ]);
  const doneToday = new Set((comps ?? []).map((c) => c.task_id));
  // deno-lint-ignore no-explicit-any
  const todays = (tasks ?? []).filter((t: any) => occursOn(t, today) &&
    !(t.repeat === 'once' ? t.done : doneToday.has(t.id)));

  // 1) Task reminders
  for (const t of todays) {
    if (due(mins(t.remind_at))) out.push({
      key: `t:${t.id}:${today}`, title: t.title, url: '/#todo',
      body: `Tier ${t.tier} · ${tiers[t.tier - 1] ?? ''}${t.repeat === 'once' ? ' — due today' : ''}`,
    });
  }
  // 2) Event prep reminders + 3) Morning Top 3, at the user's notify_time
  if (due(mins(s.notify_time))) {
    for (const ev of events ?? []) {
      for (const n of ev.remind_days ?? []) {
        if (addDays(ev.event_date, -n) === today) out.push({ key: `e:${ev.id}:${n}:${today}`, url: '/#calendar', ...eventText(ev, n) });
      }
    }
    if (s.notify_summary) {
      // deno-lint-ignore no-explicit-any
      const top = [...todays].sort((a: any, b: any) => a.tier - b.tier || a.created_at.localeCompare(b.created_at)).slice(0, 3);
      if (top.length) out.push({
        key: `s:${today}`, title: 'Your Top 3 today', url: '/',
        // deno-lint-ignore no-explicit-any
        body: top.map((t: any, i: number) => `${i + 1}. ${t.title}`).join('  '),
      });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  let sent = 0, failed = 0;
  const { data: users, error } = await db.from('user_settings').select('*').eq('notify_enabled', true);
  if (error) return new Response(`settings error: ${error.message}`, { status: 500 });

  for (const s of users ?? []) {
    try {
      const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', s.user_id);
      if (!subs?.length) continue;
      const reminders = await remindersForUser(s);
      if (!reminders.length) continue;

      // Claim keys first; only newly inserted keys are returned, so nothing is sent twice.
      const { data: claimed } = await db.from('sent_reminders')
        .upsert(reminders.map((r) => ({ key: r.key, user_id: s.user_id })), { onConflict: 'key', ignoreDuplicates: true })
        .select('key');
      const fresh = new Set((claimed ?? []).map((c) => c.key));

      for (const r of reminders.filter((r) => fresh.has(r.key))) {
        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.key }),
              { TTL: 3600 },
            );
            sent++;
          } catch (e) {
            failed++;
            // deno-lint-ignore no-explicit-any
            const code = (e as any)?.statusCode;
            if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', sub.id);
            else console.error('push failed', code, (e as Error)?.message);
          }
        }
      }
    } catch (e) {
      console.error('user failed', s.user_id, e);
    }
  }
  // housekeeping: forget sent keys older than 30 days
  await db.from('sent_reminders').delete().lt('sent_at', new Date(Date.now() - 30 * 864e5).toISOString());
  return new Response(JSON.stringify({ sent, failed }), { headers: { 'Content-Type': 'application/json' } });
});
