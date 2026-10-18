import type { Overwrite } from '../../../shared/permissions.ts';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
}

export interface ServerSummary {
  id: string;
  name: string;
  ownerId: string;
  iconColor: string;
}

export interface Role {
  id: string;
  name: string;
  color: string | null;
  permissions: number;
  position: number;
  isDefault: boolean;
  hoist: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  topic: string;
  position: number;
  userLimit: number;
  overwrites: Overwrite[];
  permissions: number;
}

export interface Member extends User {
  joinedAt: number;
  roleIds: string[];
}

export interface VoiceState {
  userId: string;
  serverId: string;
  channelId: string;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
  camera: boolean;
  serverMuted: boolean;
}

export interface ServerDetail {
  server: ServerSummary;
  permissions: number;
  highestPosition: number;
  roles: Role[];
  channels: Channel[];
  members: Member[];
  voiceStates: VoiceState[];
  online: string[];
}

export interface Message {
  id: string;
  channelId: string;
  content: string;
  createdAt: number;
  editedAt: number | null;
  author: User;
}

export interface Invite {
  code: string;
  serverId: string;
  creatorId: string;
  creatorName?: string;
  uses: number;
  maxUses: number;
  expiresAt: number | null;
  createdAt: number;
}

export interface InvitePreview {
  code: string;
  server: ServerSummary;
  memberCount: number;
  alreadyMember: boolean;
}
