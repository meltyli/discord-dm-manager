const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', 'config', '.env') });
const { initializeLogger } = require('./logger');
const { ensureDirectory, resolveConfigPath, readJsonFile, writeJsonFile } = require('./lib/file-utils');
const { validatePathExists, validateDataPackage } = require('./lib/validators');
const { promptUser, cleanInput } = require('./lib/cli-helpers');
const { verifyUserId, validateConfigPaths } = require('./lib/config-validators');
const { resolveExportPath, promptForConfigValue } = require('./lib/config-defaults');

// Initialize logger early to capture all output
initializeLogger('./logs', 10);

// Config directory path
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE_PATH = resolveConfigPath('config.json');
const ENV_FILE_PATH = resolveConfigPath('.env');

// Detect if running in Docker and set appropriate default
const IS_DOCKER = fs.existsSync('/.dockerenv');
const DEFAULT_DATA_PACKAGE_DIR = IS_DOCKER 
    ? '/data/package'  // Docker mounted path
    : path.join(__dirname, '..', 'data', 'package');  // Local development path

// Default configurations (Docker paths)
const defaultConfig = {
    BATCH_SIZE: 20,
    API_DELAY_MS: 100,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 5000,
    RATE_LIMIT_REQUESTS: 40,
    RATE_LIMIT_INTERVAL_MS: 1000,
    DATA_PACKAGE_FOLDER: '/data/package',
    EXPORT_PATH: '/app/export',
    DCE_PATH: '/app/dce/DiscordChatExporter.Cli',
    DRY_RUN: false,
    SUPPRESS_MENU_ERRORS: false
};

// Required environment variables template
const envTemplate = {
    AUTHORIZATION_TOKEN: '',
    USER_DISCORD_ID: ''
};

/**
 * Manages configuration from config.json and .env files
 */
class ConfigManager {
    constructor() {
        this.config = { ...defaultConfig };
        this.env = { ...envTemplate };
        this.initialized = false;
        this.rl = null; // Shared readline interface from menu-main
        this.ownsReadline = false; // Track if we created it
    }

    setReadline(readlineInterface) {
        this.rl = readlineInterface;
        this.ownsReadline = false;
    }

    initReadline() {
        if (!this.rl) {
            this.rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            this.ownsReadline = true;
        }
        return this.rl;
    }

    closeReadline() {
        if (this.rl && this.ownsReadline) {
            this.rl.close();
            this.rl = null;
            this.ownsReadline = false;
        }
    }

    async init() {
        if (this.initialized) return;

        try {
            this.initReadline(); // Initialize readline for prompts
            await this.loadConfig();
            await this.validatePaths();
            await this.ensureEnvValues();
            
            this.initialized = true;
        } finally {
            this.closeReadline(); // Only closes if we created it
        }
    }

    async loadConfig() {
        try {
            // Ensure config directory exists
            ensureDirectory(CONFIG_DIR);

            const fileConfig = readJsonFile(CONFIG_FILE_PATH);
            if (fileConfig) {
                this.config = { ...defaultConfig, ...fileConfig };
            } else {
                console.warn('No config.json found, creating with default values...');
                await this.createConfigFile();
            }
        } catch (error) {
            console.error(`Error handling config.json: ${error.message}`);
            throw error;
        }
    }

    async createConfigFile() {
        console.log('\nSetting up configuration...');
        console.log('\nPaths are pre-configured for Docker:');
        console.log(`  Data Package: ${this.config.DATA_PACKAGE_FOLDER}`);
        console.log(`  Export Path: ${this.config.EXPORT_PATH}`);
        console.log(`  DCE Path: ${this.config.DCE_PATH}`);
        
        const pathKeys = ['DATA_PACKAGE_FOLDER', 'EXPORT_PATH', 'DCE_PATH'];
        for (const [key, value] of Object.entries(this.config)) {
            if (value === '' && !process.env[key] && !pathKeys.includes(key)) {
                this.config[key] = await promptForConfigValue(key, value, this.rl);
            }
        }
        this.saveConfig();
    }

    async validatePaths() {
        // Special handling for DATA_PACKAGE_FOLDER
        await this.validateDataPackageFolder();
        
        const pathsToCheck = ['DATA_PACKAGE_FOLDER', 'EXPORT_PATH', 'DCE_PATH'];
        const updated = await validateConfigPaths(this.config, pathsToCheck, this.rl, resolveExportPath);
        
        if (updated) {
            this.saveConfig();
        }
        
        // After paths are validated, verify user ID from data package
        if (validatePathExists(this.config.DATA_PACKAGE_FOLDER)) {
            const existingUserId = process.env.USER_DISCORD_ID || null;
            const verifiedUserId = await verifyUserId(this.config.DATA_PACKAGE_FOLDER, this.rl, existingUserId);
            if (verifiedUserId) {
                this.env.USER_DISCORD_ID = verifiedUserId;
                process.env.USER_DISCORD_ID = verifiedUserId;
            }
        }
    }

