const fs = require('fs');
const path = require('path');
const {
    ValidationError,
    validateRequired,
    validatePathExists,
    validateDCEPath,
    validateDataPackage,
    validatePaths,
    validateUserJson
} = require('../../src/lib/validators');

describe('ValidationError', () => {
    test('creates error with field and value', () => {
        const error = new ValidationError('Test error', 'TEST_FIELD', 'test_value');
        expect(error.message).toBe('Test error');
        expect(error.field).toBe('TEST_FIELD');
        expect(error.value).toBe('test_value');
        expect(error.name).toBe('ValidationError');
    });
});

describe('validateRequired', () => {
    test('does not throw for valid value', () => {
        expect(() => {
            validateRequired('/valid/path', 'TEST_PATH', 'test path');
        }).not.toThrow();
    });

    test('returns the value if valid', () => {
        const result = validateRequired('valid', 'TEST', 'test');
        expect(result).toBe('valid');
    });

    test('throws ValidationError for undefined', () => {
        expect(() => {
            validateRequired(undefined, 'TEST_PATH', 'test path');
        }).toThrow(ValidationError);
    });

    test('throws ValidationError for null', () => {
        expect(() => {
            validateRequired(null, 'TEST_PATH', 'test path');
        }).toThrow(ValidationError);
    });

    test('throws ValidationError for empty string', () => {
        expect(() => {
            validateRequired('', 'TEST_PATH', 'test path');
        }).toThrow(ValidationError);
    });

    test('includes friendly name in error message', () => {
        try {
            validateRequired(null, 'DCE_PATH', 'Discord Chat Exporter path');
        } catch (error) {
            expect(error.message).toContain('Discord Chat Exporter path');
            expect(error.message).toContain('Configuration menu');
        }
    });
});

describe('validatePathExists', () => {
    test('returns true for existing path', () => {
        const existingPath = __dirname;
        expect(validatePathExists(existingPath, 'testPath')).toBe(true);
    });

    test('returns false for non-existent path', () => {
        expect(validatePathExists('/non/existent/path', 'testPath')).toBe(false);
    });

    test('throws ValidationError when throwOnError is true and path does not exist', () => {
        expect(() => {
            validatePathExists('/non/existent/path', 'testPath', true);
        }).toThrow(ValidationError);
    });

    test('does not throw when throwOnError is false and path does not exist', () => {
        expect(() => {
            validatePathExists('/non/existent/path', 'testPath', false);
        }).not.toThrow();
    });
});

describe('validateDCEPath', () => {
    test('throws ValidationError for undefined path', () => {
        expect(() => {
            validateDCEPath(undefined);
        }).toThrow(ValidationError);
    });

    test('throws ValidationError for non-existent path', () => {
        expect(() => {
            validateDCEPath('/non/existent/path');
        }).toThrow(ValidationError);
    });

    test('throws ValidationError for path with missing executable', () => {
        const tempDir = path.join(__dirname, '..', 'fixtures', 'dce_test_empty');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        try {
            expect(() => {
                validateDCEPath(tempDir);
            }).toThrow(ValidationError);
            expect(() => {
                validateDCEPath(tempDir);
            }).toThrow('Discord Chat Exporter not found');
        } finally {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true });
            }
        }
    });

    test('returns executable path when DCE exists', () => {
        const tempDir = path.join(__dirname, '..', 'fixtures', 'dce_test_valid');
        const dcePath = path.join(tempDir, 'DiscordChatExporter.Cli');
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        fs.writeFileSync(dcePath, '');
        
        try {
            const result = validateDCEPath(tempDir);
            expect(result).toBe(dcePath);
        } finally {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true });
            }
        }
    });

    test('validates DCE with .exe extension', () => {
        const tempDir = path.join(__dirname, '..', 'fixtures', 'dce_test_exe');
        const dcePath = path.join(tempDir, 'DiscordChatExporter.Cli.exe');
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        fs.writeFileSync(dcePath, '');
        
        try {
            const result = validateDCEPath(tempDir);
            expect(result).toBe(path.join(tempDir, 'DiscordChatExporter.Cli'));
        } finally {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true });
            }
        }
    });
});

