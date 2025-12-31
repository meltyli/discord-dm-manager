/**
 * Shared menu display utilities
 */

function displaySettings(options) {
}

function displayDetailedConfig(options) {
    console.log('\nPath Settings:');
    console.log(`  DATA_PACKAGE_FOLDER: ${options.DATA_PACKAGE_FOLDER || 'Not set'}`);
    console.log(`  EXPORT_PATH: ${options.EXPORT_PATH || 'Not set'}`);
    console.log(`  DCE_PATH: ${options.DCE_PATH || 'Not set'}`);
    console.log('\nAdvanced Settings:');
    console.log(`  BATCH_SIZE: ${options.BATCH_SIZE}`);
    console.log(`  API_DELAY_MS: ${options.API_DELAY_MS}`);
    console.log(`  RATE_LIMIT: ${options.RATE_LIMIT_REQUESTS} req/${options.RATE_LIMIT_INTERVAL_MS}ms`);
    console.log('\nEnvironment Variables:');
    console.log(`  AUTHORIZATION_TOKEN: ${process.env.AUTHORIZATION_TOKEN ? '***set***' : 'Not set'}`);
    console.log(`  USER_DISCORD_ID: ${process.env.USER_DISCORD_ID || 'Not set'}`);
}

function displayAdvancedSettings(options) {
    console.log('\nAdvanced Settings');
    console.log('=================');
    console.log('Caution: These settings affect API behavior. Modify carefully.');
    console.log('http://discord.com/developers/docs/topics/rate-limits#global-rate-limit');
    console.log('\nCurrent Values:');
    console.log(`  Batch Size: ${options.BATCH_SIZE}`);
    console.log(`  API Delay: ${options.API_DELAY_MS}ms`);
    console.log(`  Rate Limit: ${options.RATE_LIMIT_REQUESTS} requests per ${options.RATE_LIMIT_INTERVAL_MS}ms`);
}

function getDryRunTitle(options) {
    return options && options.DRY_RUN ? '[Dry run: ENABLED]' : '';
}

module.exports = {
    displaySettings,
    displayDetailedConfig,
    displayAdvancedSettings,
    getDryRunTitle
};
