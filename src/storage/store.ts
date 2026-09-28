import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATA_ROOT = path.resolve(import.meta.dir, "../../data");

export interface AccountData {
  accountId: string;
  displayName: string;
  email: string;
  passwordHash: string;
  banned: boolean;
  banReason: string;
  createdAt: string;
  updatedAt?: string;
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

export interface DeviceAuthData {
  deviceId: string;
  accountId: string;
  secret: string;
  created: string;
  lastAccess?: string;
}

export interface StoredFile {
  filename: string;
  content: Buffer;
  uploaded: string;
}

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
}

function tokenFileName(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDirectory(path.dirname(filePath));
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

function listFiles(directory: string, extension?: string): string[] {
  ensureDirectory(directory);
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (!extension || entry.name.endsWith(extension)))
    .map((entry) => entry.name);
}

function removeFile(filePath: string) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function validSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value);
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

class Store {
  private readonly accountsDirectory = path.join(DATA_ROOT, "accounts");
  private readonly tokensDirectory = path.join(DATA_ROOT, "tokens");
  private readonly profilesDirectory = path.join(DATA_ROOT, "profiles");
  private readonly deviceAuthDirectory = path.join(DATA_ROOT, "device-auth");
  private readonly userStorageDirectory = path.join(DATA_ROOT, "client-settings");

  getAccount(accountId: string): AccountData | null {
    if (!validSegment(accountId)) return null;
    return readJson<AccountData | null>(path.join(this.accountsDirectory, `${accountId}.json`), null);
  }

  getAccountByEmail(email: string): AccountData | null {
    const query = normalized(email);
    if (!query) return null;
    for (const file of listFiles(this.accountsDirectory, ".json")) {
      const account = readJson<AccountData | null>(path.join(this.accountsDirectory, file), null);
      if (account && normalized(account.email) === query) return account;
    }
    return null;
  }

  getAccountByDisplayName(displayName: string): AccountData | null {
    const query = normalized(displayName);
    if (!query) return null;
    for (const file of listFiles(this.accountsDirectory, ".json")) {
      const account = readJson<AccountData | null>(path.join(this.accountsDirectory, file), null);
      if (account && normalized(account.displayName) === query) return account;
    }
    return null;
  }

  getAccounts(accountIds: string[]): AccountData[] {
    return accountIds
      .map((accountId) => this.getAccount(accountId))
      .filter((account): account is AccountData => account !== null);
  }

  saveAccount(account: AccountData) {
    if (!validSegment(account.accountId)) throw new Error("Invalid account id");
    writeJson(path.join(this.accountsDirectory, `${account.accountId}.json`), account);
  }

  createAccount(email: string, displayName: string, passwordHash: string): AccountData {
    const now = new Date().toISOString();
    const account: AccountData = {
      accountId: crypto.randomUUID().replace(/-/g, ""),
      displayName,
      email,
      passwordHash,
      banned: false,
      banReason: "",
      createdAt: now,
      updatedAt: now,
    };
    this.saveAccount(account);
    return account;
  }

  deleteAccount(accountId: string) {
    if (!validSegment(accountId)) return;
    removeFile(path.join(this.accountsDirectory, `${accountId}.json`));
    this.deleteAccountTokens(accountId);
    removeFile(path.join(this.deviceAuthDirectory, `${accountId}.json`));
  }

  getToken(token: string): TokenData | null {
    if (!token) return null;
    return readJson<TokenData | null>(path.join(this.tokensDirectory, `${tokenFileName(token)}.json`), null);
  }

  saveToken(token: TokenData) {
    writeJson(path.join(this.tokensDirectory, `${tokenFileName(token.token)}.json`), token);
  }

  deleteToken(token: string) {
    if (!token) return;
    removeFile(path.join(this.tokensDirectory, `${tokenFileName(token)}.json`));
  }

  deleteAccountTokens(accountId: string) {
    for (const file of listFiles(this.tokensDirectory, ".json")) {
      const token = readJson<TokenData | null>(path.join(this.tokensDirectory, file), null);
      if (token?.accountId === accountId) removeFile(path.join(this.tokensDirectory, file));
    }
  }

