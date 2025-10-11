const fs = require('fs');
const path = require('path');
const { traverseDataPackage, getRecipients } = require('../../src/lib/file-utils');

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
