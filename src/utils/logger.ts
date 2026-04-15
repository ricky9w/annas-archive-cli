import pc from "picocolors";

type Level = "debug" | "info" | "warn" | "error";

const PRIORITY: Record<Level | "silent", number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const LABELS: Record<Level, string> = {
  debug: pc.dim("[debug]"),
  info: pc.cyan("[info] "),
  warn: pc.yellow("[warn] "),
  error: pc.red("[error]"),
};

function resolveThreshold(): number {
  const argv = process.argv;
  if (argv.includes("--debug")) return PRIORITY.debug;
  if (argv.includes("--verbose")) return PRIORITY.info;
  return PRIORITY.silent;
}

const threshold = resolveThreshold();

function emit(level: Level, ctx: string, msg: string): void {
  if (PRIORITY[level] < threshold) return;
  process.stderr.write(`${LABELS[level]} ${pc.dim(`[${ctx}]`)} ${msg}\n`);
}

export const log = {
  debug: (ctx: string, msg: string) => emit("debug", ctx, msg),
  info: (ctx: string, msg: string) => emit("info", ctx, msg),
  warn: (ctx: string, msg: string) => emit("warn", ctx, msg),
  error: (ctx: string, msg: string) => emit("error", ctx, msg),
};
