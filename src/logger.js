const fs = require('fs');
const path = require('path');
const { ensureDirectory } = require('./lib/file-utils');

class Logger {
    constructor(logDir = './logs', maxLogFiles = 10) {
        this.logDir = logDir;
        this.maxLogFiles = maxLogFiles;
        this.logStream = null;
        this.currentLogFile = null;
        this.loggingEnabled = true; // Flag to control logging
        
        // Ensure logs directory exists
        ensureDirectory(this.logDir);
        
        // Initialize log file for today (includes rotation)
        this.initializeLogFile();
        
        // Intercept console methods
        this.interceptConsole();
    }
    
    initializeLogFile() {
        // Use local date for filename to match user's timezone
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;
        
        this.currentLogFile = path.join(this.logDir, `${today}.log`);
        
        // Create/touch the file to ensure it exists with current timestamp
        if (!fs.existsSync(this.currentLogFile)) {
            fs.writeFileSync(this.currentLogFile, '');
        } else {
            // Update mtime to ensure it's the newest
            fs.utimesSync(this.currentLogFile, now, now);
        }
        
        this.logStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' });
        
        // Rotate immediately after creating/opening current log
        this.rotateOldLogs();
    }
    
    rotateOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir)
                .filter(f => f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(this.logDir, f),
                    time: fs.statSync(path.join(this.logDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time); // Sort by newest first
            
            // Remove oldest logs if we exceed maxLogFiles
            if (files.length > this.maxLogFiles) {
                const toRemove = files.slice(this.maxLogFiles);
                toRemove.forEach(file => {
                    try {
                        fs.unlinkSync(file.path);
                        this.writeToLog(`[LOGGER] Rotated old log file: ${file.name}`);
                    } catch (error) {
                        // Silently fail if file doesn't exist or can't be deleted
                    }
                });
            }
        } catch (error) {
            // Silently fail if logs directory is empty or doesn't exist
        }
    }
    
    writeToLog(message) {
        if (this.logStream && !this.logStream.destroyed) {
            this.logStream.write(message + '\n');
        }
    }
    
    formatMessage(level, args) {
        const timestamp = new Date().toISOString();
        let message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
        
        // Strip leading/trailing newlines and excessive whitespace
        message = message.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
        
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }
    
    /**
     * Check if message should be logged (skip empty/whitespace-only messages)
     */
    shouldLog(args) {
        if (!args || args.length === 0) return false;
        
        // Join all args and check if result is just whitespace
        const combined = args.map(arg => String(arg)).join('').trim();
        return combined.length > 0;
    }
    
    interceptConsole() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;
        const originalDebug = console.debug;
        
        console.log = (...args) => {
            originalLog.apply(console, args);
            if (this.loggingEnabled && this.shouldLog(args)) {
                this.writeToLog(this.formatMessage('info', args));
            }
        };
        
        console.error = (...args) => {
            originalError.apply(console, args);
            if (this.loggingEnabled && this.shouldLog(args)) {
                this.writeToLog(this.formatMessage('error', args));
            }
        };
        
        console.warn = (...args) => {
            originalWarn.apply(console, args);
            if (this.loggingEnabled && this.shouldLog(args)) {
                this.writeToLog(this.formatMessage('warn', args));
            }
        };
        
        console.info = (...args) => {
            originalInfo.apply(console, args);
            if (this.loggingEnabled && this.shouldLog(args)) {
                this.writeToLog(this.formatMessage('info', args));
            }
        };
        
        console.debug = (...args) => {
            originalDebug.apply(console, args);
            if (this.loggingEnabled && this.shouldLog(args)) {
                this.writeToLog(this.formatMessage('debug', args));
            }
        };
        
        // Handle process exit to close log stream
        process.on('exit', () => this.close());
        process.on('SIGINT', () => {
            this.close();
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            this.close();
            process.exit(0);
        });
    }
    
    /**
     * Write to log file only (without console output)
     * @param {string} message - Message to log
     * @param {string} level - Log level (info, error, warn, debug)
     */
    logOnly(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        this.writeToLog(formattedMessage);
    }

    /**
     * Temporarily pause logging to file
     */
    pause() {
        this.loggingEnabled = false;
    }

    /**
     * Resume logging to file
     */
    resume() {
        this.loggingEnabled = true;
    }

    close() {
        if (this.logStream && !this.logStream.destroyed) {
            this.logStream.end();
        }
    }
}

// Singleton instance
let loggerInstance = null;

function initializeLogger(logDir = './logs', maxLogFiles = 10) {
    if (!loggerInstance) {
        loggerInstance = new Logger(logDir, maxLogFiles);
    }
    return loggerInstance;
}

function getLogger() {
    if (!loggerInstance) {
        loggerInstance = initializeLogger();
    }
    return loggerInstance;
}

module.exports = {
    initializeLogger,
    getLogger,
    Logger
};
