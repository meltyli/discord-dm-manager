[Discord Direct Message Manager](https://github.com/pironside44/discordreopenalldms) revamped by [melty](https://github.com/meltyli). 

A wrapper tool for [Discord Chat Exporter (DCE)](https://github.com/Tyrrrz/DiscordChatExporter/) that simplifies exporting Discord DMs by managing channel state, batch processing, and rate limiting automatically.

**Notable recent changes**
- **NEW: Docker support with CLI mode** - Run exports via command line with username/ID filters, config management
- **NEW: Proper DM state management** - Saves and restores your open DMs after export
- Added options to suppress menu errors, clear the terminal before processing DMs, enhance log/message formatting, integrate user validation into `reopenDM`, show `DRY_RUN` status in the menu title, and improve batch initialization.
- Implemented `DRY_RUN` mode for validation and DM operations, added random delays and improved API delay tracking to reduce throttling, and added atomic writes for `.env` and JSON files.
- Improved `closeAllOpenDMs` to save channel information and updated `id-history.json` structure, added DM state reset after export.

Note: Only 1-on-1 DMs (type 1) are currently supported. Group DMs are not exported.

## 🚀 Quick Start

### CLI Mode (New!)

Export DMs for specific users without the interactive menu:

```bash
# Export by Discord username
npm run cli -- -s username1 username2 "user three"

# Export by user ID
npm run cli -- -u 123456789 987654321

# Export all DMs
npm run cli -- --all
```

### Docker Mode

```bash
# Build
docker-compose build

# Export specific users
docker-compose run --rm discord-dm-manager -s username1 username2

# Interactive menu
docker-compose run --rm discord-dm-manager interactive
```

See [DOCKER.md](DOCKER.md) for complete Docker setup instructions.

### Interactive Menu Mode

For configuration and advanced options:

```bash
npm start
```

### Roadmap / Current status
Check out this project's roadmap and feature list: https://github.com/meltyli/discord-dm-manager/wiki/roadmap

## ⚠️ Please visit the wiki to learn how to use this tool. ⚠️

For full usage instructions and examples, see the project wiki: https://github.com/meltyli/discord-dm-manager/wiki
