# Discord DM Manager

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
cd discord-dm-manager
```

2. **Edit docker-compose.yml to set your Discord data package path:**
```yaml
volumes:
  - /path/to/your/discord-data-package:/data/package:ro
```

3. **Build the Docker image:**
```bash
docker-compose build
```

4. **Configure authentication (first time only):**
```bash
docker-compose run --rm discord-dm-manager interactive
```
Follow prompts to enter your Discord authorization token and user ID.

### Usage

**Export specific users by username:**
```bash
docker-compose run --rm discord-dm-manager -s username1 username2 "user three"
```

**Export by user ID:**
```bash
docker-compose run --rm discord-dm-manager -u 123456789 987654321
```

**Export all DMs:**
```bash
docker-compose run --rm discord-dm-manager --all
```

**Interactive menu:**
```bash
docker-compose run --rm discord-dm-manager interactive
```

**Batch mode:**
```bash
docker-compose run --rm discord-dm-manager batch
```

**Show help:**
```bash
docker-compose run --rm discord-dm-manager --help
```

### Output

Exported chat files appear in `./export/` directory on your host machine.

## Configuration

All paths are managed by Docker volumes. Configuration menu (interactive mode) allows you to adjust:
- Batch size
- API delays
- Rate limits
- Dry run mode

Authentication credentials are stored in `./config/.env`.

## Project Structure

```
discord-dm-manager/
├── src/               # Source code
├── config/            # Configuration files (mounted)
├── export/            # Exported DMs (mounted)
├── logs/              # Application logs (mounted)
├── Dockerfile         # Docker image definition
└── docker-compose.yml # Docker Compose configuration
```

## License

MIT
