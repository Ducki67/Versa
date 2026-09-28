import crypto from "crypto";
import fs from "fs";
import path from "path";
import { store } from "../storage/store";

interface Relation {
  createdAt: string;
}

type RelationMap = Record<string, Relation>;

interface SocialUser {
  friends: RelationMap;
  incoming: RelationMap;
  outgoing: RelationMap;
  blocked: RelationMap;
}

interface SocialState {
  schemaVersion: 1;
  users: Record<string, SocialUser>;
}

export interface SocialFriend {
  accountId: string;
  status: "ACCEPTED" | "PENDING" | "BLOCKED";
  direction: "INBOUND" | "OUTBOUND";
  created: string;
  favorite: boolean;
  alias: string;
  note: string;
  groups: string[];
}

export interface SocialSummary {
  friends: SocialFriend[];
  incoming: SocialFriend[];
  outgoing: SocialFriend[];
  requests: SocialFriend[];
  suggested: SocialFriend[];
  blocklist: SocialFriend[];
  settings: {
    acceptFriendRequests: boolean;
    acceptInvites: "public";
  };
}

export type SocialAction =
  | "requested"
  | "accepted"
  | "already_friends"
  | "rejected"
  | "removed"
  | "blocked"
  | "already_blocked"
  | "unblocked";

export type SocialFailure =
  | "account_missing"
  | "self_relation"
  | "blocked"
  | "request_missing"
  | "friend_missing"
  | "block_missing";

export type SocialResult =
  | { ok: true; action: SocialAction }
  | { ok: false; reason: SocialFailure };

interface Mutation<T> {
  value: T;
  changed: boolean;
}

const DATA_DIR = path.join(import.meta.dir, "../../data");
const SOCIAL_FILE = path.join(DATA_DIR, "social.json");
let mutationTail: Promise<void> = Promise.resolve();

function emptyMap(): RelationMap {
  return Object.create(null) as RelationMap;
}

function emptyUser(): SocialUser {
  return {
    friends: emptyMap(),
    incoming: emptyMap(),
    outgoing: emptyMap(),
    blocked: emptyMap(),
  };
}

function emptyState(): SocialState {
  return { schemaVersion: 1, users: Object.create(null) as Record<string, SocialUser> };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeAccountId(accountId: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(accountId);
}

function normalizeMap(value: unknown): RelationMap {
  const relations = emptyMap();
  if (!isRecord(value)) return relations;

  for (const [accountId, rawRelation] of Object.entries(value)) {
    if (!isSafeAccountId(accountId)) continue;
    const createdAt = isRecord(rawRelation) && typeof rawRelation.createdAt === "string"
      ? rawRelation.createdAt
      : new Date(0).toISOString();
    relations[accountId] = { createdAt };
  }

  return relations;
}

function normalizeUser(value: unknown): SocialUser {
  if (!isRecord(value)) return emptyUser();
  return {
    friends: normalizeMap(value.friends),
    incoming: normalizeMap(value.incoming),
    outgoing: normalizeMap(value.outgoing),
    blocked: normalizeMap(value.blocked),
  };
}

function readState(): SocialState {
  try {
    if (!fs.existsSync(SOCIAL_FILE)) return emptyState();
    const raw = JSON.parse(fs.readFileSync(SOCIAL_FILE, "utf-8")) as unknown;
    if (!isRecord(raw) || !isRecord(raw.users)) return emptyState();

    const state = emptyState();
    for (const [accountId, value] of Object.entries(raw.users)) {
      if (isSafeAccountId(accountId)) state.users[accountId] = normalizeUser(value);
    }
    return state;
  } catch {
    return emptyState();
  }
}

function writeState(state: SocialState) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = path.join(DATA_DIR, `.social-${process.pid}-${crypto.randomUUID()}.tmp`);

  try {
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), "utf-8");
    fs.renameSync(tempFile, SOCIAL_FILE);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
}

function userFor(state: SocialState, accountId: string): SocialUser {
  const current = state.users[accountId];
  if (current) return current;
  const user = emptyUser();
  state.users[accountId] = user;
  return user;
}

