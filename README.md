[Discord Direct Message Manager](https://github.com/pironside44/discordreopenalldms) revamped by [melty](https://github.com/meltyli). 

A Docker-based wrapper tool for [Discord Chat Exporter (DCE)](https://github.com/Tyrrrz/DiscordChatExporter/) that simplifies exporting Discord DMs by managing channel state, batch processing, and rate limiting automatically.

**Notable recent changes**
- **Docker-only deployment** - Simplified setup with pre-configured paths
- **CLI mode** - Export DMs via command line with username/ID filters
- **DM state management** - Saves and restores your open DMs after export
- **DRY_RUN mode** - Validate operations before execution

Note: Only 1-on-1 DMs (type 1) are currently supported. Group DMs are not exported.

## 🚀 Quick Start

**Prerequisites:** Docker and Docker Compose

1. **Edit docker-compose.yml** - Set your Discord data package path:
   ```yaml
   - /path/to/your/discord-package:/data/package:ro
   ```

2. **Build the image:**
   ```bash
   docker-compose build
   ```

3. **Configure (first time):**
   ```bash
   docker-compose run --rm discord-dm-manager interactive
   ```
   You'll only need to provide:
   - Discord authorization token
   - Your Discord user ID

4. **Export DMs:**
   ```bash
   # By username
   docker-compose run --rm discord-dm-manager -s username1 username2
   
   # By user ID
   docker-compose run --rm discord-dm-manager -u 123456789
   
   # All DMs
   docker-compose run --rm discord-dm-manager --all
   ```

See [DOCKER.md](DOCKER.md) for detailed setup and usage.

## 📋 Features
## 📋 Features

- **CLI & Interactive modes** - Command line exports or interactive menu
- **DM state management** - Preserves your open DMs across exports
- **Username resolution** - Export by Discord username, not just IDs
- **Rate limiting** - Automatic throttling to avoid Discord API limits
- **Batch processing** - Handles large numbers of DMs efficiently
- **DRY_RUN mode** - Preview operations before execution
- **Complete logging** - Track all operations and API calls

## ⚠️ Documentation

For full usage instructions and examples, see the project wiki: https://github.com/meltyli/discord-dm-manager/wiki

Roadmap: https://github.com/meltyli/discord-dm-manager/wiki/roadmap
