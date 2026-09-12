import crypto from "crypto";

export function getVersionInfo(userAgent: string): {
  season: number;
  build: number;
  CL: string;
} {
  const match = userAgent.match(
    /Fortnite\/\+\+Fortnite\+Release-(\d+)\.(\d+)-CL-(\d+)/
  );
  if (!match) return { season: 1, build: 1.0, CL: "0" };
  return {
    season: parseInt(match[1]),
    build: parseFloat(`${match[1]}.${match[2]}`),
    CL: match[3],
  };
}

export function makeID(): string {
  return crypto.randomUUID();
}

export function generateTokenHash(): string {
  return crypto.randomBytes(20).toString("hex");
}

export function sha1(content: string | Buffer): string {
  return crypto.createHash("sha1").update(content).digest("hex");
}

export function sha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function generateExchangeCode(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function timeAsISO(): string {
  return new Date().toISOString();
}
