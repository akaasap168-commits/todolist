import { addDays } from 'date-fns';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onVisionChange, useSettings, type DayUpdater } from '../../data/hooks';
import type { Block, ExternalEvent } from '../../data/types';
import { dateAt, fromKey } from '../../lib/date';
import { DAY_MIN } from '../../lib/time';

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';
const TOKEN_KEY = 'planner:gcal-token';
const API = 'https://www.googleapis.com/calendar/v3';

interface TokenResponse {
  access_token: string;
  expires_in: number | string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(o?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(c: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, cb?: () => void): void;
        };
      };
    };
  }
}

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

export interface CalendarInfo {
  id: string;
  summary: string;
  color?: string;
  primary: boolean;
  writable: boolean;
}

interface Token {
  value: string;
  exp: number;
}

class HttpError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Google のスクリプトを読み込めませんでした'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function readToken(): Token | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as Token | null;
    return t && t.exp > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

export interface GcalApi {
  configured: boolean;
  connected: boolean;
  canExport: boolean;
  calendars: CalendarInfo[];
  error: string | null;
  version: number;
  connect(): void;
  disconnect(): void;
  refresh(): void;
  clearError(): void;
  fetchEvents(dates: string[]): Promise<Record<string, ExternalEvent[]>>;
  pushDay(date: string, vision: Block[], update: DayUpdater): void;
}

const GcalContext = createContext<GcalApi | null>(null);

export function useGcal(): GcalApi {
  const v = useContext(GcalContext);
  if (!v) throw new Error('GcalProvider missing');
  return v;
}

const eventBody = (date: string, b: Block) => ({
  summary: b.title || '(無題)',
  description: b.note ?? '',
  start: { dateTime: dateAt(date, b.start).toISOString() },
  end: { dateTime: dateAt(date, b.end).toISOString() },
  extendedProperties: { private: { plannerBlockId: b.id } },
});

const isGone = (e: unknown) => e instanceof HttpError && (e.status === 404 || e.status === 410);