describe('validateDataPackage', () => {
    test('throws ValidationError for non-existent path', () => {
        expect(() => {
            validateDataPackage('/non/existent/path');
        }).toThrow(ValidationError);
    });

    test('throws ValidationError when messages folder is missing', () => {
        const tempDir = path.join(__dirname, '..', 'fixtures', 'package_no_messages');
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        try {
            expect(() => {
                validateDataPackage(tempDir);
            }).toThrow(ValidationError);
            expect(() => {
                validateDataPackage(tempDir);
            }).toThrow('Messages folder');
        } finally {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true });
            }
        }
    });

    test('returns true for valid data package', () => {
        const tempDir = path.join(__dirname, '..', 'fixtures', 'package_valid');
        const messagesDir = path.join(tempDir, 'messages');
        
        if (!fs.existsSync(messagesDir)) {
            fs.mkdirSync(messagesDir, { recursive: true });
        }
        
        try {
            const result = validateDataPackage(tempDir);
            expect(result).toBe(true);
        } finally {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true });
            }
        }
    });
});

describe('validatePaths', () => {
    test('validates multiple paths', () => {
        const result = validatePaths([
            { path: __dirname, name: 'test_dir', required: false },
            { path: __filename, name: 'test_file', required: false }
        ]);
        
        expect(result.valid).toBe(true);
        expect(result.results.length).toBe(2);
        expect(result.errors.length).toBe(0);
        expect(result.results[0].exists).toBe(true);
        expect(result.results[1].exists).toBe(true);
    });

    test('returns errors for non-existent paths', () => {
        const result = validatePaths([
            { path: '/non/existent/1', name: 'path1', required: false },
            { path: '/non/existent/2', name: 'path2', required: false }
        ]);
        
        expect(result.valid).toBe(true);
        expect(result.results[0].exists).toBe(false);
        expect(result.results[1].exists).toBe(false);
    });

    test('throws for required non-existent paths', () => {
        const result = validatePaths([
            { path: __dirname, name: 'existing', required: true },
            { path: '/non/existent', name: 'missing', required: true }
        ]);
        
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].name).toBe('missing');
    });
});

describe('validateUserJson', () => {
    const testDir = path.join(__dirname, '..', 'fixtures', 'user_json_test');

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    test('returns invalid for non-existent file', () => {
        const result = validateUserJson('/non/existent/user.json');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not found');
    });

    test('returns invalid for missing id field', () => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        const userJsonPath = path.join(testDir, 'user.json');
        fs.writeFileSync(userJsonPath, JSON.stringify({ username: 'testuser' }));

        const result = validateUserJson(userJsonPath);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('missing required fields');
    });

    test('returns invalid for missing username field', () => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        const userJsonPath = path.join(testDir, 'user.json');
        fs.writeFileSync(userJsonPath, JSON.stringify({ id: '12345' }));

        const result = validateUserJson(userJsonPath);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('missing required fields');
    });

    test('returns valid result with data for valid user.json', () => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        const userJsonPath = path.join(testDir, 'user.json');
        const userData = { id: '12345', username: 'testuser' };
        fs.writeFileSync(userJsonPath, JSON.stringify(userData));

        const result = validateUserJson(userJsonPath);
        expect(result.valid).toBe(true);
        expect(result.userId).toBe('12345');
        expect(result.username).toBe('testuser');
        expect(result.data).toEqual(userData);
    });

    test('returns invalid for malformed JSON', () => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        const userJsonPath = path.join(testDir, 'user.json');
        fs.writeFileSync(userJsonPath, 'invalid json content');

        const result = validateUserJson(userJsonPath);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Could not read');
    });
});
