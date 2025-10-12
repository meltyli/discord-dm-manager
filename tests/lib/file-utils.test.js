const fs = require('fs');
const path = require('path');
const { 
    traverseDataPackage, 
    getRecipients,
    ensureDirectory,
    validatePathExists,
    resolveConfigPath,
    ensureExportPath,
    readJsonFile,
    writeJsonFile,
    validateRequiredConfig,
    validateDCEPath
} = require('../../src/lib/file-utils');

describe('traverseDataPackage', () => {
    test('should find all channel.json files in test package', () => {
        const testPackagePath = path.join(__dirname, '..', 'fixtures', 'test_package', 'messages');
        const channelPaths = traverseDataPackage(testPackagePath);
        
        expect(channelPaths.length).toBeGreaterThan(0);
        channelPaths.forEach(filePath => {
            expect(filePath).toContain('channel.json');
            expect(fs.existsSync(filePath)).toBe(true);
        });
    });

    test('should throw error for non-existent directory', () => {
        expect(() => {
            traverseDataPackage('/non/existent/path');
        }).toThrow();
    });
});

describe('getRecipients', () => {
    test('should extract unique recipients from DM channels', () => {
        const testPackagePath = path.join(__dirname, '..', 'fixtures', 'test_package', 'messages');
        const channelPaths = traverseDataPackage(testPackagePath);
        const myDiscordId = '123456789';
        
        const recipients = getRecipients(channelPaths, myDiscordId);
        
        expect(Array.isArray(recipients)).toBe(true);
        expect(recipients.length).toBeGreaterThanOrEqual(0);
        // Should not include the user's own ID
        expect(recipients).not.toContain(myDiscordId);
    });

    test('should return empty array for empty channel list', () => {
        const recipients = getRecipients([], '123456789');
        expect(recipients).toEqual([]);
    });

    test('should handle invalid JSON gracefully', () => {
        // Create a temporary invalid channel.json file
        const tempDir = path.join(__dirname, '..', 'fixtures', 'temp_test');
        const tempFile = path.join(tempDir, 'channel.json');
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        fs.writeFileSync(tempFile, 'invalid json');
        
        const recipients = getRecipients([tempFile], '123456789');
        
        // Should return empty array and not throw
        expect(recipients).toEqual([]);
        
        // Cleanup
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
    });
});

describe('ensureDirectory', () => {
    const testDir = path.join(__dirname, '..', 'fixtures', 'test_dir_creation');

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    test('creates directory if it does not exist', () => {
        ensureDirectory(testDir);
        expect(fs.existsSync(testDir)).toBe(true);
    });

    test('does not throw if directory already exists', () => {
        fs.mkdirSync(testDir, { recursive: true });
        expect(() => ensureDirectory(testDir)).not.toThrow();
    });

    test('creates nested directories recursively', () => {
        const nestedDir = path.join(testDir, 'nested', 'deep');
        ensureDirectory(nestedDir);
        expect(fs.existsSync(nestedDir)).toBe(true);
    });
});

describe('validatePathExists', () => {
    test('returns true for existing path', () => {
        const existingPath = __dirname;
        expect(validatePathExists(existingPath, 'testPath')).toBe(true);
    });

    test('returns false for non-existing path', () => {
        expect(validatePathExists('/non/existent/path', 'testPath')).toBe(false);
    });

    test('throws error when throwOnError is true and path does not exist', () => {
        expect(() => {
            validatePathExists('/non/existent/path', 'testPath', true);
        }).toThrow('testPath does not exist');
    });
});

describe('resolveConfigPath', () => {
    test('returns absolute path to config file', () => {
        const configPath = resolveConfigPath('config.json');
        expect(path.isAbsolute(configPath)).toBe(true);
        expect(configPath).toContain('config');
        expect(configPath).toContain('config.json');
    });
});