export function GcalProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [token, setToken] = useState<Token | null>(readToken);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const clientRef = useRef<TokenClient | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const calendarsRef = useRef(calendars);
  calendarsRef.current = calendars;
  const inflight = useRef(new Set<string>());

  const dropToken = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  useEffect(() => {
    if (!CLIENT_ID) return;
    loadGis()
      .then(() => {
        clientRef.current = window.google!.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (r) => {
            if (r.error) {
              setError(`Google カレンダーに接続できませんでした: ${r.error_description ?? r.error}`);
              return;
            }
            const t = { value: r.access_token, exp: Date.now() + Number(r.expires_in) * 1000 };
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t));
            setError(null);
            setToken(t);
          },
          error_callback: (e) => {
            if (e.type !== 'popup_closed') setError(`Google カレンダーに接続できませんでした: ${e.message ?? e.type}`);
          },
        });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!token) return;
    const t = window.setTimeout(dropToken, Math.max(0, token.exp - Date.now()));
    return () => window.clearTimeout(t);
  }, [token, dropToken]);

  const api = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const t = tokenRef.current;
      if (!t) throw new HttpError(401, 'Google カレンダーに未接続です');
      const res = await fetch(`${API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${t.value}`, 'Content-Type': 'application/json' },
      });
      if (res.status === 401) dropToken();
      if (!res.ok) throw new HttpError(res.status, `${res.status} ${await res.text()}`);
      return (res.status === 204 ? null : await res.json()) as T;
    },
    [dropToken],
  );

  useEffect(() => {
    if (!token) {
      setCalendars([]);
      return;
    }
    api<{ items: { id: string; summary: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; accessRole: string }[] }>(
      '/users/me/calendarList?minAccessRole=reader',
    )
      .then((r) =>
        setCalendars(
          r.items.map((c) => ({
            id: c.id,
            summary: c.summaryOverride ?? c.summary,
            color: c.backgroundColor,
            primary: !!c.primary,
            writable: c.accessRole === 'owner' || c.accessRole === 'writer',
          })),
        ),
      )
      .catch((e: Error) => setError(`カレンダー一覧の取得に失敗: ${e.message}`));
  }, [token, api]);

  const fetchEvents = useCallback(
    async (dates: string[]) => {
      const out: Record<string, ExternalEvent[]> = {};
      dates.forEach((d) => (out[d] = []));
      const g = settingsRef.current.gcal;
      const ids = g.importCalendarIds.filter((id) => id !== g.exportCalendarId);
      if (!dates.length || !ids.length || !tokenRef.current) return out;
      const min = fromKey(dates[0]);
      const max = addDays(fromKey(dates[dates.length - 1]), 1);
      const q = new URLSearchParams({
        timeMin: min.toISOString(),
        timeMax: max.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      });
      await Promise.all(
        ids.map(async (calId) => {
          const color = calendarsRef.current.find((c) => c.id === calId)?.color;
          const r = await api<{ items: GEvent[] }>(`/calendars/${encodeURIComponent(calId)}/events?${q}`);
          for (const ev of r.items) {
            if (ev.status === 'cancelled') continue;
            const title = ev.summary ?? '(予定あり)';
            if (ev.start.date && ev.end.date) {
              for (const d of dates) {
                if (d >= ev.start.date && d < ev.end.date) {
                  out[d].push({ id: ev.id, calendarId: calId, title, date: d, start: 0, end: DAY_MIN, allDay: true, color });
                }
              }
            } else if (ev.start.dateTime && ev.end.dateTime) {
              const es = new Date(ev.start.dateTime).getTime();
              const ee = new Date(ev.end.dateTime).getTime();
              for (const d of dates) {
                const ds = fromKey(d).getTime();
                const de = addDays(fromKey(d), 1).getTime();
                if (ee <= ds || es >= de) continue;
                out[d].push({
                  id: ev.id,
                  calendarId: calId,
                  title,
                  date: d,
                  start: Math.round((Math.max(es, ds) - ds) / 60000),
                  end: Math.round((Math.min(ee, de) - ds) / 60000),
                  allDay: false,
                  color,
                });
              }
            }
          }
        }),
      );
      return out;
    },
    [api],
  );

  /** Mirror vision blocks flagged gcalSync into the export calendar. */
  const reconcile = useCallback(
    async (date: string, prev: Block[], next: Block[], update: DayUpdater, force = false) => {
      const cal = settingsRef.current.gcal.exportCalendarId;
      if (!tokenRef.current || !cal) return;
      const base = `/calendars/${encodeURIComponent(cal)}/events`;
      const ids = new Map<string, string | undefined>();
      const nextById = new Map(next.map((b) => [b.id, b]));
      const prevById = new Map(prev.map((b) => [b.id, b]));
      const del = async (eventId: string) => {
        try {
          await api(`${base}/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
        } catch (e) {
          if (!isGone(e)) throw e;
        }
      };
      const create = async (b: Block) =>
        (await api<{ id: string }>(base, { method: 'POST', body: JSON.stringify(eventBody(date, b)) })).id;

      try {
        for (const p of prev) {
          if (p.gcalEventId && !nextById.has(p.id)) await del(p.gcalEventId);
        }
        for (const n of next) {
          if (!n.gcalSync) {
            if (n.gcalEventId) {
              await del(n.gcalEventId);
              ids.set(n.id, undefined);
            }
            continue;
          }
          if (n.gcalEventId) {
            const p = prevById.get(n.id);
            const changed =
              force || !p || p.start !== n.start || p.end !== n.end || p.title !== n.title || (p.note ?? '') !== (n.note ?? '');
            if (!changed) continue;
            try {
              await api(`${base}/${encodeURIComponent(n.gcalEventId)}`, {
                method: 'PATCH',
                body: JSON.stringify(eventBody(date, n)),
              });
            } catch (e) {
              if (isGone(e)) ids.set(n.id, await create(n));
              else throw e;
            }
          } else if (!inflight.current.has(n.id)) {
            inflight.current.add(n.id);
            try {
              ids.set(n.id, await create(n));
            } finally {
              inflight.current.delete(n.id);
            }
          }
        }
        if (ids.size) {
          update(date, (cur) => ({
            vision: cur.vision.map((b) => (ids.has(b.id) ? { ...b, gcalEventId: ids.get(b.id) } : b)),
          }));
        }
      } catch (e) {
        setError(`Google カレンダーへの書き出しに失敗: ${(e as Error).message}`);
      }
    },
    [api],
  );

  useEffect(
    () =>
      onVisionChange((date, prev, next, update) => {
        void reconcile(date, prev, next, update);
      }),
    [reconcile],
  );

  const value = useMemo<GcalApi>(
    () => ({
      configured: !!CLIENT_ID,
      connected: !!token,
      canExport: !!token && !!settings.gcal.exportCalendarId,
      calendars,
      error,
      version,
      connect: () => {
        if (!clientRef.current) {
          setError('Google の準備中です。数秒後にもう一度押してください。');
          return;
        }
        clientRef.current.requestAccessToken({ prompt: '' });
      },
      disconnect: () => {
        if (token) window.google?.accounts.oauth2.revoke(token.value);
        dropToken();
      },
      refresh: () => setVersion((v) => v + 1),
      clearError: () => setError(null),
      fetchEvents,
      pushDay: (date, vision, update) => {
        const hadIds = vision.filter((b) => b.gcalEventId).map((b) => ({ ...b, gcalSync: true }));
        // Flag every block; the vision listener creates events for those without one.
        update(date, (p) => ({ vision: p.vision.map((b) => ({ ...b, gcalSync: true })) }));
        // Re-send blocks that already had an event, in case they changed while offline.
        void reconcile(date, [], hadIds, update, true);
      },
    }),
    [token, settings.gcal.exportCalendarId, calendars, error, version, fetchEvents, reconcile, dropToken],
  );

  return <GcalContext.Provider value={value}>{children}</GcalContext.Provider>;
}

/** Google Calendar events for the given dates (empty when not connected). */
export function useGcalEvents(dates: string[]): Record<string, ExternalEvent[]> {
  const g = useGcal();
  const settings = useSettings();
  const key = dates.join(',');
  const importKey = settings.gcal.importCalendarIds.join(',') + '|' + settings.gcal.exportCalendarId;
  const [events, setEvents] = useState<{ key: string; data: Record<string, ExternalEvent[]> }>({ key: '', data: {} });
  const fetchRef = useRef(g.fetchEvents);
  fetchRef.current = g.fetchEvents;

  useEffect(() => {
    if (!g.connected || !settings.gcal.importCalendarIds.length) {
      setEvents({ key: '', data: {} });
      return;
    }
    let alive = true;
    const load = () =>
      fetchRef.current(key.split(','))
        .then((data) => alive && setEvents({ key, data }))
        .catch((e) => console.warn(e));
    void load();
    const t = window.setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.connected, key, importKey, g.version]);

  return events.key === key ? events.data : {};
}