    async validateDataPackageFolder() {
        // Ensure default directory exists
        ensureDirectory(DEFAULT_DATA_PACKAGE_DIR);
        
        const dataPackagePath = DEFAULT_DATA_PACKAGE_DIR;
        
        // Check if path exists and is valid
        if (validatePathExists(dataPackagePath)) {
            try {
                validateDataPackage(dataPackagePath);
                this.config.DATA_PACKAGE_FOLDER = dataPackagePath;
                this.saveConfig();
                return true;
            } catch (error) {
                console.warn(`\nWarning: Data package at ${dataPackagePath} is invalid: ${error.message}`);
            }
        }
        
        // Show setup instructions if not valid
        console.log('\n' + '='.repeat(60));
        console.log('Discord Data Package Not Found');
        console.log('='.repeat(60));
        console.log(`\nExpected location: ${dataPackagePath}`);
        
        if (IS_DOCKER) {
            console.log('\nDocker Setup Instructions:');
            console.log('1. Extract your Discord data package on your host machine');
            console.log('2. Place the contents in: ./data/package/');
            console.log('   (It should contain: messages/, account/, servers/, etc.)');
            console.log('\n3. If using a custom location, edit docker-compose.yml:');
            console.log('   volumes:');
            console.log('     - /your/custom/path:/data/package');
            console.log('4. Rebuild: docker-compose down && docker-compose build');
            console.log('\n5. Use "Check Data Package" in Configuration menu to verify');
        } else {
            console.log('\nSetup Instructions:');
            console.log('1. Download your Discord data package from Discord settings');
            console.log('2. Extract it to: ' + dataPackagePath);
            console.log('   (It should contain: messages/, account/, servers/, etc.)');
            console.log('\n3. Use "Check Data Package" in Configuration menu to verify');
        }
        
        console.log('\nNote: You can still access Configuration menu, but');
        console.log('      export functions will not work until the data package is found.');
        
        this.config.DATA_PACKAGE_FOLDER = dataPackagePath;
        this.saveConfig();
        return false;
    }

    async ensureEnvValues() {
        console.log('\n' + '='.repeat(60));
        console.log('Configure authentication');
        console.log('='.repeat(60));
        
        for (const [key, defaultValue] of Object.entries(envTemplate)) {
            // Skip USER_DISCORD_ID if already set during verification
            if (key === 'USER_DISCORD_ID' && process.env[key]) {
                this.env[key] = process.env[key].trim();
                continue;
            }
            
            if (!process.env[key]) {
                const value = await promptUser(`Enter value for ${key}: `, this.rl);
                const cleanValue = cleanInput(value);
                this.env[key] = cleanValue;
                process.env[key] = cleanValue;
            } else {
                this.env[key] = process.env[key].trim();
            }
        }
        this.updateEnvFile();
        
        console.log('\n✓ Configuration complete!\n');
    }

    saveConfig() {
        ensureDirectory(CONFIG_DIR);
        writeJsonFile(CONFIG_FILE_PATH, this.config);
    }

    updateEnvFile() {
        ensureDirectory(CONFIG_DIR);

        let existingEnv = {};
        if (validatePathExists(ENV_FILE_PATH)) {
            existingEnv = fs.readFileSync(ENV_FILE_PATH, 'utf-8')
                .split('\n')
                .reduce((acc, line) => {
                    if (line.trim() && line.includes('=')) {
                        const [key, value] = line.split('=');
                        acc[key] = value;
                    }
                    return acc;
                }, {});
        }

        Object.assign(existingEnv, this.env);

        const envContent = Object.entries(existingEnv)
            .filter(([_, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        const tempFile = `${ENV_FILE_PATH}.tmp.${Date.now()}`;
        try {
            fs.writeFileSync(tempFile, envContent);
            fs.renameSync(tempFile, ENV_FILE_PATH);
        } catch (error) {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
            throw new Error(`Failed to update .env file: ${error.message}`);
        }
    }

    get(key) {
        return this.config[key];
    }

    getEnv(key) {
        return this.env[key];
    }

    set(key, value) {
        this.config[key] = value;
        this.saveConfig();
    }

    resetToDefault() {
        // Reset config to defaults
        this.config = { ...defaultConfig };
        this.saveConfig();

        // Clear environment variables
        this.env = { ...envTemplate };
        try {
            fs.unlinkSync(ENV_FILE_PATH);
        } catch (error) {
            // File may not exist, which is fine
            if (error.code !== 'ENOENT') {
                console.error(`Error deleting .env file: ${error.message}`);
            }
        }
        
        // Clear process.env
        delete process.env.AUTHORIZATION_TOKEN;
        delete process.env.USER_DISCORD_ID;

        // Mark as not initialized so user must reconfigure
        this.initialized = false;
        
        console.log('Configuration reset to default values.');
    }
}

let configManagerInstance = null;

function getConfigManager() {
    if (!configManagerInstance) {
        configManagerInstance = new ConfigManager();
    }
    return configManagerInstance;
}

module.exports = {
    getConfigManager,
    defaultConfig,
    envTemplate
};