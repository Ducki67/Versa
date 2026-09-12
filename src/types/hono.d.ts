import type { VersionInfo } from "./index";

declare module "hono" {
  interface ContextVariableMap {
    version: VersionInfo;
    userAgent: string;
    accountId: string;
    displayName: string;
    tokenData: Record<string, unknown>;
  }
}