  deleteExpiredTokens(now = Date.now()) {
    for (const file of listFiles(this.tokensDirectory, ".json")) {
      const token = readJson<TokenData | null>(path.join(this.tokensDirectory, file), null);
      if (!token || Number.isNaN(Date.parse(token.expiresAt)) || Date.parse(token.expiresAt) <= now) {
        removeFile(path.join(this.tokensDirectory, file));
      }
    }
  }

  getProfile(accountId: string, profileId: string): ProfileData | null {
    if (!validSegment(accountId) || !validSegment(profileId)) return null;
    return readJson<ProfileData | null>(path.join(this.profilesDirectory, accountId, `${profileId}.json`), null);
  }

  saveProfile(profile: ProfileData) {
    if (!validSegment(profile.accountId) || !validSegment(profile.profileId)) {
      throw new Error("Invalid profile identity");
    }
    writeJson(path.join(this.profilesDirectory, profile.accountId, `${profile.profileId}.json`), profile);
  }

  getDefaultProfile(profileId: string): Record<string, unknown> | null {
    if (!validSegment(profileId)) return null;
    return readJson<Record<string, unknown> | null>(path.join(DATA_ROOT, "profiles", `${profileId}.json`), null);
  }

  listDeviceAuths(accountId: string): DeviceAuthData[] {
    if (!validSegment(accountId)) return [];
    return readJson<DeviceAuthData[]>(path.join(this.deviceAuthDirectory, `${accountId}.json`), []);
  }

  getDeviceAuth(accountId: string, deviceId: string): DeviceAuthData | null {
    return this.listDeviceAuths(accountId).find((device) => device.deviceId === deviceId) ?? null;
  }

  saveDeviceAuth(device: DeviceAuthData) {
    if (!validSegment(device.accountId) || !validSegment(device.deviceId)) {
      throw new Error("Invalid device auth identity");
    }
    const devices = this.listDeviceAuths(device.accountId).filter((entry) => entry.deviceId !== device.deviceId);
    devices.push(device);
    writeJson(path.join(this.deviceAuthDirectory, `${device.accountId}.json`), devices);
  }

  deleteDeviceAuth(accountId: string, deviceId: string) {
    if (!validSegment(accountId) || !validSegment(deviceId)) return;
    const devices = this.listDeviceAuths(accountId).filter((device) => device.deviceId !== deviceId);
    writeJson(path.join(this.deviceAuthDirectory, `${accountId}.json`), devices);
  }

  getUserFile(accountId: string, filename: string): StoredFile | null {
    if (!validSegment(accountId) || !validSegment(filename)) return null;
    const filePath = path.join(this.userStorageDirectory, accountId, filename);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    return {
      filename,
      content: fs.readFileSync(filePath),
      uploaded: fs.statSync(filePath).mtime.toISOString(),
    };
  }

  saveUserFile(accountId: string, filename: string, content: Buffer) {
    if (!validSegment(accountId) || !validSegment(filename)) throw new Error("Invalid storage identity");
    const directory = path.join(this.userStorageDirectory, accountId);
    ensureDirectory(directory);
    const filePath = path.join(directory, filename);
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, content);
    fs.renameSync(temporaryPath, filePath);
  }

  deleteUserFile(accountId: string, filename: string) {
    if (!validSegment(accountId) || !validSegment(filename)) return;
    removeFile(path.join(this.userStorageDirectory, accountId, filename));
  }

  listUserFiles(accountId: string): StoredFile[] {
    if (!validSegment(accountId)) return [];
    const directory = path.join(this.userStorageDirectory, accountId);
    return listFiles(directory)
      .map((filename) => this.getUserFile(accountId, filename))
      .filter((file): file is StoredFile => file !== null);
  }

  getClientSettings(accountId: string): Buffer | null {
    return this.getUserFile(accountId, "ClientSettings.Sav")?.content ?? null;
  }

  saveClientSettings(accountId: string, content: Buffer) {
    this.saveUserFile(accountId, "ClientSettings.Sav", content);
  }

  listClientSettingsFiles(accountId: string): string[] {
    return this.listUserFiles(accountId).map((file) => file.filename);
  }
}

export const store = new Store();
