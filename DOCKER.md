# Docker Setup Guide

This guide explains how to use DiscorDManager with Docker.

## What is DiscorDManager?

This tool is a wrapper for [Discord Chat Exporter (DCE)](https://github.com/Tyrrrz/DiscordChatExporter/) that helps you:
- Export 1-on-1 Discord DMs to various formats (HTML, JSON, etc.)
- Manage DM state (open/close channels)
- Process DMs in batches to avoid rate limiting
- Export specific users or all DMs at once

The tool automatically manages Discord's DM state, ensuring your previously open conversations are restored after export.

## Quick Start

### 1. Build the Docker Image

```bash
docker build -t discordmanager .
```

Or use npm script:
```bash
npm run docker:build
```

### 2. Prepare Configuration

Make sure you have:
- `config/config.json` - Application configuration
- `config/.env` - Discord token and user ID
- Your Discord data package available

Example `config/.env`:
```env
USER_DISCORD_TOKEN=your_discord_token_here
USER_DISCORD_ID=your_user_id_here
```

Example `config/config.json`:
```json
{
  "DATA_PACKAGE_FOLDER": "/app/data-package",
  "EXPORT_PATH": "/app/export",
  "DCE_PATH": "/app/dce",
  "BATCH_SIZE": 10,
  "EXPORT_FORMAT": "HtmlDark",
  "EXPORT_MEDIA_TOGGLE": false,
  "EXPORT_REUSE_MEDIA": true
}
```

### 3. Run with Docker Compose

Export DMs for specific users by username:
```bash
docker compose run --rm discordmanager -s username1 username2 "user three"
```

Export by user IDs:
```bash
docker compose run --rm discordmanager -u 123456789 987654321
```

Export all DMs:
```bash
docker compose run --rm discordmanager --all
```

Interactive menu mode (for configuration and more options):
```bash
docker compose run --rm discordmanager interactive
```

## Direct Docker Usage

If not using docker compose:

```bash
# Export specific users
docker run -v $(pwd)/config:/app/config \
           -v $(pwd)/export:/app/export \
           -v $(pwd)/logs:/app/logs \
           -v /path/to/discord-package:/app/data-package:ro \
           discordmanager -s username1 username2

# Interactive mode
docker run -it \
           -v $(pwd)/config:/app/config \
           -v $(pwd)/export:/app/export \
           -v $(pwd)/logs:/app/logs \
           -v /path/to/discord-package:/app/data-package:ro \
           discordmanager interactive
```

## CLI Options

```
-s, --username <username...>         Export DMs for specific Discord username(s)
-u, --user-id <id...>                Export DMs for specific Discord user ID(s)
-a, --all                            Export all DMs
-h, --help                           Show help message
```

For configuration, use the interactive menu mode.

Note: Only 1-on-1 DMs (type 1) are supported. Group DMs are not exported.

## Volume Mounts

- `/app/config` - Configuration files (config.json, .env)
- `/app/export` - Exported DM output directory
- `/app/logs` - Application logs
- `/app/data-package` - Your Discord data package (read-only recommended)

## Environment Variables

You can override config values via environment variables:

```yaml
environment:
  - USER_DISCORD_TOKEN=your_token
  - USER_DISCORD_ID=your_id
  - DRY_RUN=false
```

## Examples

### Example 1: Export Multiple Users
```bash
docker compose run --rm discordmanager \
  -s "user one" user2 user3
```

### Example 2: Export Specific User IDs
```bash
docker compose run --rm discordmanager \
  -u 123456789 987654321
```

### Example 3: Export All DMs
```bash
docker compose run --rm discordmanager --all
```

### Example 4: Test Run (Dry Run)
Edit docker-compose.yml to set `DRY_RUN=true` in environment, then:
```bash
docker compose run --rm discordmanager --all
```

## Troubleshooting

### Discord Chat Exporter Not Found
The Dockerfile automatically downloads DCE. If you encounter issues, verify the DCE_PATH in config.json points to `/app/dce`.

### Permission Issues

**Understanding User/Group IDs:**
The container runs as your host user (via `UID` and `GID` environment variables) to avoid permission issues. The `./scripts/launch.sh` script automatically sets these.

- **Linux users**: Typically UID=1000, GID=1000
- **macOS users**: Typically UID=501, GID=20
- **Manual runs**: Falls back to UID=1000, GID=1000

**If you encounter permission errors:**

1. Ensure directories are readable/writable:
```bash
chmod -R 755 config export logs data/package
```

2. When using `docker compose` directly (not via launch.sh), set user IDs:
```bash
export UID=$(id -u)
export GID=$(id -g)
docker compose run --rm discordmanager interactive
```

3. Check file ownership matches your user:
```bash
ls -la export/
# Should show your username, not root
```

### Data Package Not Found
Make sure to mount your Discord data package correctly in the docker-compose.yml volumes section or your docker run command.

## Advanced: Custom DCE Version

To use a specific DCE version, modify the Dockerfile:

```dockerfile
RUN curl -L -o DiscordChatExporter.Cli.zip \
    "https://github.com/Tyrrrz/DiscordChatExporter/releases/download/2.42.5/DiscordChatExporter.Cli.linux-x64.zip"
```
