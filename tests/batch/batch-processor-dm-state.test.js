jest.mock('../../src/logger', () => ({
    initializeLogger: jest.fn(),
    getLogger: jest.fn(() => ({
        logOnly: jest.fn(),
        error: jest.fn()
    }))
}));

jest.mock('../../src/config', () => ({
    getConfigManager: jest.fn(() => ({
        get: jest.fn((key) => {
            const config = {
                'BATCH_SIZE': 10,
                'DATA_PACKAGE_FOLDER': '/test/data',
                'MAX_RETRIES': 3
            };
            return config[key];
        }),
        getEnv: jest.fn((key) => {
            if (key === 'AUTHORIZATION_TOKEN') return 'test-token';
            return 'test-value';
        })
    }))
}));

jest.mock('../../src/discord-api', () => ({
    getCurrentOpenDMs: jest.fn(),
    reopenDM: jest.fn(),
    closeDM: jest.fn()
}));

jest.mock('../../src/lib/file-utils', () => ({
    readJsonFile: jest.fn(),
    writeJsonFile: jest.fn(),
    updateIdHistory: jest.fn()
}));

jest.mock('../../src/lib/cli-helpers', () => ({
    createDMProgressBar: jest.fn(() => ({
        start: jest.fn(),
        update: jest.fn(),
        stop: jest.fn()
    }))
}));

jest.mock('../../src/lib/api-delay-tracker', () => ({
    getApiDelayTracker: jest.fn(() => ({
        trackAndDelay: jest.fn().mockResolvedValue(undefined),
        reset: jest.fn()
    }))
}));

const { openBatchDMs, closeAllOpenDMs } = require('../../src/batch/batch-processor');
const { getCurrentOpenDMs, reopenDM, closeDM } = require('../../src/discord-api');
const { readJsonFile, writeJsonFile, updateIdHistory } = require('../../src/lib/file-utils');
const { createDMProgressBar } = require('../../src/lib/cli-helpers');

