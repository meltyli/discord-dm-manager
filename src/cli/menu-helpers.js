function displaySettings(options) {
}

function displayDetailedConfig(options) {
    console.log('\nSettings:');
    console.log(`  DRY_RUN: ${options.DRY_RUN}`);
    console.log(`  BATCH_SIZE: ${options.BATCH_SIZE}`);
    console.log(`  API_DELAY_MS: ${options.API_DELAY_MS}`);
    console.log(`  RATE_LIMIT: ${options.RATE_LIMIT_REQUESTS} req/${options.RATE_LIMIT_INTERVAL_MS}ms`);
    console.log('\nAuthentication:');
    console.log(`  AUTHORIZATION_TOKEN: ${process.env.AUTHORIZATION_TOKEN ? '***set***' : 'Not set'}`);
    console.log(`  USER_DISCORD_ID: ${process.env.USER_DISCORD_ID || 'Not set'}`);
}

function getDryRunTitle(options) {
    return options && options.DRY_RUN ? '[Dry run: ENABLED]' : '';
}

module.exports = {
    displaySettings,
    displayDetailedConfig,
    getDryRunTitle
};
