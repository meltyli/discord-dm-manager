const { runDCEExport, exportDMs } = require('../../src/lib/cli-helpers');
const { spawn } = require('child_process');
const EventEmitter = require('events');

jest.mock('child_process');

describe('CLI Helpers - DCE Export', () => {
    let mockProcess;
    let consoleLogSpy;
    let consoleErrorSpy;

    beforeEach(() => {
        mockProcess = new EventEmitter();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        spawn.mockReturnValue(mockProcess);
        
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        jest.clearAllMocks();
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('runDCEExport', () => {
        it('should spawn DCE with correct arguments', async () => {
            const promise = runDCEExport('token123', '/export', '/dce/path', 'Json', '123456789');
            
            expect(spawn).toHaveBeenCalledWith(
                '/dce/path/DiscordChatExporter.Cli',
                expect.arrayContaining([
                    'exportdm',
                    '-t', 'token123',
                    '-o', '/export/123456789/%G/%c/%C - %d/',
                    '--format', 'Json'
                ])
            );

            mockProcess.emit('close', 0);
            await promise;
        });

        it('should resolve on successful export', async () => {
            const promise = runDCEExport('token123', '/export', '/dce/path', 'HtmlDark', '123456789');
            
            mockProcess.emit('close', 0);
            
            await expect(promise).resolves.toBeUndefined();
        });

        it('should reject on non-zero exit code', async () => {
            const promise = runDCEExport('token123', '/export', '/dce/path', 'Json', '123456789');
            
            mockProcess.emit('close', 1);
            
            await expect(promise).rejects.toThrow('DCE exited with code 1');
        });

        it('should reject on process error', async () => {
            const promise = runDCEExport('token123', '/export', '/dce/path', 'Json', '123456789');
            
            mockProcess.emit('error', new Error('spawn failed'));
            
            await expect(promise).rejects.toThrow('Failed to start DCE: spawn failed');
        });

        it('should log stdout data', async () => {
            const promise = runDCEExport('token123', '/export', '/dce/path', 'Json', '123456789');
            
            mockProcess.stdout.emit('data', Buffer.from('Export progress...\n'));
            
            expect(consoleLogSpy).toHaveBeenCalledWith('Export progress...');
            
            mockProcess.emit('close', 0);
            await promise;
        });

        it('should log stderr data', async () => {
            const promise = runDCEExport('token123', '/export', '/dce/path', 'Json', '123456789');
            
            mockProcess.stderr.emit('data', Buffer.from('Warning message\n'));
            
            expect(consoleErrorSpy).toHaveBeenCalledWith('Warning message');
            
            mockProcess.emit('close', 0);
            await promise;
        });
    });

    describe('exportDMs', () => {
        it('should export in default formats (Json, HtmlDark)', async () => {
            const promise = exportDMs('token123', '/export', '/dce/path', '123456789');
            
            // First format (Json)
            mockProcess.emit('close', 0);
            
            // Wait for first export to complete
            await new Promise(resolve => setImmediate(resolve));
            
            // Second format (HtmlDark)
            mockProcess.emit('close', 0);
            
            await promise;
            
            expect(spawn).toHaveBeenCalledTimes(2);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Exporting in Json format...'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Json export completed.'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Exporting in HtmlDark format...'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('HtmlDark export completed.'));
        });

        it('should export in custom formats', async () => {
            const promise = exportDMs('token123', '/export', '/dce/path', '123456789', ['PlainText']);
            
            mockProcess.emit('close', 0);
            
            await promise;
            
            expect(spawn).toHaveBeenCalledTimes(1);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Exporting in PlainText format...'));
        });

        it('should throw error if any format fails', async () => {
            const promise = exportDMs('token123', '/export', '/dce/path', '123456789', ['Json', 'HtmlDark']);
            
            // First format succeeds
            mockProcess.emit('close', 0);
            
            await new Promise(resolve => setImmediate(resolve));
            
            // Second format fails
            mockProcess.emit('close', 1);
            
            await expect(promise).rejects.toThrow('DCE exited with code 1');
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('HtmlDark export failed'));
        });

        it('should stop on first failure', async () => {
            const promise = exportDMs('token123', '/export', '/dce/path', '123456789', ['Json', 'HtmlDark', 'PlainText']);
            
            // First format fails
            mockProcess.emit('close', 1);
            
            await expect(promise).rejects.toThrow('DCE exited with code 1');
            
            // Should only have called spawn once (first format)
            expect(spawn).toHaveBeenCalledTimes(1);
        });
    });
});
