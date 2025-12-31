[Discord Direct Message Manager](https://github.com/pironside44/discordreopenalldms) revamped by [melty](https://github.com/meltyli). This script is intended to be used in tandem with [Discord Chat Exporter](https://github.com/Tyrrrz/DiscordChatExporter/).

**Notable recent changes**
- Added options to suppress menu errors, clear the terminal before processing DMs, enhance log/message formatting, integrate user validation into `reopenDM`, show `DRY_RUN` status in the menu title, and improve batch initialization.
- Implemented `DRY_RUN` mode for validation and DM operations, added random delays and improved API delay tracking to reduce throttling, and added atomic writes for `.env` and JSON files.
- Improved `closeAllOpenDMs` to save channel information and updated `id-history.json` structure, added DM state reset after export.
- Added type filters for exporting DMs/GROUP_DMs, improved export logging, moved configuration defaults to `src/lib/config-defaults.js`, and added many reliability fixes.

### Roadmap / Current status
Check out this project's roadmap and feature list: https://github.com/meltyli/discord-dm-manager/wiki/roadmap

## ⚠️ Please [visit the wiki](https://github.com/meltyli/discord-dm-manager/wiki) to learn how to use this tool. ⚠️

For full usage instructions and examples, see the project wiki: https://github.com/meltyli/discord-dm-manager/wiki
