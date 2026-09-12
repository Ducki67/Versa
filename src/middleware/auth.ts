import { Context, Next } from "hono";
import jwt from "jsonwebtoken";
import { store } from "../storage/store";
import { errorResponse } from "../utils/error";

const JWT_SECRET = process.env.JWT_SECRET || "versa_secret";

export function createToken(
  accountId: string,
  clientId: string,
  deviceId: string,
  authMethod: string,
  displayName: string,
  tokenType: "s" | "r",
  hoursExpire: number
): string {
  const payload = {
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
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${hoursExpire}h` });
}

export function decodeToken(token: string): Record<string, unknown> | null {
  try { return jwt.verify(token, JWT_SECRET) as Record<string, unknown>; } catch { return null; }
}

export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const parts = authorization.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  const token = parts[1];
  if (!token.startsWith("eg1~")) return null;
  return token.slice(4);
}

export function extractAccountId(authorization: string | undefined): string | null {
  const token = extractBearerToken(authorization);
  if (!token) return null;
  const decoded = decodeToken(token);
  if (!decoded || typeof decoded.sub !== "string") return null;
  return decoded.sub;
}

export async function verifyToken(c: Context, next: Next) {
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.authorization_token_missing", "Authorization token missing"), 401);

  const decoded = decodeToken(token);
  if (!decoded) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.authorization_token_invalid", "Authorization token invalid"), 401);

  const dbToken = store.getToken(token);
  if (!dbToken) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.authorization_token_invalid", "Token not found"), 401);

  const user = store.getAccount(decoded.sub as string);
  if (!user) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.not_found", "Account not found"), 404);
  if (user.banned) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.account_disabled", "Account disabled"), 403);

  c.set("accountId", decoded.sub as string);
  c.set("displayName", user.displayName);
  c.set("tokenData", decoded);
  await next();
}

export async function verifyClient(c: Context, next: Next) {
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.authorization_token_missing", "Authorization token missing"), 401);

  const decoded = decodeToken(token);
  if (!decoded) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.authorization_token_invalid", "Invalid token"), 401);

  c.set("accountId", decoded.sub as string);
  c.set("tokenData", decoded);
  await next();
}
