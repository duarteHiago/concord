// Integrações da página do perfil: biblioteca da Steam e músicas mais ouvidas pelo Last.fm.
//
// Steam: a pessoa conecta a conta pelo login oficial da Steam (OpenID 2.0), que confirma de quem é a conta
// sem senha passando por aqui. Os jogos vêm da Web API da Steam (precisa de STEAM_API_KEY e do perfil com
// "detalhes de jogos" públicos).
// Last.fm: a pessoa liga o Spotify ao Last.fm (opção do próprio Last.fm) e põe o usuário dela aqui. As músicas
// vêm da API pública do Last.fm (precisa de LASTFM_API_KEY). O Spotify não serve: a API dele só deixa 5 pessoas.
//
// As respostas ficam 10 min em memória, para visitar um perfil não virar uma chamada lá fora toda vez.
import { randomBytes } from 'node:crypto';
import type { Router } from 'express';
import { config } from './config.ts';
import { get, run, type UserRow } from './db.ts';
import { fail, str, uid } from './http.ts';

const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}
setInterval(() => {
  for (const [k, v] of cache) if (Date.now() - v.at > CACHE_MS) cache.delete(k);
}, CACHE_MS).unref();

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Concord' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const integrationsStatus = () => ({ steam: !!config.steamApiKey && !!config.publicUrl, lastfm: !!config.lastfmApiKey });

// ------------------------------------------------------------------ Steam

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const STEAM_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
/** pedidos de conexão em andamento: state -> quem pediu (vale 10 min) */
const steamStates = new Map<string, { userId: string; at: number }>();

function steamCallbackUrl() {
  return `${config.publicUrl}/api/steam/callback`;
}

function page(ok: boolean, message: string) {
  const color = ok ? '#22c55e' : '#e5484d';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Concord</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#140f19;color:#f3ecf7;font-family:system-ui,sans-serif;text-align:center}
.c{max-width:420px;padding:32px}h1{font-size:24px;margin:16px 0 8px;color:${color}}p{color:#b3a6c2;line-height:1.5}</style></head>
<body><div class="c"><h1>${ok ? 'Steam conectada!' : 'Não deu certo'}</h1><p>${message}</p></div></body></html>`;
}

export interface SteamGame {
  appid: number;
  name: string;
  playtimeMin: number;
  playtime2wMin: number;
}

/** Biblioteca de uma conta da Steam (null = perfil com detalhes de jogos privados). */
async function steamLibrary(steamId: string) {
  return cached(`steam:${steamId}`, async () => {
    const key = encodeURIComponent(config.steamApiKey);
    const [owned, summary] = await Promise.all([
      getJson(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`),
      getJson(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`),
    ]);
    const player = (summary as { response?: { players?: { personaname?: string; avatarfull?: string; profileurl?: string }[] } }).response?.players?.[0];
    const games = (owned as { response?: { games?: { appid: number; name?: string; playtime_forever?: number; playtime_2weeks?: number }[] } }).response?.games;
    return {
      profile: player ? { name: player.personaname ?? '', avatar: player.avatarfull ?? null, url: player.profileurl ?? `https://steamcommunity.com/profiles/${steamId}` } : null,
      games: games
        ? games
            .map((g): SteamGame => ({ appid: g.appid, name: g.name ?? `App ${g.appid}`, playtimeMin: g.playtime_forever ?? 0, playtime2wMin: g.playtime_2weeks ?? 0 }))
            .sort((a, b) => b.playtimeMin - a.playtimeMin)
        : null,
    };
  });
}

// ------------------------------------------------------------------ Last.fm

const LASTFM_USER = /^[A-Za-z][A-Za-z0-9_-]{1,14}$/;
// o Last.fm devolve uma estrela cinza quando não tem a imagem (o que é comum para músicas e artistas)
const lastfmImage = (images: { '#text'?: string; size?: string }[] | undefined) => {
  const url = images?.find((i) => i.size === 'extralarge')?.['#text'] || images?.at(-1)?.['#text'] || '';
  return url && !url.includes('2a96cbd8b46e442fc41c2b86b821562f') ? url : null;
};

