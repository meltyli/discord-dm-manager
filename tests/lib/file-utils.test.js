const fs = require('fs');
const path = require('path');
const { 
    traverseDataPackage, 
    getRecipients,
    ensureDirectory,
    resolveConfigPath,
    ensureExportPath,
    readJsonFile,
    writeJsonFile
} = require('../../src/lib/file-utils');

describe('traverseDataPackage', () => {
    const mockDataPath = path.join(__dirname, '..', 'fixtures', 'mock_package_test');

    beforeEach(() => {
        // Create mock directory structure with channel.json files
        const channel1Dir = path.join(mockDataPath, 'c123456');
        const channel2Dir = path.join(mockDataPath, 'c789012');
        
        fs.mkdirSync(channel1Dir, { recursive: true });
        fs.mkdirSync(channel2Dir, { recursive: true });
        
        const channelData1 = { id: "123456", type: "DM", recipients: ["user1", "user2"] };
        const channelData2 = { id: "789012", type: "DM", recipients: ["user1", "user3"] };
        
        fs.writeFileSync(path.join(channel1Dir, 'channel.json'), JSON.stringify(channelData1));
        fs.writeFileSync(path.join(channel2Dir, 'channel.json'), JSON.stringify(channelData2));
    });

    afterEach(() => {
        if (fs.existsSync(mockDataPath)) {
            fs.rmSync(mockDataPath, { recursive: true });
        }
    });

    test('should find all channel.json files in test package', () => {
        const channelPaths = traverseDataPackage(mockDataPath);
        
        expect(channelPaths.length).toBe(2);
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
    const mockDataPath = path.join(__dirname, '..', 'fixtures', 'mock_recipients_test');

    beforeEach(() => {
        // Create mock directory structure with channel.json files
        const channel1Dir = path.join(mockDataPath, 'c123456');
        const channel2Dir = path.join(mockDataPath, 'c789012');
        
        fs.mkdirSync(channel1Dir, { recursive: true });
        fs.mkdirSync(channel2Dir, { recursive: true });
        
        const channelData1 = { id: "123456", type: "DM", recipients: ["123456789", "111111111"] };
        const channelData2 = { id: "789012", type: "DM", recipients: ["123456789", "222222222"] };
        
        fs.writeFileSync(path.join(channel1Dir, 'channel.json'), JSON.stringify(channelData1));
        fs.writeFileSync(path.join(channel2Dir, 'channel.json'), JSON.stringify(channelData2));
    });

    afterEach(() => {
        if (fs.existsSync(mockDataPath)) {
            fs.rmSync(mockDataPath, { recursive: true });
        }
    });

    test('should extract unique recipients from DM channels', () => {
        const channelPaths = traverseDataPackage(mockDataPath);
        const myDiscordId = '123456789';
        
        const recipients = getRecipients(channelPaths, myDiscordId);
        
        expect(Array.isArray(recipients)).toBe(true);
        expect(recipients.length).toBe(2);
        // Should not include the user's own ID
        expect(recipients).not.toContain(myDiscordId);
        expect(recipients).toContain('111111111');
        expect(recipients).toContain('222222222');
    });

    test('should return empty array for empty channel list', () => {
        const recipients = getRecipients([], '123456789');
        expect(recipients).toEqual([]);
    });

    test('should handle invalid JSON gracefully', () => {
        // Create a temporary invalid channel.json file
        const tempDir = path.join(__dirname, '..', 'fixtures', 'temp_invalid_json_test');
        const tempFile = path.join(tempDir, 'channel.json');
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        fs.writeFileSync(tempFile, 'invalid json');
        
        // suppress noisy console.error output produced while parsing invalid JSON
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const recipients = getRecipients([tempFile], '123456789');
            // Should return empty array and not throw
            expect(recipients).toEqual([]);
        } finally {
            // Cleanup
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
            if (fs.existsSync(tempDir)) {
                fs.rmdirSync(tempDir);
            }
            errorSpy.mockRestore();
        }
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
