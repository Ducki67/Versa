import { makeID, timeAsISO } from "../utils/funcs";
import { sendToAccount } from "../xmpp/server";
import { store } from "../storage/store";

export interface PartyMember {
  accountId: string;
  role: "CAPTAIN" | "MEMBER";
  meta: Record<string, string>;
  joinedAt: string;
  connectionId: string;
}

export interface PartyInvite {
  partyId: string;
  inviterId: string;
  inviteeId: string;
  sentAt: string;
}

export interface PartyPing {
  pingerId: string;
  sentAt: string;
}

export interface Party {
  id: string;
  config: Record<string, unknown>;
  meta: Record<string, unknown>;
  members: PartyMember[];
  invites: PartyInvite[];
  pings: PartyPing[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

const parties = new Map<string, Party>();
const memberParty = new Map<string, string>();

function displayNameOf(accountId: string): string {
  return store.getAccount(accountId)?.displayName || accountId;
}

function notify(memberIds: string[], body: Record<string, unknown>, except?: string) {
  const text = JSON.stringify(body);
  for (const id of memberIds) {
    if (id !== except) sendToAccount(id, text);
  }
}

function memberIds(party: Party): string[] {
  return party.members.map((m) => m.accountId);
}

function bump(party: Party): Party {
  party.revision += 1;
  party.updatedAt = timeAsISO();
  return party;
}

function publicParty(party: Party): Record<string, unknown> {
  return {
    id: party.id,
    config: party.config,
    meta: party.meta,
    members: party.members.map((m) => ({ account_id: m.accountId, account_dn: displayNameOf(m.accountId), role: m.role, meta: m.meta, joined_at: m.joinedAt, connection: { id: m.connectionId, meta: {} } })),
    invites: party.invites,
    revision: party.revision,
    created_at: party.createdAt,
    updated_at: party.updatedAt,
  };
}

export const partyService = {
  getParty(partyId: string): Party | null {
    return parties.get(partyId) || null;
  },

  getUserParties(accountId: string): { current: Record<string, unknown>[]; pending: unknown[]; invites: PartyInvite[]; pings: PartyPing[] } {
    const current: Record<string, unknown>[] = [];
    const invites: PartyInvite[] = [];
    const pings: PartyPing[] = [];
    const partyId = memberParty.get(accountId);
    if (partyId) {
      const party = parties.get(partyId);
      if (party) current.push(publicParty(party));
    }
    for (const party of parties.values()) {
      for (const invite of party.invites) {
        if (invite.inviteeId === accountId) invites.push(invite);
      }
      const inParty = party.members.some((m) => m.accountId === accountId);
      if (inParty) {
        for (const ping of party.pings) pings.push(ping);
      }
    }
    return { current, pending: [], invites, pings };
  },

  createParty(ownerId: string, config: Record<string, unknown>, joinInfo: Record<string, unknown>, meta: Record<string, unknown>): Party {
    const existing = memberParty.get(ownerId);
    if (existing) {
      const old = parties.get(existing);
      if (old) this.leaveParty(existing, ownerId);
    }
    const now = timeAsISO();
    const connection = joinInfo?.connection as Record<string, unknown> | undefined;
    const party: Party = {
      id: makeID().replace(/-/g, "").toUpperCase(),
      config: { joinability: "OPEN", discoverability: "ALL", maxSize: 16, ...(config || {}) },
      meta: meta || {},
      members: [{ accountId: ownerId, role: "CAPTAIN", meta: {}, joinedAt: now, connectionId: String(connection?.id || `${ownerId}@prod`) }],
      invites: [],
      pings: [],
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };
    parties.set(party.id, party);
    memberParty.set(ownerId, party.id);
    return party;
  },

  joinParty(partyId: string, accountId: string, joinInfo: Record<string, unknown>, meta: Record<string, unknown>): Party | null {
    const party = parties.get(partyId);
    if (!party) return null;
    if (party.members.some((m) => m.accountId === accountId)) return party;
    const maxSize = typeof party.config.maxSize === "number" ? (party.config.maxSize as number) : 16;
    if (party.members.length >= maxSize) return null;
    const oldParty = memberParty.get(accountId);
    if (oldParty && oldParty !== partyId) this.leaveParty(oldParty, accountId);
    const connection = joinInfo?.connection as Record<string, unknown> | undefined;
    party.members.push({ accountId, role: "MEMBER", meta: (meta || {}) as Record<string, string>, joinedAt: timeAsISO(), connectionId: String(connection?.id || `${accountId}@prod`) });
    party.invites = party.invites.filter((i) => i.inviteeId !== accountId);
    memberParty.set(accountId, partyId);
    bump(party);
    notify(memberIds(party), { type: "com.epicgames.party.memberjoined", partyId, memberId: accountId }, accountId);
    notify(memberIds(party), { type: "com.epicgames.party.partyupdated", partyId, revision: party.revision, party: publicParty(party) });
    return party;
  },

  leaveParty(partyId: string, accountId: string): boolean {
    const party = parties.get(partyId);
    if (!party) return false;
    if (!party.members.some((m) => m.accountId === accountId)) return false;
    party.members = party.members.filter((m) => m.accountId !== accountId);
    memberParty.delete(accountId);
    if (party.members.length === 0) {
      parties.delete(partyId);
      return true;
    }
    const captain = party.members.find((m) => m.role === "CAPTAIN");
    if (!captain && party.members[0]) {
      (party.members[0] as PartyMember).role = "CAPTAIN";
      notify(memberIds(party), { type: "com.epicgames.party.member.newcaptain", partyId, memberId: (party.members[0] as PartyMember).accountId });
    }
    bump(party);
    notify(memberIds(party), { type: "com.epicgames.party.memberleft", partyId, memberId: accountId });
    notify(memberIds(party), { type: "com.epicgames.party.partyupdated", partyId, revision: party.revision, party: publicParty(party) });
    return true;
  },

  patchParty(partyId: string, config: Record<string, unknown>, metaUpdate: Record<string, unknown>, metaDelete: string[]): Party | null {
    const party = parties.get(partyId);
    if (!party) return null;
    if (config) party.config = { ...party.config, ...config };
    if (metaUpdate) party.meta = { ...party.meta, ...metaUpdate };
    if (metaDelete) {
      for (const key of metaDelete) delete party.meta[key];
    }
    bump(party);
    notify(memberIds(party), { type: "com.epicgames.party.partyupdated", partyId, revision: party.revision, party: publicParty(party) });
    return party;
  },

  patchMember(partyId: string, accountId: string, metaUpdate: Record<string, unknown>, metaDelete: string[]): PartyMember | null {
    const party = parties.get(partyId);
    const member = party?.members.find((m) => m.accountId === accountId);
    if (!party || !member) return null;
    if (metaUpdate) member.meta = { ...member.meta, ...(metaUpdate as Record<string, string>) };
    if (metaDelete) {
      for (const key of metaDelete) delete member.meta[key];
    }
    bump(party);
    notify(memberIds(party), { type: "com.epicgames.party.member.stateupdated", partyId, memberId: accountId, meta: member.meta });
    return member;
  },

  promoteMember(partyId: string, accountId: string): boolean {
    const party = parties.get(partyId);
    const member = party?.members.find((m) => m.accountId === accountId);
    if (!party || !member) return false;
    for (const m of party.members) m.role = "MEMBER";
    member.role = "CAPTAIN";
    bump(party);
    notify(memberIds(party), { type: "com.epicgames.party.member.newcaptain", partyId, memberId: accountId });
    return true;
  },

  invite(partyId: string, inviterId: string, inviteeId: string, sendPing: boolean): PartyInvite | null {
    const party = parties.get(partyId);
    if (!party) return null;
    const invite: PartyInvite = { partyId, inviterId, inviteeId, sentAt: timeAsISO() };
    party.invites = party.invites.filter((i) => i.inviteeId !== inviteeId);
    party.invites.push(invite);
    sendToAccount(inviteeId, JSON.stringify({ type: "com.epicgames.party.invitation", partyId, inviterId, inviterDn: displayNameOf(inviterId), inviteeId, membersCount: party.members.length, expires: new Date(Date.now() + 3600000).toISOString() }));
    if (sendPing) {
      party.pings.push({ pingerId: inviterId, sentAt: timeAsISO() });
      sendToAccount(inviteeId, JSON.stringify({ type: "com.epicgames.party.ping", partyId, pingerId: inviterId }));
    }
    return invite;
  },

  declineInvite(partyId: string, inviteeId: string): boolean {
    const party = parties.get(partyId);
    if (!party) return false;
    const before = party.invites.length;
    party.invites = party.invites.filter((i) => i.inviteeId !== inviteeId);
    if (party.invites.length !== before) {
      notify(memberIds(party), { type: "com.epicgames.party.invite.cancelled", partyId, inviteeId });
      return true;
    }
    return false;
  },

  ping(partyId: string, pingerId: string): boolean {
    const party = parties.get(partyId);
    if (!party) return false;
    party.pings.push({ pingerId, sentAt: timeAsISO() });
    notify(memberIds(party), { type: "com.epicgames.party.ping", partyId, pingerId }, pingerId);
    return true;
  },

  deletePing(partyId: string, pingerId: string): boolean {
    const party = parties.get(partyId);
    if (!party) return false;
    const before = party.pings.length;
    party.pings = party.pings.filter((p) => p.pingerId !== pingerId);
    return party.pings.length !== before;
  },

  intention(partyId: string, senderId: string, memberId: string): boolean {
    const party = parties.get(partyId);
    if (!party) return false;
    sendToAccount(memberId, JSON.stringify({ type: "com.epicgames.party.initialintention", partyId, senderId }));
    return true;
  },

  deleteParty(partyId: string): boolean {
    const party = parties.get(partyId);
    if (!party) return false;
    for (const m of party.members) memberParty.delete(m.accountId);
    parties.delete(partyId);
    return true;
  },

  toPublic(party: Party): Record<string, unknown> {
    return publicParty(party);
  },
};
