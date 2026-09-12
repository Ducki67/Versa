import { Context, Next } from "hono";
import { parseVersion } from "../data/version-compat";

export async function versionCheck(c: Context, next: Next) {
  const userAgent = c.req.header("user-agent") || "";
  const version = parseVersion(userAgent);
  c.set("version", version);
  c.set("userAgent", userAgent);
  await next();
}
