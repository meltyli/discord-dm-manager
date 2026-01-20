const { yellow, reset } = require('../lib/colors');

function displaySettings(options) {
}

function displayDetailedConfig(options) {
    console.log('\nSettings:');
    console.log(`  DRY_RUN: ${yellow}${options.DRY_RUN}${reset}`);
    console.log(`  BATCH_SIZE: ${yellow}${options.BATCH_SIZE}${reset}`);
    console.log(`  API_DELAY_MS: ${yellow}${options.API_DELAY_MS}${reset}`);
    console.log(`  RATE_LIMIT: ${yellow}${options.RATE_LIMIT_REQUESTS}${reset} req/${yellow}${options.RATE_LIMIT_INTERVAL_MS}${reset}ms`);
    console.log('\nAuthentication:');
    console.log(`  AUTHORIZATION_TOKEN: ${yellow}${process.env.AUTHORIZATION_TOKEN ? '***set***' : 'Not set'}${reset}`);
    console.log(`  USER_DISCORD_ID: ${yellow}${process.env.USER_DISCORD_ID || 'Not set'}${reset}`);
}

function getDryRunTitle(options) {
    return options && options.DRY_RUN ? '[Dry run: ENABLED]' : '';
}

module.exports = {
    displaySettings,
    displayDetailedConfig,
    getDryRunTitle
};
