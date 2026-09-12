import fs from "fs";
import path from "path";
import crypto from "crypto";

const BASE = path.join(import.meta.dir, "../../data");

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJSON(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function deleteFile(filePath: string) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function listFiles(dir: string, ext?: string): string[] {
  ensureDir(dir);
  const files = fs.readdirSync(dir);
  return ext ? files.filter((f) => f.endsWith(ext)) : files;
}

export interface AccountData {
  accountId: string;
  displayName: string;
  email: string;
  passwordHash: string;
  banned: boolean;
  banReason: string;
  createdAt: string;
}

export interface TokenData {
  accountId: string;
  token: string;
  type: "access" | "refresh";
  clientId: string;
  deviceId: string;
  authMethod: string;
  displayName: string;
  expiresAt: string;
}

export interface ProfileData {
  accountId: string;
  profileId: string;
  rvn: number;
  commandRevision: number;
  data: Record<string, unknown>;
}

class Store {
  private accountsDir = path.join(BASE, "accounts");
  private tokensDir = path.join(BASE, "tokens");
  private profilesDir = path.join(BASE, "profiles");
  private clientSettingsDir = path.join(BASE, "client-settings");

  getAccount(accountId: string): AccountData | null {
    return readJSON<AccountData | null>(
      path.join(this.accountsDir, `${accountId}.json`),
      null
    );
  }

  getAccountByEmail(email: string): AccountData | null {
    const files = listFiles(this.accountsDir, ".json");
    for (const file of files) {
      const account = readJSON<AccountData | null>(
        path.join(this.accountsDir, file),
        null
      );
      if (account && account.email === email) return account;
    }
    return null;
  }

  getAccountByDisplayName(displayName: string): AccountData | null {
    const files = listFiles(this.accountsDir, ".json");
    for (const file of files) {
      const account = readJSON<AccountData | null>(
        path.join(this.accountsDir, file),
        null
      );
      if (account && account.displayName === displayName) return account;
    }
    return null;
  }

  getAccounts(ids: string[]): AccountData[] {
    return ids
      .map((id) => this.getAccount(id))
      .filter((a): a is AccountData => a !== null);
  }

  saveAccount(account: AccountData) {
    writeJSON(path.join(this.accountsDir, `${account.accountId}.json`), account);
  }

  createAccount(email: string, displayName: string, passwordHash: string): AccountData {
    const accountId = crypto.randomUUID().replace(/-/g, "");
    const account: AccountData = {
      accountId,
      displayName,
      email,
      passwordHash,
      banned: false,
      banReason: "",
      createdAt: new Date().toISOString(),
    };
    this.saveAccount(account);
    return account;
  }

  deleteAccount(accountId: string) {
    deleteFile(path.join(this.accountsDir, `${accountId}.json`));
  }

  getToken(token: string): TokenData | null {
    return readJSON<TokenData | null>(
      path.join(this.tokensDir, `${tokenHash(token)}.json`),
      null
    );
  }

  saveToken(token: TokenData) {
    writeJSON(path.join(this.tokensDir, `${tokenHash(token.token)}.json`), token);
  }

  deleteToken(token: string) {
    deleteFile(path.join(this.tokensDir, `${tokenHash(token)}.json`));
  }

  deleteAccountTokens(accountId: string) {
    const files = listFiles(this.tokensDir, ".json");
    for (const file of files) {
      const token = readJSON<TokenData | null>(
        path.join(this.tokensDir, file),
        null
      );
      if (token && token.accountId === accountId) {
        deleteFile(path.join(this.tokensDir, file));
      }
    }
  }

  getProfile(accountId: string, profileId: string): ProfileData | null {
    return readJSON<ProfileData | null>(
      path.join(this.profilesDir, accountId, `${profileId}.json`),
      null
    );
  }

  saveProfile(profile: ProfileData) {
    writeJSON(
      path.join(this.profilesDir, profile.accountId, `${profile.profileId}.json`),
      profile
    );
  }

  getDefaultProfile(profileId: string): Record<string, unknown> | null {
    return readJSON<Record<string, unknown> | null>(
      path.join(BASE, "..", "data", "profiles", `${profileId}.json`),
      null
    );
  }

  getClientSettings(accountId: string): Buffer | null {
    const filePath = path.join(this.clientSettingsDir, accountId, "ClientSettings.Sav");
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  }

  saveClientSettings(accountId: string, data: Buffer) {
    ensureDir(path.join(this.clientSettingsDir, accountId));
    fs.writeFileSync(path.join(this.clientSettingsDir, accountId, "ClientSettings.Sav"), data);
  }

  listClientSettingsFiles(accountId: string): string[] {
    const dir = path.join(this.clientSettingsDir, accountId);
    return listFiles(dir);
  }
}

export const store = new Store();
