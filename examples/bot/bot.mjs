// Bot de exemplo do Concord: responde !ping, !dado e !ajuda.
// Uso: CONCORD_URL=https://seu-concord.com CONCORD_TOKEN=cb_... node bot.mjs
import { io } from 'socket.io-client';

const URL = process.env.CONCORD_URL;
const TOKEN = process.env.CONCORD_TOKEN;
if (!URL || !TOKEN) {
  console.error('Defina CONCORD_URL e CONCORD_TOKEN (o token aparece em Configurações → Bots).');
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${URL}/api${path}`, {
    method,
    headers: { Authorization: `Bot ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data;
}

const reply = (channelId, content) => api('POST', `/channels/${channelId}/messages`, { content });

const me = await api('GET', '/me');
const socket = io(URL, { auth: { token: TOKEN }, transports: ['websocket'] });

socket.on('connect', () => console.log(`Conectado como ${me.displayName} (@${me.username})`));
socket.on('connect_error', (err) => console.error('Não foi possível conectar:', err.message));

socket.on('message:new', async (msg) => {
  if (msg.author.id === me.id || msg.author.bot) return; // ignora a si mesmo e outros bots
  const text = msg.content.trim();
  try {
    if (text === '!ping') {
      await reply(msg.channelId, 'pong!');
    } else if (text.startsWith('!dado')) {
      const faces = Math.min(1000, Math.max(2, Number(text.split(/\s+/)[1]) || 6));
      const roll = 1 + Math.floor(Math.random() * faces);
      await reply(msg.channelId, `${msg.author.displayName} rolou um d${faces}: ${roll}`);
    } else if (text === '!ajuda') {
      await reply(msg.channelId, 'Comandos: !ping · !dado [lados] · !ajuda');
    }
  } catch (err) {
    console.error('Falha ao responder:', err.message);
  }
});

// alguém mencionou o bot (@usuario_do_bot)
socket.on('mention', async ({ message }) => {
  if (message.author.bot) return;
  await reply(message.channelId, `Oi, ${message.author.displayName}! Digite !ajuda para ver o que eu sei fazer.`).catch(() => {});
});
