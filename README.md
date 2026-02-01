# DiscorDManager

A Docker-based wrapper tool for Discord Chat Exporter that helps manage and export Discord DMs efficiently.

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Discord data package (download from Discord settings)
- Discord authorization token

### Setup

1. **Clone and navigate to repository:**
```bash
git clone <repository-url>
cd discordmanager
```

2. **Place your Discord data package:**

Download your Discord data package from Discord settings, then:

**Option A: Use default location (recommended)**
```bash
# Extract your Discord data package to ./data/package/
# The folder should contain: messages/, account/, servers/, etc.
```

**Option B: Custom location**
Edit `docker-compose.yml` to set your custom path:
```yaml
volumes:
  - /path/to/your/discord-data-package:/data/package
```

**Note:** The data package needs write access for tracking DM state (id-history.json).

3. **Build the Docker image:**
```bash
docker compose build
# Or use the rebuild script for a clean build:
./scripts/rebuild.sh
```

4. **Configure authentication (first time only):**
```bash
docker compose run --rm discordmanager interactive
# Or use the launch script:
./scripts/launch.sh
```
The setup wizard will:
- Verify your data package location (prompts if not found)
- Verify your Discord user ID matches the data package
- Request your Discord authorization token
- Allow you to proceed even if IDs don't match (with warning)

### Usage

**Export specific users by username:**
```bash
docker compose run --rm discordmanager -s username1 username2 "user three"
```

**Export by user ID:**
```bash
docker compose run --rm discordmanager -u 123456789 987654321
```

**Export all DMs:**
```bash
docker compose run --rm discordmanager --all
```

**Interactive menu:**
```bash
docker compose run --rm discordmanager interactive
```

**Batch mode:**
```bash
docker compose run --rm discordmanager batch
```

**Show help:**
```bash
docker compose run --rm discordmanager --help
```

### CLI Options

```
Options:
  -s, --username <username...>    Export DMs for specific Discord username(s)
                                  Multiple usernames can be space-separated
                                  Quote usernames with spaces: "User Name"
  -u, --user-id <id...>          Export DMs for specific Discord user ID(s)
  -a, --all                      Export all DMs (default behavior)
  -h, --help                     Show this help message
```

**Note:** Only 1-on-1 DMs (type 1) are supported. Group DMs are not exported.

### Output

Exported chat files appear in `./export/` directory on your host machine.

## Configuration

All paths are managed by Docker volumes. Configuration menu (interactive mode) allows you to adjust:
- Dry run mode
- Batch size
- API delays
- Rate limits
- Suppress menu errors

Authentication credentials are stored in `./config/.env`.

## Troubleshooting

### Rebuild Container from Scratch

If you encounter issues, rebuild the container:

```bash
# Remove containers and images
docker-compose down
docker rmi discordmanager:latest

# Rebuild without cache
docker-compose build --no-cache

# Test
docker-compose run --rm discordmanager --help
```

### Complete Docker Cleanup

If problems persist:

```bash
# Remove all stopped containers and dangling images
docker system prune -a

# Rebuild
docker-compose build
```

## Project Structure

```
discordmanager/
├── src/               # Source code
├── config/            # Configuration files (mounted)
├── export/            # Exported DMs (mounted)
├── logs/              # Application logs (mounted)
├── Dockerfile         # Docker image definition
└── docker-compose.yml # Docker Compose configuration
```

## License

MIT
