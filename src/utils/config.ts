import { mkdir, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { AppConfig } from "../types.ts";

const APP_NAME = "annas-archive";

export const VALID_CONFIG_KEYS = new Set(["key", "output", "format"]);

export function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || join(homedir(), ".config");
  return join(base, APP_NAME);
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export async function loadConfig(): Promise<AppConfig> {
  const configPath = getConfigPath();
  try {
    const file = Bun.file(configPath);
    if (await file.exists()) {
      return (await file.json()) as AppConfig;
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "EACCES" || code === "EPERM") {
      console.error(
        `Warning: config file ${configPath} is not readable (${code}). Using defaults.`,
      );
    } else {
      console.error(
        `Warning: config file ${configPath} could not be loaded. Using defaults.`,
      );
    }
  }
  return {};
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigPath();
  await mkdir(dirname(configPath), { recursive: true });
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
  await chmod(configPath, 0o600);
}

export async function getApiKey(): Promise<string | null> {
  // Precedence: env var > config file
  const envKey = process.env.ANNAS_ARCHIVE_KEY;
  if (envKey && envKey.trim()) return envKey.trim();

  const config = await loadConfig();
  return config.key || null;
}

export async function getConfigValue(key: string): Promise<string | undefined> {
  const config = await loadConfig();
  return config[key as keyof AppConfig];
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  if (!VALID_CONFIG_KEYS.has(key)) {
    throw new Error(
      `Invalid config key "${key}". Valid keys: ${[...VALID_CONFIG_KEYS].join(", ")}`,
    );
  }
  const config = await loadConfig();
  (config as Record<string, string>)[key] = value;
  await saveConfig(config);
}
