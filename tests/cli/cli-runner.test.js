const { parseArgs } = require('../../src/cli/cli-runner');

// Mock dependencies
jest.mock('../../src/logger', () => ({
    initializeLogger: jest.fn(),
    getLogger: jest.fn(() => ({
        logOnly: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        error: jest.fn()
    }))
}));

jest.mock('../../src/config', () => ({
    getConfigManager: jest.fn(() => ({
        init: jest.fn(),
        get: jest.fn(),
        getEnv: jest.fn(),
        set: jest.fn(),
        setEnv: jest.fn()
    }))
}));

jest.mock('../../src/discord-api', () => ({
    getCurrentOpenDMs: jest.fn(),
    reopenDM: jest.fn(),
    closeDM: jest.fn(),
    delay: jest.fn()
}));

jest.mock('../../src/batch/batch-processor', () => ({
    openBatchDMs: jest.fn(),
    closeAllOpenDMs: jest.fn()
}));

jest.mock('../../src/lib/cli-helpers', () => ({
    exportDMs: jest.fn(),
    createDMProgressBar: jest.fn(() => ({
        start: jest.fn(),
        update: jest.fn(),
        stop: jest.fn()
    })),
    promptUser: jest.fn()
}));

jest.mock('../../src/lib/validators', () => ({
    validateRequired: jest.fn(),
    validateDCEPath: jest.fn()
}));

jest.mock('../../src/lib/file-utils', () => ({
    traverseDataPackage: jest.fn(() => []),
    getRecipients: jest.fn(() => []),
    updateIdHistory: jest.fn(),
    readJsonFile: jest.fn(),
    writeJsonFile: jest.fn()
}));

jest.mock('../../src/lib/api-delay-tracker', () => ({
    getApiDelayTracker: jest.fn(() => ({
        trackAndDelay: jest.fn(),
        reset: jest.fn()
    }))
}));

describe('cli-runner', () => {
    describe('parseArgs', () => {
        let originalArgv;

        beforeEach(() => {
            originalArgv = process.argv;
        });

        afterEach(() => {
            process.argv = originalArgv;
        });

        test('parses help flag (-h)', () => {
            process.argv = ['node', 'cli-runner.js', '-h'];
            const args = parseArgs();
            expect(args.help).toBe(true);
        });

        test('parses help flag (--help)', () => {
            process.argv = ['node', 'cli-runner.js', '--help'];
            const args = parseArgs();
            expect(args.help).toBe(true);
        });

        test('parses all flag (-a)', () => {
            process.argv = ['node', 'cli-runner.js', '-a'];
            const args = parseArgs();
            expect(args.all).toBe(true);
        });

        test('parses all flag (--all)', () => {
            process.argv = ['node', 'cli-runner.js', '--all'];
            const args = parseArgs();
            expect(args.all).toBe(true);
        });

        test('parses single username (-s)', () => {
            process.argv = ['node', 'cli-runner.js', '-s', 'username1'];
            const args = parseArgs();
            expect(args.usernames).toEqual(['username1']);
        });

        test('parses multiple usernames (-s)', () => {
            process.argv = ['node', 'cli-runner.js', '-s', 'username1', 'username2', 'username3'];
            const args = parseArgs();
            expect(args.usernames).toEqual(['username1', 'username2', 'username3']);
        });

        test('parses username with spaces (--username)', () => {
            process.argv = ['node', 'cli-runner.js', '--username', 'user name', 'another user'];
            const args = parseArgs();
            expect(args.usernames).toEqual(['user name', 'another user']);
        });

        test('parses single user ID (-u)', () => {
            process.argv = ['node', 'cli-runner.js', '-u', '123456789'];
            const args = parseArgs();
            expect(args.userIds).toEqual(['123456789']);
        });

        test('parses multiple user IDs (-u)', () => {
            process.argv = ['node', 'cli-runner.js', '-u', '123', '456', '789'];
            const args = parseArgs();
            expect(args.userIds).toEqual(['123', '456', '789']);
        });

        test('parses user IDs (--user-id)', () => {
            process.argv = ['node', 'cli-runner.js', '--user-id', '111', '222'];
            const args = parseArgs();
            expect(args.userIds).toEqual(['111', '222']);
        });

        test('parses combined flags', () => {
            process.argv = ['node', 'cli-runner.js', '-s', 'user1', 'user2', '-u', '123', '456'];
            const args = parseArgs();
            expect(args.usernames).toEqual(['user1', 'user2']);
            expect(args.userIds).toEqual(['123', '456']);
        });

        test('stops parsing usernames at next flag', () => {
            process.argv = ['node', 'cli-runner.js', '-s', 'user1', 'user2', '-a'];
            const args = parseArgs();
            expect(args.usernames).toEqual(['user1', 'user2']);
            expect(args.all).toBe(true);
        });

        test('returns default values when no args provided', () => {
            process.argv = ['node', 'cli-runner.js'];
            const args = parseArgs();
            expect(args).toEqual({
                usernames: [],
                userIds: [],
                all: false,
                help: false
            });
        });

        test('handles mixed short and long flags', () => {
            process.argv = ['node', 'cli-runner.js', '-s', 'user1', '--user-id', '123', '--all'];
            const args = parseArgs();
            expect(args.usernames).toEqual(['user1']);
            expect(args.userIds).toEqual(['123']);
            expect(args.all).toBe(true);
        });

        test('ignores unknown flags', () => {
            process.argv = ['node', 'cli-runner.js', '--unknown', 'value', '-s', 'user1'];
            const args = parseArgs();
            expect(args.usernames).toEqual(['user1']);
        });
    });
});
