export interface VersionInfo {
  season: number;
  build: number;
  CL: string;
  lobby: string;
}

export interface TokenPayload {
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
}

export interface Account {
  accountId: string;
  displayName: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileChange {
  changeType: string;
  itemId?: string;
  attributeName?: string;
  attributeValue?: unknown;
  quantity?: number;
  items?: Record<string, unknown>;
  profile?: Record<string, unknown>;
}

export interface MCPResponse {
  profileRevision: number;
  profileId: string;
  profileChangesBaseRevision: number;
  profileChanges: ProfileChange[];
  profileCommandRevision: number;
  serverTime: string;
  multiUpdate: unknown[];
  notifications: unknown[];
  responseVersion: number;
}

export interface CloudStorageFile {
  uniqueFilename: string;
  filename: string;
  hash: string;
  hash256: string;
  length: number;
  contentType: string;
  uploaded: string;
  storageType: string;
  storageIds: Record<string, never>;
  doNotCache: boolean;
}
