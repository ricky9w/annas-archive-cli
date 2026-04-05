# annas-archive-cli

Search and download ebooks from [Anna's Archive](https://annas-archive.gl) — a TypeScript CLI that runs on both Node.js and Bun.

## Installation

```bash
# Run directly (no install)
npx annas-archive-cli search "Clean Code"
bunx annas-archive-cli search "Clean Code"

# Global install
npm add -g annas-archive-cli
bun add -g annas-archive-cli
```

Requires **Node.js >= 20** or **Bun >= 1.0**.

## Quick Start

```bash
# Search for a book
annas search "Clean Code Robert Martin" --format pdf

# Interactive: search, pick, and download in one go
annas search "Design Patterns" -i

# Download by MD5 hash
annas download adb5293cf369256a883718e71d3771c3

# Get book details
annas details adb5293cf369256a883718e71d3771c3
```

## Commands

### `annas search <query>`

Search for books by title, author, or both.

| Flag | Description |
|------|-------------|
| `-f, --format <ext>` | Filter by format: `pdf`, `epub`, `mobi`, `azw3`, `djvu` |
| `-l, --limit <n>` | Max results (default: 10) |
| `-i, --interactive` | Pick a result and download interactively |
| `-V, --verify <str>` | Highlight results containing this string |
| `--json` | JSON output |

### `annas download <md5>`

Download a book by its MD5 hash. Requires an API key.

| Flag | Description |
|------|-------------|
| `-o, --output <dir>` | Output directory (default: `.`) |
| `-n, --name <file>` | Custom output filename |

### `annas details <md5>`

Show detailed information about a book.

| Flag | Description |
|------|-------------|
| `--json` | JSON output |

### `annas config`

Manage persistent configuration.

```bash
annas config show              # Show all config
annas config set key <value>   # Save API key
annas config set output ~/books  # Default download directory
annas config set format pdf    # Default format filter
annas config get key           # Get a specific value
annas config path              # Show config file location
```

## Configuration

### API Key

Downloads require an [Anna's Archive membership](https://annas-archive.gl/donate?r=7XfHurr) key. Search works without one.

Set your key (choose one):

```bash
# Option 1: Save to config file (recommended)
annas config set key "your-key-here"

# Option 2: Environment variable
export ANNAS_ARCHIVE_KEY="your-key-here"
```

**Precedence**: environment variable > config file.

Config is stored at `~/.config/annas-archive/config.json` (respects `$XDG_CONFIG_HOME`). The config file is created with `600` permissions to protect your API key.

### Format Priority

When no format is specified, results are sorted by year (most recent first). Suggested format preference: `pdf > epub > mobi > azw3 > djvu`.

## Mirror Fallback

The CLI automatically probes multiple mirrors **concurrently** and uses the fastest responding one:

- annas-archive.gl
- annas-archive.li
- annas-archive.in
- annas-archive.pm

The winning mirror is cached for subsequent requests. If all known mirrors fail, it checks the [status page](https://open-slum.pages.dev/) to discover new domains automatically.

## Features

- **Cross-runtime** — works on both Node.js (>=20) and Bun
- **Streaming downloads** — constant memory usage regardless of file size
- **Resume support** — interrupted downloads resume from where they left off
- **MD5 integrity check** — verifies downloaded files against expected hash
- **Concurrent mirror probing** — fastest mirror wins, no sequential waiting
- **Automatic mirror discovery** — finds new mirrors when known ones are down
- **Interactive mode** — search, pick, and download with beautiful prompts
- **Retry with backoff** — up to 3 attempts with exponential backoff
- **Stall detection** — aborts and retries if no data received for 30 seconds
- **Safe filenames** — sanitizes filenames from URLs, prevents path traversal
- **XDG-compliant config** — respects `$XDG_CONFIG_HOME`

## Development

```bash
# Run from source (requires Bun)
bun src/index.ts search "test"

# Type-check
bun run --bun tsc --noEmit

# Build for Node.js
bun run build
```

## Troubleshooting

### SSL Certificate Error on macOS

If you see `CERTIFICATE_VERIFY_FAILED`:

```bash
# Set the SSL cert path
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())" 2>/dev/null)
```

### No results found

- Try shorter queries: `"Clean Code"` instead of `"Clean Code: A Handbook of Agile Software Craftsmanship"`
- Try author-only: `"Robert Martin"`
- Try different format filters

## License

MIT
