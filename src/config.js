const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', 'config', '.env') });
const { initializeLogger } = require('./logger');

// Initialize logger early to capture all output
initializeLogger('./logs', 10);

// Config directory path
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE_PATH = path.join(CONFIG_DIR, 'config.json');
const ENV_FILE_PATH = path.join(CONFIG_DIR, '.env');

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
    EXPORT_PATH: '',
    DCE_PATH: '',
    DRY_RUN: false
};

// Required environment variables template
const envTemplate = {
    AUTHORIZATION_TOKEN: '',
    USER_DISCORD_ID: ''
};

class ConfigManager {
    constructor() {
        this.config = { ...defaultConfig };
        this.env = { ...envTemplate };
        this.initialized = false;
        this.rl = null; // Shared readline interface from app
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
        // Only close if we created it
        if (this.rl && this.ownsReadline) {
            this.rl.close();
            this.rl = null;
            this.ownsReadline = false;
        }
    }

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
            if (!fs.existsSync(CONFIG_DIR)) {
                fs.mkdirSync(CONFIG_DIR, { recursive: true });
            }

            if (fs.existsSync(CONFIG_FILE_PATH)) {
                const fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
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
            const packagePath = await this.promptUser('Enter Discord data package directory path: ');
            // Remove quotes and trim
            this.config.DATA_PACKAGE_FOLDER = packagePath.trim().replace(/^['"]|['"]$/g, '');
            
            // Verify path exists
            if (!fs.existsSync(this.config.DATA_PACKAGE_FOLDER)) {
                throw new Error(`Data package directory does not exist: ${this.config.DATA_PACKAGE_FOLDER}`);
            }
            
            // Verify it has messages folder
            const messagesPath = path.join(this.config.DATA_PACKAGE_FOLDER, 'messages');
            if (!fs.existsSync(messagesPath)) {
                throw new Error(`Messages folder not found in data package: ${messagesPath}`);
            }
        }

        // Step 2: Read user.json and verify user ID
        await this.verifyUserId();

        // Step 3: Fill in remaining config values
        for (const [key, value] of Object.entries(this.config)) {
            if (value === '' && !process.env[key] && key !== 'DATA_PACKAGE_FOLDER') {
                this.config[key] = await this.promptUser(`Enter value for ${key}: `);
            }
        }
        this.saveConfig();
    }

    async verifyUserId() {
        const userJsonPath = path.join(this.config.DATA_PACKAGE_FOLDER, 'account', 'user.json');
        
        if (!fs.existsSync(userJsonPath)) {
            console.warn(`Warning: user.json not found at ${userJsonPath}`);
            return;
        }

        try {
            const userData = JSON.parse(fs.readFileSync(userJsonPath, 'utf8'));
            const packageUserId = userData.id;
            const packageUsername = userData.username;
            
            console.log(`\nFound user in data package: ${packageUsername} (ID: ${packageUserId})`);
            
            // Prompt for user ID
            const providedUserId = await this.promptUser(`Provide user ID for user ${packageUsername}: `);
            
            // Compare IDs
            if (providedUserId.trim() !== packageUserId) {
                console.warn(`\n⚠️  WARNING: The provided ID (${providedUserId}) doesn't match the data package ID (${packageUserId})`);
                const proceed = await this.promptUser('Are you sure you want to proceed? (yes/no): ');
                
                if (proceed.toLowerCase() !== 'yes' && proceed.toLowerCase() !== 'y') {
                    throw new Error('User ID verification failed. Setup cancelled.');
                }
            } else {
                console.log('✓ User ID verified successfully!');
            }
            
            // Store the verified ID
            this.env.USER_DISCORD_ID = providedUserId.trim();
            process.env.USER_DISCORD_ID = providedUserId.trim();
            
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
            if (!fs.existsSync(pathValue)) {
                console.warn(`Path ${pathKey} (${pathValue}) does not exist`);
                const newPath = await this.promptUser(`Enter valid path for ${pathKey}: `);
                this.config[pathKey] = newPath;
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
                const value = await this.promptUser(`Enter value for ${key}: `);
                this.env[key] = value.trim();
                process.env[key] = value.trim();
            } else {
                this.env[key] = process.env[key].trim();
            }
        }
        this.updateEnvFile();
    }

    saveConfig() {
        // Ensure config directory exists
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(this.config, null, 2));
    }

    updateEnvFile() {
        // Ensure config directory exists
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }

        const envLines = Object.entries(this.env)
            .filter(([key, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`);

        if (!fs.existsSync(ENV_FILE_PATH)) {
            fs.writeFileSync(ENV_FILE_PATH, envLines.join('\n'));
        } else {
            const existingEnv = fs.readFileSync(ENV_FILE_PATH, 'utf-8')
                .split('\n')
                .reduce((acc, line) => {
                    if (line.trim()) {
                        const [key, value] = line.split('=');
                        acc[key] = value;
                    }
                    return acc;
                }, {});

            for (const [key, value] of Object.entries(this.env)) {
                if (value !== undefined) {
                    existingEnv[key] = value;
                }
            }

            const updatedEnvLines = Object.entries(existingEnv)
                .map(([key, value]) => `${key}=${value}`);
            fs.writeFileSync(ENV_FILE_PATH, updatedEnvLines.join('\n'));
        }
    }

    async promptUser(query) {
        const rl = this.initReadline();

        return new Promise(resolve => {
            rl.question(query, answer => {
                resolve(answer);
            });
        });
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
}

// only create the instance if not testing
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