function lastfmUrl(method: string, user: string, extra = '') {
  return `https://ws.audioscrobbler.com/2.0/?method=${method}&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(config.lastfmApiKey)}&format=json${extra}`;
}

async function lastfmProfile(user: string) {
  return cached(`lastfm:${user.toLowerCase()}`, async () => {
    type Img = { '#text'?: string; size?: string }[];
    const [tracks, artists, recent] = (await Promise.all([
      getJson(lastfmUrl('user.gettoptracks', user, '&period=1month&limit=8')),
      getJson(lastfmUrl('user.gettopartists', user, '&period=1month&limit=6')),
      getJson(lastfmUrl('user.getrecenttracks', user, '&limit=1')),
    ])) as [
      { toptracks?: { track?: { name: string; playcount: string; url: string; artist: { name: string }; image?: Img }[] } },
      { topartists?: { artist?: { name: string; playcount: string; url: string; image?: Img }[] } },
      { recenttracks?: { track?: { name: string; url: string; artist: { '#text': string }; album?: { '#text': string }; image?: Img; '@attr'?: { nowplaying?: string } }[] } },
    ];
    const last = recent.recenttracks?.track?.[0];
    return {
      user,
      url: `https://www.last.fm/user/${encodeURIComponent(user)}`,
      nowPlaying: last?.['@attr']?.nowplaying === 'true' ? { name: last.name, artist: last.artist['#text'], url: last.url, image: lastfmImage(last.image) } : null,
      // capa do álbum da última música: é a imagem que o Last.fm ainda tem com certeza
      lastCover: last ? lastfmImage(last.image) : null,
      topTracks: (tracks.toptracks?.track ?? []).map((t) => ({ name: t.name, artist: t.artist.name, plays: Number(t.playcount) || 0, url: t.url, image: lastfmImage(t.image) })),
      topArtists: (artists.topartists?.artist ?? []).map((a) => ({ name: a.name, plays: Number(a.playcount) || 0, url: a.url, image: lastfmImage(a.image) })),
    };
  });
}

// ------------------------------------------------------------------ rotas

/** Rotas sem login no Concord: a volta do login da Steam chega pelo navegador, sem o token. */
export function registerPublicIntegrationRoutes(api: Router, hooks: { meUpdated: (userId: string) => void }) {
  api.get('/steam/callback', async (req, res) => {
    const q = req.query as Record<string, string>;
    const state = steamStates.get(String(q.state ?? ''));
    steamStates.delete(String(q.state ?? ''));
    const send = (ok: boolean, msg: string) => res.status(ok ? 200 : 400).type('html').send(page(ok, msg));
    if (!state || Date.now() - state.at > 10 * 60_000) return send(false, 'O pedido para conectar a Steam expirou. Volte ao Concord e tente de novo.');
    // só aceita a volta que a gente mesmo pediu, para o nosso endereço
    if (q['openid.mode'] !== 'id_res' || !String(q['openid.return_to'] ?? '').startsWith(steamCallbackUrl())) {
      return send(false, 'A Steam não confirmou a conta. Tente de novo pelo Concord.');
    }
    const steamId = STEAM_ID.exec(String(q['openid.claimed_id'] ?? ''))?.[1];
    if (!steamId) return send(false, 'A Steam não confirmou a conta. Tente de novo pelo Concord.');
    // confirma direto com a Steam que a resposta é dela (e não montada por alguém)
    const check = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (k.startsWith('openid.')) check.set(k, v);
    check.set('openid.mode', 'check_authentication');
    let valid = false;
    try {
      const r = await fetch(STEAM_OPENID, { method: 'POST', body: check, signal: AbortSignal.timeout(8000) });
      valid = /is_valid\s*:\s*true/.test(await r.text());
    } catch {
      return send(false, 'A Steam não respondeu agora. Tente de novo daqui a pouco.');
    }
    if (!valid) return send(false, 'A Steam não confirmou a conta. Tente de novo pelo Concord.');
    run('UPDATE users SET steam_id = NULL WHERE steam_id = ? AND id != ?', steamId, state.userId); // uma conta da Steam, um perfil
    run('UPDATE users SET steam_id = ? WHERE id = ?', steamId, state.userId);
    hooks.meUpdated(state.userId);
    send(true, 'Pode fechar esta aba e voltar ao Concord: sua biblioteca já aparece no seu perfil.');
  });
}

