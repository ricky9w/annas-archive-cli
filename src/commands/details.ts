import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import { AnnaClient } from "../lib/client.ts";
import { formatBookDetails, printError } from "../utils/display.ts";

export default defineCommand({
  meta: {
    name: "details",
    description: "Get book details",
  },
  args: {
    md5: {
      type: "positional",
      description: "Book MD5 hash",
      required: true,
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  async run({ args }) {
    if (!/^[a-f0-9]{32}$/.test(args.md5)) {
      printError("Invalid MD5 hash. Expected 32 hex characters.");
      process.exit(1);
    }

    const client = new AnnaClient();
    const spinner = createSpinner("Fetching details...").start();

    const details = await client.getDetails(args.md5);

    spinner.stop();
    process.stderr.write("\r\x1b[K");

    if (!details) {
      printError("Book not found.");
      process.exit(1);
    }

    if (args.json) {
      console.log(JSON.stringify(details, null, 2));
      return;
    }

    console.log(formatBookDetails(details));
  },
});
