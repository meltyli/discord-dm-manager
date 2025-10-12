const { getConfigManager } = require('../src/config');
const { getCurrentOpenDMs } = require('../src/discord-api');

(async () => {
  try {
    const configManager = getConfigManager();
    await configManager.init();

    const token = configManager.getEnv('AUTHORIZATION_TOKEN') || process.env.AUTHORIZATION_TOKEN;
    if (!token) {
      console.error('No AUTHORIZATION_TOKEN found in config/.env or process.env');
      process.exit(1);
    }

    const dms = await getCurrentOpenDMs(token, console.log);
    console.log('Open DMs count:', Array.isArray(dms) ? dms.length : 'not an array');
    console.log(JSON.stringify(dms, null, 2).slice(0, 2000)); // print up to 2000 chars
  } catch (err) {
    console.error('Test failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
