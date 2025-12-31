const { runDCEExportChannel, exportDMs } = require('../../src/lib/cli-helpers');
const { spawn } = require('child_process');
const EventEmitter = require('events');

jest.mock('child_process');
jest.mock('../../src/lib/file-utils', () => ({
    getExportStatus: jest.fn(() => ({})),
    updateExportStatus: jest.fn()
}));

describe('CLI Helpers - DCE Export', () => {
    let mockProcess;
    let consoleLogSpy;
    let consoleErrorSpy;
    let stdoutWriteSpy;

    beforeEach(() => {
        mockProcess = new EventEmitter();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        spawn.mockReturnValue(mockProcess);
        
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation();
    });

    afterEach(() => {
        jest.clearAllMocks();
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        stdoutWriteSpy.mockRestore();
    });

    describe('runDCEExportChannel', () => {
        it('should spawn DCE with correct arguments', async () => {
            const promise = runDCEExportChannel('token123', '/export', '/dce/path', 'Json', '123456789', '987654321', 'testuser');
            
            expect(spawn).toHaveBeenCalledWith(
                '/dce/path/DiscordChatExporter.Cli',
                expect.arrayContaining([
                    'export',
                    '-t', 'token123',
                    '-c', '987654321',
                    '-o', '/export/123456789/Direct Messages/987654321/testuser - %d/',
                    '--format', 'Json'
                ]),
                expect.objectContaining({
                    stdio: ['ignore', 'pipe', 'pipe']
                })
            );

            mockProcess.emit('close', 0);
            await promise;
        });

        it('should include --after flag when afterTimestamp is provided', async () => {
            const promise = runDCEExportChannel('token123', '/export', '/dce/path', 'Json', '123456789', '987654321', 'testuser', '2026-01-01T00:00:00.000Z');
            
            expect(spawn).toHaveBeenCalledWith(
                '/dce/path/DiscordChatExporter.Cli',
                expect.arrayContaining([
                    'export',
                    '--after', '2026-01-01T00:00:00.000Z'
                ]),
                expect.any(Object)
            );

            mockProcess.emit('close', 0);
            await promise;
        });

        it('should resolve on successful export', async () => {
            const promise = runDCEExportChannel('token123', '/export', '/dce/path', 'Json', '123456789', '987654321', 'testuser');
            
            mockProcess.emit('close', 0);
            
            const result = await promise;
            expect(result).toEqual({ success: true, channelId: '987654321', channelName: 'testuser' });
        });

        it('should reject on non-zero exit code', async () => {
            const promise = runDCEExportChannel('token123', '/export', '/dce/path', 'Json', '123456789', '987654321', 'testuser');
            
            mockProcess.emit('close', 1);
            
            await expect(promise).rejects.toThrow('DCE exited with code 1 for testuser');
        });

        it('should reject on process error', async () => {
            const promise = runDCEExportChannel('token123', '/export', '/dce/path', 'Json', '123456789', '987654321', 'testuser');
            
            mockProcess.emit('error', new Error('spawn failed'));
            
            await expect(promise).rejects.toThrow('Failed to start DCE for testuser: spawn failed');
        });
    });

    describe('exportDMs', () => {
        const mockChannels = [
            { id: 'ch1', recipients: [{ id: 'u1', username: 'user1' }] },
            { id: 'ch2', recipients: [{ id: 'u2', username: 'user2' }] }
        ];

        it('should return error if no channels provided', async () => {
            const result = await exportDMs('token123', '/export', '/dce/path', '123456789', ['Json'], null);
            
            expect(result.success).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith('No channels provided for export');
        });

        it('should export all channels in specified format', async () => {
            const promise = exportDMs('token123', '/export', '/dce/path', '123456789', ['Json'], mockChannels, 2);
            
            // Wait a bit for async operations
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Complete first channel
            mockProcess.emit('close', 0);
            
            await new Promise(resolve => setTimeout(resolve, 600));
            
            // Complete second channel
            mockProcess.emit('close', 0);
            
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const result = await promise;
            
            expect(result.success).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Exporting 2 channel(s) in Json format'));
        });
    });
});
