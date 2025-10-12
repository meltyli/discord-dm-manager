const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', 'config', '.env') });
const { initializeLogger } = require('./logger');
const { ensureDirectory, resolveConfigPath, readJsonFile, writeJsonFile, ensureExportPath, validatePathExists } = require('./lib/file-utils');
const { promptUser, cleanInput, promptConfirmation } = require('./lib/cli-helpers');

// Initialize logger early to capture all output
initializeLogger('./logs', 10);

// Config directory path
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE_PATH = resolveConfigPath('config.json');
const ENV_FILE_PATH = resolveConfigPath('.env');

// Default configurations
const defaultConfig = {
    BATCH_SIZE: 100,
    API_DELAY_MS: 100,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 5000,
    RATE_LIMIT_REQUESTS: 50,
    RATE_LIMIT_INTERVAL_MS: 60000,
    LOG_LEVEL: 'info',
    DATA_PACKAGE_FOLDER: '',
    EXPORT_PATH: 'export',
    DCE_PATH: '',
    DRY_RUN: false
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
        this.rl = null; // Shared readline interface from app
        this.ownsReadline = false; // Track if we created it
    }

    /**
     * Sets an external readline interface (from app.js)
     * @param {readline.Interface} readlineInterface - Readline interface to use
     */
    setReadline(readlineInterface) {
        this.rl = readlineInterface;
        this.ownsReadline = false;
    }

    /**
     * Initializes readline interface if not already set
     * @returns {readline.Interface} Readline interface
     */
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

    /**
     * Closes readline interface only if created by ConfigManager
     */
    closeReadline() {
        // Only close if we created it
        if (this.rl && this.ownsReadline) {
            this.rl.close();
            this.rl = null;
            this.ownsReadline = false;
        }
    }

    /**
     * Initializes configuration by loading files and prompting for missing values
     * @returns {Promise<void>}
     */
    async init() {
        if (this.initialized) return;

        try {
            await this.loadConfig();
            await this.ensureEnvValues();
            await this.validatePaths();
            
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
        // Step 1: Ask for data package directory first
        if (!this.config.DATA_PACKAGE_FOLDER || this.config.DATA_PACKAGE_FOLDER === '') {
            const packagePath = await promptUser('Enter Discord data package directory path: ', this.rl);
            this.config.DATA_PACKAGE_FOLDER = cleanInput(packagePath);
            
            // Verify path exists
            validatePathExists(this.config.DATA_PACKAGE_FOLDER, 'Data package directory', true);
            
            // Verify it has messages folder
            const messagesPath = path.join(this.config.DATA_PACKAGE_FOLDER, 'messages');
            validatePathExists(messagesPath, 'Messages folder', true);
        }

        // Step 2: Read user.json and verify user ID
        await this.verifyUserId();

        // Step 3: Fill in remaining config values
        for (const [key, value] of Object.entries(this.config)) {
            if (value === '' && !process.env[key] && key !== 'DATA_PACKAGE_FOLDER') {
                const answer = await promptUser(`Enter value for ${key}: `, this.rl);
                const cleaned = cleanInput(answer);
                
                // If EXPORT_PATH left empty, default to repo-relative 'export'
                if (key === 'EXPORT_PATH') {
                    this.config[key] = ensureExportPath(cleaned);
                } else {
                    this.config[key] = cleaned;
                }
            }
        }
        this.saveConfig();
    }

    async verifyUserId() {
        const userJsonPath = path.join(this.config.DATA_PACKAGE_FOLDER, 'account', 'user.json');
        
        if (!validatePathExists(userJsonPath, 'user.json')) {
            console.warn(`Warning: user.json not found at ${userJsonPath}`);
            return;
        }

        try {
            const userData = readJsonFile(userJsonPath);
            if (!userData) {
                console.warn(`Could not read user.json at ${userJsonPath}`);
                return;
            }
            
            const packageUserId = userData.id;
            const packageUsername = userData.username;
            
            console.log(`\nFound user in data package: ${packageUsername} (ID: ${packageUserId})`);
            
            // Prompt for user ID
            const providedUserId = cleanInput(await promptUser(`Provide user ID for user ${packageUsername}: `, this.rl));
            
            // Compare IDs
            if (providedUserId !== packageUserId) {
                console.warn(`\nWARNING: The provided ID (${providedUserId}) doesn't match the data package ID (${packageUserId})`);
                
                if (!await promptConfirmation('Are you sure you want to proceed? (yes/no): ', this.rl)) {
                    throw new Error('User ID verification failed. Setup cancelled.');
                }
            } else {
                console.log('✓ User ID verified successfully!');
            }
            
            // Store the verified ID
            this.env.USER_DISCORD_ID = providedUserId;
            process.env.USER_DISCORD_ID = providedUserId;
            
        } catch (error) {
            if (error.message.includes('Setup cancelled')) {
                throw error;
            }
            console.error(`Error reading user.json: ${error.message}`);
        }
    }

    async validatePaths() {
        const pathsToCheck = ['DATA_PACKAGE_FOLDER', 'EXPORT_PATH', 'DCE_PATH'];
        
        for (const pathKey of pathsToCheck) {
            const pathValue = this.config[pathKey];
            if (!validatePathExists(pathValue, pathKey)) {
                console.warn(`Path ${pathKey} (${pathValue}) does not exist`);
                const newPath = await promptUser(`Enter valid path for ${pathKey}: `, this.rl);
                const cleaned = cleanInput(newPath);
                
                // If EXPORT_PATH left empty during validation, default to 'export'
                if (pathKey === 'EXPORT_PATH') {
                    this.config[pathKey] = ensureExportPath(cleaned);
                } else {
                    this.config[pathKey] = cleaned;
                }
                this.saveConfig();
            }
        }
    }

    async ensureEnvValues() {
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
    }

    saveConfig() {
        ensureDirectory(CONFIG_DIR);
        writeJsonFile(CONFIG_FILE_PATH, this.config);
    }

    updateEnvFile() {
        ensureDirectory(CONFIG_DIR);

        const envLines = Object.entries(this.env)
            .filter(([key, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`);

        let existingEnv = {};
        
        if (validatePathExists(ENV_FILE_PATH)) {
            existingEnv = fs.readFileSync(ENV_FILE_PATH, 'utf-8')
                .split('\n')
                .reduce((acc, line) => {
                    if (line.trim()) {
                        const [key, value] = line.split('=');
                        acc[key] = value;
                    }
                    return acc;
                }, {});
        }

        for (const [key, value] of Object.entries(this.env)) {
            if (value !== undefined) {
                existingEnv[key] = value;
            }
        }

        const updatedEnvLines = Object.entries(existingEnv)
            .map(([key, value]) => `${key}=${value}`);
        fs.writeFileSync(ENV_FILE_PATH, updatedEnvLines.join('\n'));
    }

    /**
     * Gets a configuration value from config.json
     * @param {string} key - Configuration key
     * @returns {any} Configuration value
     */
    get(key) {
        return this.config[key];
    }

    /**
     * Gets an environment variable value from .env
     * @param {string} key - Environment variable key
     * @returns {string} Environment variable value
     */
    getEnv(key) {
        return this.env[key];
    }

    /**
     * Sets a configuration value and saves to config.json
     * @param {string} key - Configuration key
     * @param {any} value - Value to set
     */
    set(key, value) {
        this.config[key] = value;
        this.saveConfig();
    }

    /**
     * Resets configuration to default values and clears environment variables
     */
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

// only create the instance if not testing
let configManagerInstance = null;

/**
 * Gets singleton instance of ConfigManager
 * @returns {ConfigManager} ConfigManager instance
 */
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