function relation(createdAt = new Date().toISOString()): Relation {
  return { createdAt };
}

function clearPending(left: SocialUser, leftId: string, right: SocialUser, rightId: string) {
  delete left.incoming[rightId];
  delete left.outgoing[rightId];
  delete right.incoming[leftId];
  delete right.outgoing[leftId];
}

function clearRelationship(left: SocialUser, leftId: string, right: SocialUser, rightId: string) {
  delete left.friends[rightId];
  delete right.friends[leftId];
  clearPending(left, leftId, right, rightId);
}

function isKnownAccount(accountId: string): boolean {
  return isSafeAccountId(accountId) && store.getAccount(accountId) !== null;
}

function validatePair(accountId: string, otherAccountId: string): SocialResult | null {
  if (accountId === otherAccountId) return { ok: false, reason: "self_relation" };
  if (!isKnownAccount(accountId) || !isKnownAccount(otherAccountId)) {
    return { ok: false, reason: "account_missing" };
  }
  return null;
}

function success(action: SocialAction): SocialResult {
  return { ok: true, action };
}

function failure(reason: SocialFailure): SocialResult {
  return { ok: false, reason };
}

function enqueueMutation<T>(operation: (state: SocialState) => Mutation<T>): Promise<T> {
  const run = mutationTail.then(() => {
    const state = readState();
    const mutation = operation(state);
    if (mutation.changed) writeState(state);
    return mutation.value;
  });

  mutationTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readAfterMutations<T>(selector: (state: SocialState) => T): Promise<T> {
  await mutationTail;
  return selector(readState());
}

function friendEntry(
  accountId: string,
  value: Relation,
  status: SocialFriend["status"],
  direction: SocialFriend["direction"]
): SocialFriend {
  return {
    accountId,
    status,
    direction,
    created: value.createdAt,
    favorite: false,
    alias: "",
    note: "",
    groups: [],
  };
}

function entries(
  values: RelationMap,
  status: SocialFriend["status"],
  direction: SocialFriend["direction"]
): SocialFriend[] {
  return Object.entries(values)
    .filter(([accountId]) => isKnownAccount(accountId))
    .map(([accountId, value]) => friendEntry(accountId, value, status, direction))
    .sort((left, right) => left.created.localeCompare(right.created) || left.accountId.localeCompare(right.accountId));
}

export const social = {
  hasAccount(accountId: string): boolean {
    return isKnownAccount(accountId);
  },

  async getSummary(accountId: string): Promise<SocialSummary | null> {
    if (!isKnownAccount(accountId)) return null;

    return readAfterMutations((state) => {
      const user = state.users[accountId] ?? emptyUser();
      const friends = entries(user.friends, "ACCEPTED", "OUTBOUND");
      const incoming = entries(user.incoming, "PENDING", "INBOUND");
      const outgoing = entries(user.outgoing, "PENDING", "OUTBOUND");
      const blocklist = entries(user.blocked, "BLOCKED", "OUTBOUND");

      return {
        friends,
        incoming,
        outgoing,
        requests: incoming,
        suggested: [],
        blocklist,
        settings: {
          acceptFriendRequests: true,
          acceptInvites: "public",
        },
      };
    });
  },

  async getFriends(accountId: string): Promise<SocialFriend[] | null> {
    const summary = await this.getSummary(accountId);
    return summary?.friends ?? null;
  },

  async getBlocklist(accountId: string): Promise<SocialFriend[] | null> {
    const summary = await this.getSummary(accountId);
    return summary?.blocklist ?? null;
  },

  async requestFriend(accountId: string, friendId: string): Promise<SocialResult> {
    return enqueueMutation((state) => {
      const invalid = validatePair(accountId, friendId);
      if (invalid) return { value: invalid, changed: false };

      const user = userFor(state, accountId);
      const friend = userFor(state, friendId);
      if (user.blocked[friendId] || friend.blocked[accountId]) {
        return { value: failure("blocked"), changed: false };
      }
      if (user.friends[friendId] || friend.friends[accountId]) {
        return { value: success("already_friends"), changed: false };
      }

      const reverseRequest = user.incoming[friendId] ?? friend.outgoing[accountId];
      if (reverseRequest) {
        clearRelationship(user, accountId, friend, friendId);
        const createdAt = reverseRequest.createdAt;
        user.friends[friendId] = relation(createdAt);
        friend.friends[accountId] = relation(createdAt);
        return { value: success("accepted"), changed: true };
      }

      const createdAt = new Date().toISOString();
      user.outgoing[friendId] = relation(createdAt);
      friend.incoming[accountId] = relation(createdAt);
      return { value: success("requested"), changed: true };
    });
  },

  async acceptFriend(accountId: string, friendId: string): Promise<SocialResult> {
    return enqueueMutation((state) => {
      const invalid = validatePair(accountId, friendId);
      if (invalid) return { value: invalid, changed: false };

      const user = userFor(state, accountId);
      const friend = userFor(state, friendId);
      if (user.blocked[friendId] || friend.blocked[accountId]) {
        return { value: failure("blocked"), changed: false };
      }

      const request = user.incoming[friendId] ?? friend.outgoing[accountId];
      if (!request) return { value: failure("request_missing"), changed: false };

      clearRelationship(user, accountId, friend, friendId);
      user.friends[friendId] = relation(request.createdAt);
      friend.friends[accountId] = relation(request.createdAt);
      return { value: success("accepted"), changed: true };
    });
  },

  async rejectFriend(accountId: string, friendId: string): Promise<SocialResult> {
    return enqueueMutation((state) => {
      const invalid = validatePair(accountId, friendId);
      if (invalid) return { value: invalid, changed: false };

      const user = userFor(state, accountId);
      const friend = userFor(state, friendId);
      if (!user.incoming[friendId] && !friend.outgoing[accountId]) {
        return { value: failure("request_missing"), changed: false };
      }

      clearPending(user, accountId, friend, friendId);
      return { value: success("rejected"), changed: true };
    });
  },

  async removeFriend(accountId: string, friendId: string): Promise<SocialResult> {
    return enqueueMutation((state) => {
      const invalid = validatePair(accountId, friendId);
      if (invalid) return { value: invalid, changed: false };

      const user = userFor(state, accountId);
      const friend = userFor(state, friendId);
      if (!user.friends[friendId] && !friend.friends[accountId]) {
        return { value: failure("friend_missing"), changed: false };
      }

      clearRelationship(user, accountId, friend, friendId);
      return { value: success("removed"), changed: true };
    });
  },

  async blockFriend(accountId: string, friendId: string): Promise<SocialResult> {
    return enqueueMutation((state) => {
      const invalid = validatePair(accountId, friendId);
      if (invalid) return { value: invalid, changed: false };

      const user = userFor(state, accountId);
      const friend = userFor(state, friendId);
      const alreadyBlocked = Boolean(user.blocked[friendId]);
      const hadRelationship = Boolean(
        user.friends[friendId] ||
        friend.friends[accountId] ||
        user.incoming[friendId] ||
        user.outgoing[friendId] ||
        friend.incoming[accountId] ||
        friend.outgoing[accountId]
      );

      clearRelationship(user, accountId, friend, friendId);
      if (!alreadyBlocked) user.blocked[friendId] = relation();
      return {
        value: success(alreadyBlocked ? "already_blocked" : "blocked"),
        changed: !alreadyBlocked || hadRelationship,
      };
    });
  },

  async unblockFriend(accountId: string, friendId: string): Promise<SocialResult> {
    return enqueueMutation((state) => {
      const invalid = validatePair(accountId, friendId);
      if (invalid) return { value: invalid, changed: false };

      const user = userFor(state, accountId);
      if (!user.blocked[friendId]) return { value: failure("block_missing"), changed: false };

      delete user.blocked[friendId];
      return { value: success("unblocked"), changed: true };
    });
  },
};
