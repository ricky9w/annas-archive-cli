import { defineCommand } from "citty";
import pc from "picocolors";
import {
  getConfigPath,
  loadConfig,
  setConfigValue,
  getConfigValue,
} from "../utils/config.ts";

const VALID_KEYS = ["key", "output", "format"];

export default defineCommand({
  meta: {
    name: "config",
    description: "Manage configuration",
  },
  subCommands: {
    set: defineCommand({
      meta: { name: "set", description: "Set a config value" },
      args: {
        key: {
          type: "positional",
          description: `Config key (${VALID_KEYS.join(", ")})`,
          required: true,
        },
        value: {
          type: "positional",
          description: "Config value",
          required: true,
        },
      },
      async run({ args }) {
        if (!VALID_KEYS.includes(args.key)) {
          console.error(
            pc.red(`Invalid key "${args.key}". Valid keys: ${VALID_KEYS.join(", ")}`),
          );
          process.exit(1);
        }
        await setConfigValue(args.key, args.value);
        const display = args.key === "key"
          ? `${args.value.slice(0, 8)}...`
          : args.value;
        console.log(pc.green(`Set ${args.key} = ${display}`));
      },
    }),

    get: defineCommand({
      meta: { name: "get", description: "Get a config value" },
      args: {
        key: {
          type: "positional",
          description: `Config key (${VALID_KEYS.join(", ")})`,
          required: true,
        },
      },
      async run({ args }) {
        const value = await getConfigValue(args.key);
        if (value) {
          const display = args.key === "key"
            ? `${value.slice(0, 8)}...${value.slice(-4)}`
            : value;
          console.log(display);
        } else {
          console.log(pc.dim("(not set)"));
        }
      },
    }),

    path: defineCommand({
      meta: { name: "path", description: "Show config file path" },
      run() {
        console.log(getConfigPath());
      },
    }),

    show: defineCommand({
      meta: { name: "show", description: "Show all configuration" },
      async run() {
        const config = await loadConfig();
        const entries = Object.entries(config);

        if (entries.length === 0) {
          console.log(pc.dim("No configuration set."));
          console.log(pc.dim(`Config file: ${getConfigPath()}`));
          return;
        }

        for (const [key, value] of entries) {
          const display = key === "key"
            ? `${String(value).slice(0, 8)}...${String(value).slice(-4)}`
            : value;
          console.log(`${pc.bold(key)}: ${display}`);
        }
        console.log(pc.dim(`\nConfig file: ${getConfigPath()}`));
      },
    }),
  },

});