export function registerIntegrationRoutes(api: Router, hooks: { meUpdated: (userId: string) => void; canSee: (me: string, userId: string) => boolean }) {
  /** Começa a conexão com a Steam: devolve o endereço do login da Steam (aberto no navegador). */
  api.post('/me/steam/link', (_req, res) => {
    if (!integrationsStatus().steam) fail(503, 'A integração com a Steam não está configurada neste servidor.');
    const state = randomBytes(18).toString('base64url');
    for (const [k, v] of steamStates) if (Date.now() - v.at > 10 * 60_000) steamStates.delete(k);
    steamStates.set(state, { userId: uid(res), at: Date.now() });
    const returnTo = `${steamCallbackUrl()}?state=${state}`;
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': config.publicUrl,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });
    res.json({ url: `${STEAM_OPENID}?${params}` });
  });

  api.delete('/me/steam', (_req, res) => {
    run('UPDATE users SET steam_id = NULL WHERE id = ?', uid(res));
    hooks.meUpdated(uid(res));
    res.json({ ok: true });
  });

  api.put('/me/lastfm', async (req, res) => {
    const me = uid(res);
    const raw = req.body?.user;
    if (raw === null || raw === '') {
      run('UPDATE users SET lastfm_user = NULL WHERE id = ?', me);
      hooks.meUpdated(me);
      return res.json({ ok: true });
    }
    if (!integrationsStatus().lastfm) fail(503, 'A integração com o Last.fm não está configurada neste servidor.');
    const user = str(raw, 'usuário do Last.fm', 2, 15).replace(/^@/, '');
    if (!LASTFM_USER.test(user)) fail(400, 'Esse não parece um usuário do Last.fm.');
    // confere que existe (e pega o nome com as maiúsculas certas)
    let realName = user;
    try {
      const info = (await getJson(lastfmUrl('user.getinfo', user))) as { user?: { name?: string }; error?: number };
      if (info.error || !info.user?.name) fail(404, `Não achei o usuário "${user}" no Last.fm.`);
      realName = info.user!.name!;
    } catch (err) {
      if ((err as { status?: number }).status) throw err;
      fail(404, `Não achei o usuário "${user}" no Last.fm.`);
    }
    run('UPDATE users SET lastfm_user = ? WHERE id = ?', realName, me);
    cache.delete(`lastfm:${realName.toLowerCase()}`);
    hooks.meUpdated(me);
    res.json({ ok: true, user: realName });
  });

  api.get('/users/:id/steam', async (req, res) => {
    if (!hooks.canSee(uid(res), req.params.id)) fail(404, 'Perfil não encontrado');
    const u = get<UserRow>('SELECT steam_id FROM users WHERE id = ?', req.params.id);
    if (!u?.steam_id || !integrationsStatus().steam) return res.json({ linked: false });
    try {
      res.json({ linked: true, ...(await steamLibrary(u.steam_id)) });
    } catch {
      fail(502, 'A Steam não respondeu agora. Tente de novo daqui a pouco.');
    }
  });

  api.get('/users/:id/lastfm', async (req, res) => {
    if (!hooks.canSee(uid(res), req.params.id)) fail(404, 'Perfil não encontrado');
    const u = get<UserRow>('SELECT lastfm_user FROM users WHERE id = ?', req.params.id);
    if (!u?.lastfm_user || !integrationsStatus().lastfm) return res.json({ linked: false });
    try {
      res.json({ linked: true, ...(await lastfmProfile(u.lastfm_user)) });
    } catch {
      fail(502, 'O Last.fm não respondeu agora. Tente de novo daqui a pouco.');
    }
  });
}
