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
}

export async function createVoiceToken(o: TokenOptions): Promise<string> {
  const sources: TrackSource[] = [];
  if (has(o.perms, P.SPEAK) && !o.serverMuted) sources.push(TrackSource.MICROPHONE);
  if (has(o.perms, P.STREAM)) sources.push(TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);

  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: o.identity,
    name: o.name,
    metadata: o.metadata,
    ttl: '6h',
  });
  at.addGrant({
    room: o.roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: sources.length > 0,
    canPublishData: true,
    canPublishSources: sources,
  });
  return at.toJwt();
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

export { TrackSource };
