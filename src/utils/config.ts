import { mkdir, chmod, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { AppConfig } from "../types.ts";
import { log } from "./logger.ts";

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
    const raw = await readFile(configPath, "utf-8");
    log.debug("config", `loaded config from ${configPath}`);
    return JSON.parse(raw) as AppConfig;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      log.debug("config", `no config file at ${configPath}, using defaults`);
      return {};
    }
    if (code === "EACCES" || code === "EPERM") {
      log.warn("config", `config file ${configPath} not readable (${code}), using defaults`);
    } else {
      log.warn("config", `config file ${configPath} could not be loaded, using defaults`);
    }
  }
  return {};
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigPath();
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  await chmod(configPath, 0o600);
}

export async function getApiKey(): Promise<string | null> {
  // Precedence: env var > config file
  const envKey = process.env.ANNAS_ARCHIVE_KEY;
  if (envKey && envKey.trim()) {
    log.debug("config", "API key source: environment variable");
    return envKey.trim();
  }

  const config = await loadConfig();
  log.debug("config", `API key source: ${config.key ? "config file" : "none"}`);
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
