require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Default configurations
const defaultConfig = {
    BATCH_SIZE: 100,
    API_DELAY_MS: 1000,
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
    }

    async init() {
        if (this.initialized) return;

        await this.ensureEnvValues();
        await this.loadConfig();
        await this.validatePaths();
        
        this.initialized = true;
    }

    async loadConfig() {
        try {
            if (fs.existsSync('config.json')) {
                const fileConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));
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
        for (const [key, value] of Object.entries(this.config)) {
            if (value === '' && !process.env[key]) {
                this.config[key] = await this.promptUser(`Enter value for ${key}: `);
            }
        }
        this.saveConfig();
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
        fs.writeFileSync('config.json', JSON.stringify(this.config, null, 2));
    }

    updateEnvFile() {
        const envLines = Object.entries(this.env)
            .filter(([key, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`);

        if (!fs.existsSync('.env')) {
            fs.writeFileSync('.env', envLines.join('\n'));
        } else {
            const existingEnv = fs.readFileSync('.env', 'utf-8')
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
            fs.writeFileSync('.env', updatedEnvLines.join('\n'));
        }
    }

    async promptUser(query) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise(resolve => rl.question(query, answer => {
            rl.close();
            resolve(answer);
        }));
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