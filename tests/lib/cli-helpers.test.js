const { 
    cleanInput, 
    formatPath, 
    clearScreen 
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

    describe('formatPath', () => {
        test('is an alias for cleanInput', () => {
            expect(formatPath('  "/path/to/file"  ')).toBe('/path/to/file');
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
});