describe('readJsonFile', () => {
    const testFile = path.join(__dirname, '..', 'fixtures', 'test_read.json');
    const testData = { test: 'data', number: 42 };

    beforeEach(() => {
        fs.writeFileSync(testFile, JSON.stringify(testData));
    });

    afterEach(() => {
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    test('reads and parses JSON file', () => {
        const result = readJsonFile(testFile);
        expect(result).toEqual(testData);
    });

    test('returns default value for non-existent file', () => {
        const result = readJsonFile('/non/existent.json', { default: true });
        expect(result).toEqual({ default: true });
    });

    test('returns null by default for non-existent file', () => {
        const result = readJsonFile('/non/existent.json');
        expect(result).toBeNull();
    });
});

describe('writeJsonFile', () => {
    const testFile = path.join(__dirname, '..', 'fixtures', 'test_write_dir', 'test_write.json');
    const testData = { test: 'data', number: 42 };

    afterEach(() => {
        const dir = path.dirname(testFile);
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true });
        }
    });

    test('writes JSON file with formatting', () => {
        writeJsonFile(testFile, testData);
        expect(fs.existsSync(testFile)).toBe(true);
        
        const content = fs.readFileSync(testFile, 'utf8');
        expect(JSON.parse(content)).toEqual(testData);
    });

    test('creates directory if it does not exist', () => {
        writeJsonFile(testFile, testData);
        expect(fs.existsSync(path.dirname(testFile))).toBe(true);
    });
});

describe('ensureExportPath', () => {
    const testExportPath = path.join(__dirname, '..', 'fixtures', 'test_export');

    afterEach(() => {
        if (fs.existsSync(testExportPath)) {
            fs.rmSync(testExportPath, { recursive: true });
        }
    });

    test('defaults empty string to "export"', () => {
        const result = ensureExportPath('');
        expect(result).toBe('export');
    });

    test('cleans quotes from path', () => {
        const result = ensureExportPath('"test_path"');
        expect(result).toBe('test_path');
    });

    test('returns cleaned path', () => {
        const result = ensureExportPath('  test_path  ');
        expect(result).toBe('test_path');
    });
});

describe('validateRequiredConfig', () => {
    test('does not throw for valid value', () => {
        expect(() => {
            validateRequiredConfig('/valid/path', 'TEST_PATH', 'test path');
        }).not.toThrow();
    });

    test('throws for undefined value', () => {
        expect(() => {
            validateRequiredConfig(undefined, 'TEST_PATH', 'test path');
        }).toThrow('TEST_PATH not configured');
    });

    test('throws for null value', () => {
        expect(() => {
            validateRequiredConfig(null, 'TEST_PATH', 'test path');
        }).toThrow('TEST_PATH not configured');
    });

    test('throws for empty string', () => {
        expect(() => {
            validateRequiredConfig('', 'TEST_PATH', 'test path');
        }).toThrow('TEST_PATH not configured');
    });

    test('includes friendly name in error message', () => {
        expect(() => {
            validateRequiredConfig(null, 'DCE_PATH', 'Discord Chat Exporter path');
        }).toThrow('Please configure Discord Chat Exporter path in Configuration menu');
    });
});

describe('validateDCEPath', () => {
    test('throws for undefined path', () => {
        expect(() => {
            validateDCEPath(undefined);
        }).toThrow('DCE_PATH not configured');
    });

    test('throws for non-existent executable', () => {
        expect(() => {
            validateDCEPath('/non/existent/path');
        }).toThrow('Discord Chat Exporter not found');
    });

    test('throws for path with missing executable', () => {
        const tempDir = path.join(__dirname, '..', 'fixtures', 'temp_test');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        expect(() => {
            validateDCEPath(tempDir);
        }).toThrow('Discord Chat Exporter not found');
    });

    test('returns executable path when DCE exists', () => {
        const tempDir = path.join(__dirname, '..', 'fixtures', 'temp_test');
        const dcePath = path.join(tempDir, 'DiscordChatExporter.Cli');
        
        // Create mock DCE executable
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        fs.writeFileSync(dcePath, '');
        
        try {
            const result = validateDCEPath(tempDir);
            expect(result).toBe(dcePath);
        } finally {
            // Cleanup
            if (fs.existsSync(dcePath)) {
                fs.unlinkSync(dcePath);
            }
        }
    });

    test('validates DCE with .exe extension on Windows-like paths', () => {
        const tempDir = path.join(__dirname, '..', 'fixtures', 'temp_test');
        const dcePath = path.join(tempDir, 'DiscordChatExporter.Cli.exe');
        
        // Create mock DCE executable with .exe
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        fs.writeFileSync(dcePath, '');
        
        try {
            const result = validateDCEPath(tempDir);
            expect(result).toBe(path.join(tempDir, 'DiscordChatExporter.Cli'));
        } finally {
            // Cleanup
            if (fs.existsSync(dcePath)) {
                fs.unlinkSync(dcePath);
            }
        }
    });
});
