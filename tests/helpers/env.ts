import { readFileSync } from "node:fs";
import path from "node:path";

let cached: Record<string, string> | null = null;

/** Read .env.local (plus process.env overrides) for test helpers. */
export function testEnv(): Record<string, string> {
  if (cached) return cached;
  const envPath = path.resolve(__dirname, "../../.env.local");
  const fromFile: Record<string, string> = {};
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) fromFile[m[1]] = m[2];
    }
  } catch {
    // fall through to process.env only
  }
  cached = { ...fromFile };
  for (const key of Object.keys(fromFile)) {
    if (process.env[key]) cached[key] = process.env[key] as string;
  }
  return cached;
}
