import crypto from "crypto";
import type { Context, Next } from "hono";
import jwt from "jsonwebtoken";
import { store, type AccountData, type TokenData } from "../storage/store";
import { errorResponse } from "../utils/error";

const signingSecret = process.env.JWT_SECRET?.trim() || crypto.randomBytes(32).toString("hex");

export interface TokenClaims {
  sub: string;
  clid: string;
  am: string;
  dvid: string;
  dn: string;
  app: string;
  sec: string;
  t: "s" | "r";
  creation_date: string;
  hours_expire: number;
  jti: string;
  iat?: number;
  exp?: number;
}

export interface ActiveToken {
  claims: TokenClaims;
  record: TokenData;
  account: AccountData | null;
  isUserToken: boolean;
}

function isTokenClaims(value: unknown): value is TokenClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  return typeof claims.sub === "string" && typeof claims.clid === "string" && typeof claims.am === "string" && typeof claims.dvid === "string" && typeof claims.dn === "string" && (claims.t === "s" || claims.t === "r");
}

function isExpired(timestamp: string): boolean {
  const time = Date.parse(timestamp);
  return Number.isNaN(time) || time <= Date.now();
}

function isUserGrant(authMethod: string): boolean {
  return authMethod !== "client_credentials";
}

export function createToken(
  accountId: string,
  clientId: string,
  deviceId: string,
  authMethod: string,
  displayName: string,
  tokenType: "s" | "r",
  hoursExpire: number
): string {
  const payload: TokenClaims = {
    sub: accountId,
    clid: clientId,
    am: authMethod,
    dvid: deviceId,
    dn: displayName,
    app: "fortnite",
    sec: "fortnite",
    t: tokenType,
    creation_date: new Date().toISOString(),
    hours_expire: hoursExpire,
    jti: crypto.randomUUID(),
  };
  return jwt.sign(payload, signingSecret, { expiresIn: `${hoursExpire}h` });
}

export function decodeToken(token: string): TokenClaims | null {
  try {
    const claims = jwt.verify(token, signingSecret);
    return isTokenClaims(claims) ? claims : null;
  } catch {
    return null;
  }
}

export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, value, ...rest] = authorization.trim().split(/\s+/);
  if (rest.length || scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value.startsWith("eg1~") ? value.slice(4) : value;
}

export function authenticateToken(token: string, expectedType?: "access" | "refresh"): ActiveToken | null {
  const claims = decodeToken(token);
  const record = store.getToken(token);
  if (!claims || !record || isExpired(record.expiresAt)) {
    if (record && isExpired(record.expiresAt)) store.deleteToken(token);
    return null;
  }
  const expectedClaimType = expectedType === "access" ? "s" : expectedType === "refresh" ? "r" : undefined;
  if (record.accountId !== claims.sub || record.clientId !== claims.clid || record.type !== (claims.t === "s" ? "access" : "refresh")) return null;
  if ((expectedType && record.type !== expectedType) || (expectedClaimType && claims.t !== expectedClaimType)) return null;
  const account = store.getAccount(record.accountId);
  const isUserToken = isUserGrant(record.authMethod);
  if (isUserToken && (!account || account.banned)) return null;
  return { claims, record, account, isUserToken };
}

export function authenticateAccessToken(token: string): ActiveToken | null {
  return authenticateToken(token, "access");
}

export function extractAccountId(authorization: string | undefined): string | null {
  const token = extractBearerToken(authorization);
  return token ? authenticateAccessToken(token)?.claims.sub ?? null : null;
}

function authenticationError(c: Context, reason: "missing" | "invalid" | "disabled") {
  if (reason === "missing") {
    return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.authorization_token_missing", "Authorization token missing"), 401);
  }
  if (reason === "disabled") {
    return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.account_disabled", "Account disabled"), 403);
  }
  return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.authorization_token_invalid", "Authorization token invalid"), 401);
}

async function attachIdentity(c: Context, next: Next, requireUser: boolean) {
  const token = extractBearerToken(c.req.header("authorization"));
  if (!token) return authenticationError(c, "missing");
  const identity = authenticateAccessToken(token);
  if (!identity) return authenticationError(c, "invalid");
  if (identity.isUserToken && identity.account?.banned) return authenticationError(c, "disabled");
  if (requireUser && (!identity.isUserToken || !identity.account)) return authenticationError(c, "invalid");
  c.set("accountId", identity.claims.sub);
  c.set("displayName", identity.claims.dn);
  c.set("tokenData", identity.claims as unknown as Record<string, unknown>);
  c.set("accessToken", token);
  c.set("isUserToken", identity.isUserToken);
  c.set("clientId", identity.claims.clid);
  await next();
}

export async function verifyToken(c: Context, next: Next) {
  return attachIdentity(c, next, true);
}

export async function verifyClient(c: Context, next: Next) {
  return attachIdentity(c, next, false);
}

export function requireAccountAccess(c: Context, accountId: string) {
  if (!c.get("isUserToken") || c.get("accountId") !== accountId) {
    return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.authorization_forbidden", "This token cannot access the requested account"), 403);
  }
  return null;
}
