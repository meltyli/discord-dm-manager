const { spawn } = require('child_process');
const path = require('path');

describe('End-to-End CLI Tests', () => {
    const CLI_PATH = path.join(__dirname, '../../src/cli/cli-runner.js');
    const TIMEOUT = 10000;

    function runCLI(args) {
        return new Promise((resolve, reject) => {
            const child = spawn('node', [CLI_PATH, ...args]);
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                resolve({ code, stdout, stderr });
            });

            child.on('error', (error) => {
                reject(error);
            });

            // Kill after timeout
            setTimeout(() => {
                child.kill();
                reject(new Error('Process timeout'));
            }, TIMEOUT);
        });
    }

    describe('Help Command', () => {
        test('displays help with -h flag', async () => {
            const result = await runCLI(['-h']);
            
            expect(result.code).toBe(0);
            expect(result.stdout).toContain('DiscorDManager - CLI Mode');
            expect(result.stdout).toContain('Usage:');
            expect(result.stdout).toContain('Options:');
            expect(result.stdout).toContain('-s, --username');
            expect(result.stdout).toContain('-u, --user-id');
            expect(result.stdout).toContain('-a, --all');
            expect(result.stdout).toContain('Examples:');
        }, TIMEOUT);

        test('displays help with --help flag', async () => {
            const result = await runCLI(['--help']);
            
            expect(result.code).toBe(0);
            expect(result.stdout).toContain('DiscorDManager - CLI Mode');
        }, TIMEOUT);

        test('help mentions configuration via npm start', async () => {
            const result = await runCLI(['--help']);
            
            expect(result.stdout).toContain('Configuration:');
            expect(result.stdout).toContain('npm start');
        }, TIMEOUT);

        test('help mentions DM type limitation', async () => {
            const result = await runCLI(['--help']);
            
            expect(result.stdout).toContain('1-on-1 DMs');
            expect(result.stdout).toContain('type 1');
        }, TIMEOUT);
    });

    describe('Configuration Validation', () => {
        test('exits with error when config validation fails', async () => {
            const result = await runCLI(['-a']);
            
            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain('Configuration validation error');
        }, TIMEOUT);

        test('provides helpful error message for missing config', async () => {
            const result = await runCLI(['-a']);
            
            expect(result.stderr).toContain('npm start');
        }, TIMEOUT);

        test('suggests using interactive menu for configuration', async () => {
            const result = await runCLI(['-a']);
            
            expect(result.stderr).toContain('npm start');
        }, TIMEOUT);
    });

    describe('Argument Parsing', () => {
        test('exits when no arguments provided', async () => {
            const result = await runCLI([]);
            
            // Should exit with error or show usage
            expect(result.code).not.toBe(0);
        }, TIMEOUT);

        test('accepts username flag', async () => {
            const result = await runCLI(['-s', 'testuser']);
            
            // Will fail due to missing config, but argument should be parsed
            expect(result.stderr).not.toContain('Invalid option');
        }, TIMEOUT);

        test('accepts user-id flag', async () => {
            const result = await runCLI(['-u', '123456789']);
            
            // Will fail due to missing config, but argument should be parsed
            expect(result.stderr).not.toContain('Invalid option');
        }, TIMEOUT);

        test('accepts all flag', async () => {
            const result = await runCLI(['--all']);
            
            // Will fail due to missing config, but argument should be parsed
            expect(result.stderr).not.toContain('Invalid option');
        }, TIMEOUT);
    });

    describe('Output Formatting', () => {
        test('outputs to stdout for help', async () => {
            const result = await runCLI(['--help']);
            
            expect(result.stdout.length).toBeGreaterThan(0);
            expect(result.stderr.length).toBe(0);
        }, TIMEOUT);

        test('outputs to stderr for errors', async () => {
            const result = await runCLI(['-a']);
            
            expect(result.code).not.toBe(0);
            expect(result.stderr.length).toBeGreaterThan(0);
        }, TIMEOUT);
    });

    describe('Process Exit Codes', () => {
        test('exits with 0 on help', async () => {
            const result = await runCLI(['--help']);
            expect(result.code).toBe(0);
        }, TIMEOUT);

        test('exits with non-zero on configuration error', async () => {
            const result = await runCLI(['-a']);
            expect(result.code).not.toBe(0);
        }, TIMEOUT);

        test('exits with non-zero when no users specified', async () => {
            const result = await runCLI([]);
            expect(result.code).not.toBe(0);
        }, TIMEOUT);
    });
});
