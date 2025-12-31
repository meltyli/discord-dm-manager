const { 
    cleanInput, 
    clearScreen,
    createDMProgressBar,
    safeWaitForKeyPress
} = require('../../src/lib/cli-helpers');

describe('cli-helpers', () => {
    describe('cleanInput', () => {
        test('removes leading and trailing whitespace', () => {
            expect(cleanInput('  test  ')).toBe('test');
        });

        test('removes leading and trailing single quotes', () => {
            expect(cleanInput("'test'")).toBe('test');
        });

        test('removes leading and trailing double quotes', () => {
            expect(cleanInput('"test"')).toBe('test');
        });

        test('removes quotes and whitespace', () => {
            expect(cleanInput('  "test"  ')).toBe('test');
        });

        test('preserves internal quotes', () => {
            expect(cleanInput('"test\'s value"')).toBe("test's value");
        });

        test('returns empty string for empty input', () => {
            expect(cleanInput('')).toBe('');
        });

        test('handles mixed quote types', () => {
            expect(cleanInput('\'"test"\'')).toBe('"test"');
        });
    });

    describe('clearScreen', () => {
        test('calls console.clear', () => {
            const originalClear = console.clear;
            console.clear = jest.fn();
            
            clearScreen();
            
            expect(console.clear).toHaveBeenCalled();
            console.clear = originalClear;
        });
    });

    describe('createDMProgressBar', () => {
        test('creates a progress bar with default DMs label', () => {
            const progressBar = createDMProgressBar();
            
            expect(progressBar).toBeDefined();
            expect(progressBar.start).toBeDefined();
            expect(progressBar.update).toBeDefined();
            expect(progressBar.stop).toBeDefined();
        });

        test('creates a progress bar with custom label', () => {
            const progressBar = createDMProgressBar('Users');
            
            expect(progressBar).toBeDefined();
            // Progress bar configuration is internal, just verify it's created
        });

        test('progress bar has correct format string', () => {
            const progressBar = createDMProgressBar();
            
            // Verify the progress bar uses unicode characters
            expect(progressBar.options.barCompleteChar).toBe('\u2588');
            expect(progressBar.options.barIncompleteChar).toBe('\u2591');
        });
    });

    describe('safeWaitForKeyPress', () => {
        test('resolves immediately when readline is closed', async () => {
            const closedRl = { closed: true };
            
            await expect(safeWaitForKeyPress(closedRl)).resolves.toBeUndefined();
        });

        test('resolves immediately when readline is null', async () => {
            await expect(safeWaitForKeyPress(null)).resolves.toBeUndefined();
        });

        test('works normally with open readline', async () => {
            const mockRl = {
                closed: false,
                question: jest.fn((msg, callback) => callback())
            };
            
            await expect(safeWaitForKeyPress(mockRl)).resolves.toBeUndefined();
            expect(mockRl.question).toHaveBeenCalled();
        });
    });
});
