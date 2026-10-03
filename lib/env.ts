export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function roomPrefix(): string {
  return process.env.ROOM_PREFIX || "rmt";
}

export function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function booleanEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;

  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}
