/**
 * Spotify for the break music.
 *
 * Authorization Code with PKCE, so no client secret is needed in the browser.
 * Playback goes through the Web Playback SDK (this tab becomes a Spotify device)
 * or through any other device the user has open, via the Connect endpoints.
 *
 * Playback needs Spotify Premium, and in Development Mode the account has to be
 * on the app's allowlist. See SETUP.md.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? '';
const API = 'https://api.spotify.com/v1';
const AUTH = 'https://accounts.spotify.com';
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

const STORE_KEY = 'planner:spotify-refresh';
const VERIFIER_KEY = 'planner:spotify-verifier';
const STATE_KEY = 'planner:spotify-state';
const RETURN_KEY = 'planner:spotify-return';

/** Spotify drops the fragment on redirect, so the registered URI is the app root. */
const redirectUri = () => window.location.origin + import.meta.env.BASE_URL;

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  owner: string;
  image?: string;
}

export interface PlayOptions {
  contextUri: string;
  deviceId?: string;
  shuffle: boolean;
  volume: number; // 0..1
}

export interface SpotifyApi {
  configured: boolean;
  connected: boolean;
  /** Set when the account cannot stream (free plan, or a mobile-only plan). */
  planWarning: string | null;
  profile: { name: string; product: string } | null;
  devices: SpotifyDevice[];
  playlists: SpotifyPlaylist[];
  /** Device id of this tab once the Web Playback SDK is ready. */
  webDeviceId: string | null;
  error: string | null;
  connect(): void;
  disconnect(): void;
  clearError(): void;
  refreshDevices(): Promise<void>;
  loadPlaylists(): Promise<void>;
  /** Call from a user gesture: makes this tab available as a playback device. */
  prepare(): Promise<void>;
  play(o: PlayOptions): Promise<void>;
  pause(): Promise<void>;
  /** Skip forward / back a track on the device playing the break music. */
  next(deviceId?: string): Promise<void>;
  previous(deviceId?: string): Promise<void>;
}

const SpotifyContext = createContext<SpotifyApi | null>(null);

export function useSpotify(): SpotifyApi {
  const v = useContext(SpotifyContext);
  if (!v) throw new Error('SpotifyProvider missing');
  return v;
}

// ---------------------------------------------------------------- PKCE

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const randomString = () => b64url(crypto.getRandomValues(new Uint8Array(48)).buffer);

const challenge = async (verifier: string) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));

// ---------------------------------------------------------------- Web Playback SDK

/** The few fields we read out of the SDK's event payloads. */
interface PlayerEvent {
  device_id: string;
  message: string;
}

interface WebPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (payload: PlayerEvent) => void): boolean;
  setVolume(v: number): Promise<void>;
}

