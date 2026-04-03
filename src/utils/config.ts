import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { AppConfig } from "../types.ts";

const APP_NAME = "annas-archive";

export function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || join(homedir(), ".config");
  return join(base, APP_NAME);
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const file = Bun.file(getConfigPath());
    if (await file.exists()) {
      return (await file.json()) as AppConfig;
    }
  } catch {
    // Corrupted or unreadable config — return defaults
  }
  return {};
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
}

export async function getApiKey(): Promise<string | null> {
  // Precedence: env var > config file
  const envKey = process.env.ANNAS_ARCHIVE_KEY;
  if (envKey) return envKey;

  const config = await loadConfig();
  return config.key || null;
}

export async function getConfigValue(key: string): Promise<string | undefined> {
  const config = await loadConfig();
  return config[key as keyof AppConfig];
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const config = await loadConfig();
  (config as Record<string, string>)[key] = value;
  await saveConfig(config);
}
