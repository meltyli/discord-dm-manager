# ⚠️⚠️ Please [visit the wiki](https://github.com/meltyli/discord-dm-manager/wiki) to learn how to use this tool. ⚠️⚠️

Discord Direct Message Manager revamped by melty. This script is intended to be used in tandem with [Discord Chat Exporter](https://github.com/Tyrrrz/DiscordChatExporter/).

**Notable recent changes**
- **Dec 31, 2025:** Added options to suppress menu errors, clear the terminal before processing DMs, enhance log/message formatting, integrate user validation into `reopenDM`, show `DRY_RUN` status in the menu title, and improve batch initialization.
- **Dec 30, 2025:** Implemented `DRY_RUN` mode for validation and DM operations, added random delays and improved API delay tracking to reduce throttling, and added atomic writes for `.env` and JSON files.
- **Oct 16, 2025:** Improved `closeAllOpenDMs` to save channel information and updated `id-history.json` structure, added DM state reset after export.
- **Oct 13, 2025:** Added type filters for exporting DMs/GROUP_DMs, improved export logging, moved configuration defaults to `src/lib/config-defaults.js`, and added many reliability fixes.

### Roadmap / Current status
- [x] add env file for better security
- [ ] add choosing a script file for using with Discord Chat Exporter(?)
- [x] since punycode is discontinued, it should be replaced with something current
- [x] update wiki to be in line with current features
- [x] add error checking when .env file does not exist or is broken
- [ ] add deleted user checker to skip if user is deleted
- [x] when closing DM, save channel information / update id-history.json
- [x] only open a safe number of messages each batch (`max limit (~150)` - `buffer (10)` - `open group chats`)
- [x] optimise the menu layout and formatting
- [ ] Automatic archival workflow (export → close → mark as archived)
- [ ] Multi-user support (manage multiple Discord accounts)
- [x] move config defaults from `config.js` to `config-defaults.js`
- [ ] add package inspection tools (e.g., group_dm count, dm count)
- [ ] add auto update (download latest release, extract and replace src files)
- [ ] update to API v10

If you'd like, I can also:
- add a short CHANGELOG file summarising the commits
- open a PR with these docs changes

For full usage instructions and examples, see the project wiki: https://github.com/meltyli/discord-dm-manager/wiki