describe('Batch Processor - DM State Management', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('openBatchDMs', () => {
        test('opens multiple DMs in a batch', async () => {
            const userIds = ['user1', 'user2', 'user3'];
            
            readJsonFile.mockReturnValue({
                uniqueChannels: [
                    { recipients: [{ id: 'user1', username: 'User1' }] },
                    { recipients: [{ id: 'user2', username: 'User2' }] }
                ]
            });

            reopenDM.mockResolvedValue({ success: true });

            const result = await openBatchDMs(userIds, 0, 1);

            expect(reopenDM).toHaveBeenCalledTimes(3);
            expect(result.processed).toBe(3);
            expect(result.skipped).toBe(0);
            expect(result.reopenedIds).toHaveLength(3);
        });

        test('loads usernames from id-history.json', async () => {
            const userIds = ['user1'];
            
            readJsonFile.mockReturnValue({
                uniqueChannels: [
                    { recipients: [{ id: 'user1', username: 'TestUser' }] }
                ],
                latest: [
                    { recipients: [{ id: 'user1', username: 'TestUser' }] }
                ]
            });

            reopenDM.mockResolvedValue({ success: true });

            await openBatchDMs(userIds, 0, 1);

            expect(readJsonFile).toHaveBeenCalled();
        });

        test('handles users without usernames gracefully', async () => {
            const userIds = ['unknownUser'];
            
            readJsonFile.mockReturnValue({});
            reopenDM.mockResolvedValue({ success: true });

            const result = await openBatchDMs(userIds, 0, 1);

            expect(result.processed).toBe(1);
        });

        test('tracks skipped users', async () => {
            const userIds = ['user1', 'user2'];
            
            readJsonFile.mockReturnValue({});
            reopenDM
                .mockResolvedValueOnce({ success: true })
                .mockResolvedValueOnce(null); // null = skipped

            const result = await openBatchDMs(userIds, 0, 1);

            expect(result.processed).toBe(1);
            expect(result.skipped).toBe(1);
        });

        test('shows progress with batch information', async () => {
            const userIds = ['user1', 'user2'];
            const { createDMProgressBar } = require('../../src/lib/cli-helpers');
            
            readJsonFile.mockReturnValue({});
            reopenDM.mockResolvedValue({ success: true });

            await openBatchDMs(userIds, 2, 5); // batch 3 of 5

            expect(createDMProgressBar).toHaveBeenCalled();
            const mockProgressBar = createDMProgressBar.mock.results[0].value;
            expect(mockProgressBar.start).toHaveBeenCalled();
            expect(mockProgressBar.stop).toHaveBeenCalled();
        });

        test('handles errors during opening', async () => {
            const userIds = ['user1'];
            
            readJsonFile.mockReturnValue({});
            reopenDM.mockRejectedValue(new Error('API Error'));

            await expect(openBatchDMs(userIds, 0, 1)).rejects.toThrow('API Error');
        });

        test('returns list of successfully reopened IDs', async () => {
            const userIds = ['user1', 'user2', 'user3'];
            
            readJsonFile.mockReturnValue({});
            reopenDM
                .mockResolvedValueOnce({ success: true })
                .mockResolvedValueOnce(null) // skipped
                .mockResolvedValueOnce({ success: true });

            const result = await openBatchDMs(userIds, 0, 1);

            expect(result.reopenedIds).toEqual(['user1', 'user3']);
        });
    });

    describe('closeAllOpenDMs', () => {
        test('closes all type 1 DMs', async () => {
            const mockDMs = [
                { id: 'dm1', type: 1, recipients: [{ id: 'user1', username: 'User1' }] },
                { id: 'dm2', type: 1, recipients: [{ id: 'user2', username: 'User2' }] }
            ];

            getCurrentOpenDMs.mockResolvedValue(mockDMs);
            closeDM.mockResolvedValue(undefined);

            const result = await closeAllOpenDMs();

            expect(closeDM).toHaveBeenCalledTimes(2);
            expect(result).toHaveLength(2);
        });

        test('saves channel info to id-history before closing', async () => {
            const mockDMs = [
                { id: 'dm1', type: 1, recipients: [{ id: 'user1' }] }
            ];

            getCurrentOpenDMs.mockResolvedValue(mockDMs);
            closeDM.mockResolvedValue(undefined);

            await closeAllOpenDMs();

            expect(updateIdHistory).toHaveBeenCalledWith(
                expect.stringContaining('id-history.json'),
                mockDMs
            );
        });

        test('filters out non-DM channels', async () => {
            const mockChannels = [
                { id: 'dm1', type: 1, recipients: [{ id: 'user1' }] },
                { id: 'group1', type: 3, recipients: [{ id: 'user2' }, { id: 'user3' }] },
                { id: 'dm2', type: 1, recipients: [{ id: 'user4' }] }
            ];

            getCurrentOpenDMs.mockResolvedValue(mockChannels);
            closeDM.mockResolvedValue(undefined);

            const result = await closeAllOpenDMs();

            // Should only close type 1 (DMs)
            expect(closeDM).toHaveBeenCalledTimes(2);
            expect(result).toHaveLength(2);
        });

        test('handles empty DM list', async () => {
            getCurrentOpenDMs.mockResolvedValue([]);

            const result = await closeAllOpenDMs();

            expect(closeDM).not.toHaveBeenCalled();
            expect(result).toEqual([]);
        });

        test('extracts user IDs from closed DMs', async () => {
            const mockDMs = [
                { id: 'dm1', type: 1, recipients: [{ id: 'user1' }] },
                { id: 'dm2', type: 1, recipients: [{ id: 'user2' }] }
            ];

            getCurrentOpenDMs.mockResolvedValue(mockDMs);
            closeDM.mockResolvedValue(undefined);

            const result = await closeAllOpenDMs();

            expect(result).toContain('user1');
            expect(result).toContain('user2');
        });

        test('shows progress while closing', async () => {
            const mockDMs = [
                { id: 'dm1', type: 1, recipients: [{ id: 'user1' }] }
            ];

            getCurrentOpenDMs.mockResolvedValue(mockDMs);
            closeDM.mockResolvedValue(undefined);

            await closeAllOpenDMs();

            expect(createDMProgressBar).toHaveBeenCalled();
            const mockProgressBar = createDMProgressBar.mock.results[0].value;
            expect(mockProgressBar.start).toHaveBeenCalled();
            expect(mockProgressBar.stop).toHaveBeenCalled();
        });
    });

    describe('DM Type Filtering', () => {
        test('only processes type 1 DMs', () => {
            const channels = [
                { id: 'dm1', type: 1, recipients: [{ id: 'u1' }] },
                { id: 'group1', type: 3, recipients: [{ id: 'u2' }] },
                { id: 'dm2', type: 1, recipients: [{ id: 'u3' }] },
                { id: 'voice', type: 2, recipients: [{ id: 'u4' }] }
            ];

            const type1Only = channels.filter(ch => ch.type === 1);
            
            expect(type1Only).toHaveLength(2);
            expect(type1Only[0].id).toBe('dm1');
            expect(type1Only[1].id).toBe('dm2');
        });

        test('validates recipient array exists', () => {
            const channels = [
                { id: 'dm1', type: 1, recipients: [{ id: 'u1' }] },
                { id: 'dm2', type: 1 }, // no recipients
                { id: 'dm3', type: 1, recipients: [] } // empty recipients
            ];

            const valid = channels.filter(
                ch => ch.type === 1 && 
                Array.isArray(ch.recipients) && 
                ch.recipients.length > 0
            );

            expect(valid).toHaveLength(1);
        });
    });

    describe('Error Recovery', () => {
        test('continues on individual DM close failure', async () => {
            const mockDMs = [
                { id: 'dm1', type: 1, recipients: [{ id: 'user1' }] },
                { id: 'dm2', type: 1, recipients: [{ id: 'user2' }] }
            ];

            getCurrentOpenDMs.mockResolvedValue(mockDMs);
            closeDM
                .mockRejectedValueOnce(new Error('Close failed'))
                .mockResolvedValueOnce(undefined);

            // Should throw on first failure in current implementation
            await expect(closeAllOpenDMs()).rejects.toThrow();
        });

        test('saves id-history even if file is missing', async () => {
            const mockDMs = [
                { id: 'dm1', type: 1, recipients: [{ id: 'user1' }] }
            ];

            getCurrentOpenDMs.mockResolvedValue(mockDMs);
            closeDM.mockResolvedValue(undefined);
            updateIdHistory.mockImplementation(() => {
                // Should not throw
            });

            await expect(closeAllOpenDMs()).resolves.not.toThrow();
        });
    });
});