declare global {
  interface Window {
    Spotify?: {
      Player: new (o: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => WebPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  sdkPromise ??= new Promise<void>((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error('Spotify のプレイヤーを読み込めませんでした'));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// ---------------------------------------------------------------- provider

class SpotifyError extends Error {
  constructor(
    public status: number,
    public reason: string,
    msg: string,
  ) {
    super(msg);
  }
}

const messageFor = (e: unknown): string => {
  if (!(e instanceof SpotifyError)) return (e as Error).message;
  if (e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE')
    return '再生先が見つかりません。Spotify アプリを開くか、設定で再生先を「このタブ」にしてください。';
  if (e.status === 403 && e.reason === 'PREMIUM_REQUIRED')
    return 'Spotify Premium が必要です（モバイル専用プランでは再生できません）。';
  if (e.status === 403) return `Spotify が再生を拒否しました: ${e.message}`;
  if (e.reason === 'QUOTA_EXCEEDED') return 'Spotify API の利用上限に達しました。しばらく待ってからお試しください。';
  if (e.status === 429) return 'Spotify へのリクエストが多すぎます。少し待ってからお試しください。';
  return `Spotify のエラー: ${e.message}`;
};

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(() => !!localStorage.getItem(STORE_KEY));
  const [profile, setProfile] = useState<SpotifyApi['profile']>(null);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [webDeviceId, setWebDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const access = useRef<{ value: string; exp: number } | null>(null);
  const player = useRef<WebPlayer | null>(null);
  const webDeviceIdRef = useRef<string | null>(null);
  webDeviceIdRef.current = webDeviceId;
  /** Resolves when the SDK reports this tab as a device. */
  const ready = useRef<{ promise: Promise<string | null>; resolve: (id: string | null) => void } | null>(null);

  const deviceReady = useCallback(() => {
    ready.current ??= (() => {
      let resolve!: (id: string | null) => void;
      const promise = new Promise<string | null>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    })();
    return ready.current.promise;
  }, []);

  /** The device to aim playback at, waiting for this tab to come up if need be. */
  const waitForDevice = useCallback(
    async (deviceId: string): Promise<string | null> => {
      if (deviceId) return deviceId;
      if (webDeviceIdRef.current) return webDeviceIdRef.current;
      const id = await Promise.race([
        deviceReady(),
        new Promise<null>((r) => window.setTimeout(() => r(null), 10_000)),
      ]);
      return id ?? webDeviceIdRef.current;
    },
    [deviceReady],
  );

  const forget = useCallback(() => {
    localStorage.removeItem(STORE_KEY);
    access.current = null;
    player.current?.disconnect();
    player.current = null;
    setConnected(false);
    setProfile(null);
    setDevices([]);
    setPlaylists([]);
    setWebDeviceId(null);
  }, []);

  const exchange = useCallback(
    async (body: Record<string, string>) => {
      const res = await fetch(`${AUTH}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
      });
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };
      if (!res.ok || !json.access_token) {
        throw new Error(json.error_description ?? json.error ?? `トークンの取得に失敗しました (${res.status})`);
      }
      access.current = { value: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
      // Spotify rotates the refresh token, and it expires 6 months after the first grant.
      if (json.refresh_token) localStorage.setItem(STORE_KEY, json.refresh_token);
      setConnected(true);
      return access.current.value;
    },
    [],
  );

  /** A valid access token, refreshed when it is about to expire. */
  const token = useCallback(async (): Promise<string> => {
    const cur = access.current;
    if (cur && cur.exp > Date.now() + 60_000) return cur.value;
    const refresh = localStorage.getItem(STORE_KEY);
    if (!refresh) throw new Error('Spotify に未接続です');
    try {
      return await exchange({ grant_type: 'refresh_token', refresh_token: refresh });
    } catch (e) {
      forget();
      throw new Error(`Spotify の接続が切れました。再接続してください（${(e as Error).message}）`);
    }
  }, [exchange, forget]);

  const api = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const t = await token();
      const res = await fetch(`${API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      });
      if (res.status === 204 || res.status === 202) return null as T;
      const text = await res.text();
      if (!res.ok) {
        let reason = '';
        let msg = text;
        try {
          const j = JSON.parse(text) as { error?: { message?: string; reason?: string } };
          reason = j.error?.reason ?? '';
          msg = j.error?.message ?? text;
        } catch {
          /* not JSON */
        }
        throw new SpotifyError(res.status, reason, msg || `${res.status}`);
      }
      return (text ? JSON.parse(text) : null) as T;
    },
    [token],
  );

  // Finish the redirect, or pick up an existing session.
  useEffect(() => {
    if (!CLIENT_ID) return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const authError = url.searchParams.get('error');

    const cleanUrl = () => {
      const back = sessionStorage.getItem(RETURN_KEY) ?? window.location.hash;
      sessionStorage.removeItem(RETURN_KEY);
      window.history.replaceState({}, '', redirectUri() + back);
    };

    if (authError) {
      setError(`Spotify に接続できませんでした: ${authError}`);
      cleanUrl();
      return;
    }
    if (code) {
      const verifier = sessionStorage.getItem(VERIFIER_KEY);
      const expected = sessionStorage.getItem(STATE_KEY);
      sessionStorage.removeItem(VERIFIER_KEY);
      sessionStorage.removeItem(STATE_KEY);
      cleanUrl();
      if (!verifier || state !== expected) {
        setError('Spotify の認証を確認できませんでした。もう一度お試しください。');
        return;
      }
      void exchange({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        code_verifier: verifier,
      }).catch((e: Error) => setError(e.message));
    }
  }, [exchange]);

  // Who is connected, and can they stream?
  useEffect(() => {
    if (!connected) return;
    api<{ display_name: string; product: string }>('/me')
      .then((me) => setProfile({ name: me.display_name, product: me.product }))
      .catch((e: Error) => setError(messageFor(e)));
  }, [connected, api]);

  const refreshDevices = useCallback(async () => {
    try {
      const r = await api<{ devices: { id: string; name: string; type: string; is_active: boolean }[] }>('/me/player/devices');
      setDevices(r.devices.map((d) => ({ id: d.id, name: d.name, type: d.type, isActive: d.is_active })));
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api]);

  const loadPlaylists = useCallback(async () => {
    try {
      const r = await api<{
        items: { id: string; name: string; uri: string; owner: { display_name?: string }; images: { url: string }[] }[];
      }>('/me/playlists?limit=50');
      setPlaylists(
        r.items.map((p) => ({
          id: p.id,
          name: p.name,
          uri: p.uri,
          owner: p.owner.display_name ?? '',
          image: p.images?.[0]?.url,
        })),
      );
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api]);

  const prepare = useCallback(async () => {
    if (!connected) return;
    if (player.current) {
      // Already connecting or connected: just make sure the device has come up.
      if (!webDeviceIdRef.current) await waitForDevice('');
      return;
    }
    try {
      await loadSdk();
      const p = new window.Spotify!.Player({
        name: 'Daily Planner',
        getOAuthToken: (cb) => void token().then(cb).catch(() => undefined),
        volume: 0.6,
      });
      p.addListener('ready', (e) => {
        setWebDeviceId(e.device_id);
        webDeviceIdRef.current = e.device_id;
        deviceReady();
        ready.current?.resolve(e.device_id);
      });
      p.addListener('not_ready', () => setWebDeviceId(null));
      p.addListener('authentication_error', (e) => setError(`Spotify の認証に失敗しました: ${e.message}`));
      p.addListener('account_error', () =>
        setError('この Spotify アカウントではブラウザ再生ができません（Premium が必要です）。'),
      );
      p.addListener('playback_error', (e) => setError(`Spotify の再生エラー: ${e.message}`));
      player.current = p;
      await p.connect();
      // connect() resolves before the device registers, so wait for 'ready' too:
      // a play() right after this would otherwise have no device to aim at.
      await waitForDevice('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [connected, token, waitForDevice, deviceReady]);

  const play = useCallback(
    async ({ contextUri, deviceId, shuffle, volume }: PlayOptions) => {
      if (!localStorage.getItem(STORE_KEY)) {
        setError('Spotify に接続されていません。設定 > Spotify から接続してください。');
        return;
      }
      if (!contextUri) {
        setError('休憩中に流すプレイリストが選ばれていません。設定 > Spotify で選んでください。');
        return;
      }
      const target = (await waitForDevice(deviceId ?? '')) ?? '';
      if (!target) {
        setError(
          'Spotify の再生先が見つかりません。設定 > Spotify で「再生先を更新」を押すか、スマホなどで Spotify アプリを開いてください。',
        );
        return;
      }
      const q = `?device_id=${encodeURIComponent(target)}`;
      try {
        // Start playing first; shuffle and volume are best-effort extras that
        // some devices reject, and they must not stop the music from starting.
        await api(`/me/player/play${q}`, { method: 'PUT', body: JSON.stringify({ context_uri: contextUri }) });
        setError(null);
        await api(`/me/player/shuffle?state=${shuffle}&device_id=${encodeURIComponent(target)}`, {
          method: 'PUT',
        }).catch(() => undefined);
        await api(`/me/player/volume?volume_percent=${Math.round(volume * 100)}&device_id=${encodeURIComponent(target)}`, {
          method: 'PUT',
        }).catch(() => undefined);
      } catch (e) {
        setError(messageFor(e));
      }
    },
    [api, waitForDevice],
  );

  /** Track skipping. Spotify answers 403 when there is nothing to skip to. */
  const skipTrack = useCallback(
    async (direction: 'next' | 'previous', deviceId?: string) => {
      if (!localStorage.getItem(STORE_KEY)) {
        setError('Spotify に接続されていません。設定 > Spotify から接続してください。');
        return;
      }
      const target = deviceId || webDeviceIdRef.current || '';
      const q = target ? `?device_id=${encodeURIComponent(target)}` : '';
      try {
        await api(`/me/player/${direction}${q}`, { method: 'POST' });
        setError(null);
      } catch (e) {
        if (e instanceof SpotifyError && e.status === 403) {
          setError(direction === 'next' ? 'これ以上次の曲がありません。' : 'これ以上前の曲がありません。');
          return;
        }
        setError(messageFor(e));
      }
    },
    [api],
  );

  const pause = useCallback(async () => {
    try {
      await api('/me/player/pause', { method: 'PUT' });
    } catch (e) {
      // Nothing playing is the normal case here, not something to report.
      if (e instanceof SpotifyError && (e.status === 403 || e.status === 404)) return;
      setError(messageFor(e));
    }
  }, [api]);

  const connect = useCallback(() => {
    void (async () => {
      const verifier = randomString();
      const state = randomString();
      sessionStorage.setItem(VERIFIER_KEY, verifier);
      sessionStorage.setItem(STATE_KEY, state);
      sessionStorage.setItem(RETURN_KEY, window.location.hash);
      const q = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri(),
        scope: SCOPES,
        state,
        code_challenge_method: 'S256',
        code_challenge: await challenge(verifier),
      });
      window.location.assign(`${AUTH}/authorize?${q}`);
    })();
  }, []);

  const value = useMemo<SpotifyApi>(
    () => ({
      configured: !!CLIENT_ID,
      connected,
      planWarning:
        profile && profile.product !== 'premium'
          ? 'この Spotify アカウントは Premium ではないため、再生できません。'
          : null,
      profile,
      devices,
      playlists,
      webDeviceId,
      error,
      connect,
      disconnect: forget,
      clearError: () => setError(null),
      refreshDevices,
      loadPlaylists,
      prepare,
      play,
      pause,
      next: (deviceId) => skipTrack('next', deviceId),
      previous: (deviceId) => skipTrack('previous', deviceId),
    }),
    [connected, profile, devices, playlists, webDeviceId, error, connect, forget, refreshDevices, loadPlaylists, prepare, play, pause, skipTrack],
  );

  return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>;
}

/** Accepts a playlist/album link or URI and returns a context URI Spotify understands. */
export function toContextUri(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^spotify:(playlist|album|artist):[A-Za-z0-9]+$/.test(s)) return s;
  const m = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|artist)\/([A-Za-z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}
