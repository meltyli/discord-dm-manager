# ⚠️⚠️ Please [visit the wiki](https://github.com/meltyli/discord-dm-manager/wiki) to learn how to use this tool. ⚠️⚠️

Dscord Direct Message Manager revamped by melty. This script is intended to be used in tandem with [Discord Chat Exporter](https://github.com/Tyrrrz/DiscordChatExporter/).

### Roadmap/Future features:
- ✅~~add env file for better security~~
- add choosing a script file for using with Discord Chat Exporter(?)
- ✅~~since punycode is discontinued, it should be replaced with something current~~
- ✅~~update wiki to be in line with current features~~
- ✅~~add error checking when .env file does not exist or broken~~
- add deleted user checker to skip if user is deleted
- when closing dm, write it to closeddm.json or something. Afterwards when reopening, drop the ID from the list (ensure all DM are recoverable)
- ✅~~only open a safe number of messages each batch `{max limit(~150)} - {some buffer(10)} - {count of open group chats}`~~
- ✅~~optimise the menu layout~~
- Automatic archival workflow (export → close → mark as archived)
- Multi-user support (manage multiple Discord accounts)
- move config defaults from config.js to config-defaults.js
- add some package inspection tools that expose basic stats (eg. group_dm count, dm count, etc.)
