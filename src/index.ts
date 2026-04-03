import { defineCommand, runMain } from "citty";
import pkg from "../package.json";

const main = defineCommand({
  meta: {
    name: "annas",
    version: pkg.version,
    description: "Search and download ebooks from Anna's Archive",
  },
  subCommands: {
    search: () => import("./commands/search.ts").then((m) => m.default),
    download: () => import("./commands/download.ts").then((m) => m.default),
    details: () => import("./commands/details.ts").then((m) => m.default),
    config: () => import("./commands/config.ts").then((m) => m.default),
  },
});

runMain(main);
