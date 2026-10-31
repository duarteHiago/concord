import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { P, has } from '../../shared/permissions.ts';
import { config } from './config.ts';

const rooms = new RoomServiceClient(config.livekit.apiUrl, config.livekit.apiKey, config.livekit.apiSecret);

interface TokenOptions {
  roomName: string;
  identity: string;
  name: string;
  metadata: string;
  perms: number;
  serverMuted: boolean;
  serverDeafened?: boolean;
}

type Grant = Pick<TokenOptions, 'perms' | 'serverMuted' | 'serverDeafened'>;

function voicePermission(o: Grant) {
  const sources: TrackSource[] = [];
  if (has(o.perms, P.SPEAK) && !o.serverMuted) sources.push(TrackSource.MICROPHONE);
  if (has(o.perms, P.STREAM)) sources.push(TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
  return {
    // ensurdecido pelo servidor: o LiveKit não entrega o som de ninguém, mesmo que o app tente
    canSubscribe: !o.serverDeafened,
    canPublish: sources.length > 0,
    canPublishData: true,
    canPublishSources: sources,
  };
}

export async function createVoiceToken(o: TokenOptions): Promise<string> {
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: o.identity,
    name: o.name,
    metadata: o.metadata,
    // só serve para entrar: depois o LiveKit renova sozinho para quem já está na sala. Curto para que um token
    // guardado não sirva de porta de volta para quem foi expulso ou perdeu a permissão da sala.
    ttl: '10m',
  });
  at.addGrant({ room: o.roomName, roomJoin: true, ...voicePermission(o) });
  return at.toJwt();
}

/** Troca as permissões de quem já está na sala (o LiveKit troca todas de uma vez). */
export async function updateVoicePermission(roomName: string, identity: string, o: Grant) {
  try {
    await rooms.updateParticipant(roomName, identity, { permission: voicePermission(o) });
  } catch {
    // participante já saiu ou sala não existe
  }
}

export async function removeFromRoom(roomName: string, identity: string) {
  try {
    await rooms.removeParticipant(roomName, identity);
  } catch {
    // participante já saiu ou sala não existe
  }
}

/** Silencia as faixas publicadas de um participante com as fontes indicadas. */
export async function muteTracks(roomName: string, identity: string, sourcesToMute: TrackSource[]) {
  try {
    const p = await rooms.getParticipant(roomName, identity);
    for (const t of p.tracks) {
      if (sourcesToMute.includes(t.source)) await rooms.mutePublishedTrack(roomName, identity, t.sid, true);
    }
  } catch {
    // ignorado
  }
}

/** Pessoas (não gravações nem agentes) em cada sala do LiveKit agora. */
export async function voiceParticipants(): Promise<{ room: string; identity: string }[]> {
  const out: { room: string; identity: string }[] = [];
  for (const room of await rooms.listRooms()) {
    if (!room.numParticipants) continue;
    for (const p of await rooms.listParticipants(room.name)) {
      if (p.kind === 0) out.push({ room: room.name, identity: p.identity }); // 0 = STANDARD (gente, pelo app)
    }
  }
  return out;
}

export { TrackSource };
