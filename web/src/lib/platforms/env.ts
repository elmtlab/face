import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const ENV_PATH = join(process.cwd(), ".env.local");

export function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const content = readFileSync(ENV_PATH, "utf-8");
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

export function writeEnvFile(vars: Record<string, string>): void {
  const lines = Object.entries(vars)
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => `${k}="${v}"`);
  writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
}

export function getCredentials(prefix: string): Record<string, string> {
  const env = readEnvFile();
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(prefix)) {
      result[key] = value;
    }
  }
  return result;
}

export function hasCredentials(keys: string[]): boolean {
  const env = readEnvFile();
  return keys.every((k) => env[k] && env[k].length > 0);
}
