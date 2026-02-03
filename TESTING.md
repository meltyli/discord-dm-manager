# Testing Guide for DiscorDManager

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- <test-file-path>
```

Examples:
```bash
# Run batch processor tests
npm test -- tests/batch/batch-processor-dm-state.test.js

# Run Discord API tests
npm test -- tests/lib/discord-api.test.js

# Run CLI helpers tests
npm test -- tests/lib/cli-helpers.test.js

# Run file utils tests
npm test -- tests/lib/file-utils.test.js

# Run validators tests
npm test -- tests/lib/validators.test.js

# Run rate limiter tests
npm test -- tests/lib/rate-limiter.test.js
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run Tests with Specific Pattern
```bash
npm test -- --testNamePattern="<pattern>"
```

Example:
```bash
# Run only tests with "DM" in the name
npm test -- --testNamePattern="DM"

# Run only tests with "error" in the name
npm test -- --testNamePattern="error"
```

### Run Tests with Increased Timeout
Some tests may need more time, especially E2E tests:
```bash
npm test -- --testTimeout=20000
```

## Test Organization

### Unit Tests (Fast, Isolated)
- `tests/lib/` - Library utility tests
  - `cli-helpers.test.js` - CLI interaction utilities ✅
  - `cli-helpers-export.test.js` - Export functionality ✅
  - `discord-api.test.js` - Discord API wrapper ✅
  - `file-utils.test.js` - File system utilities ✅
  - `rate-limiter.test.js` - Rate limiting logic ✅
  - `validators.test.js` - Input validation ✅

### Integration Tests (Medium Speed)
- `tests/batch/` - Batch processing tests
  - `batch-processor-dm-state.test.js` - DM state management ✅
- `tests/` - Batch resume tests
  - `test-batch-resume.js` - Batch state persistence and resume logic ✅
- `tests/cli/` - CLI runner tests
  - `cli-runner.test.js` - Basic CLI runner tests ✅
  - `cli-runner-integration.test.js` - CLI integration tests ⚠️ (some tests need refactoring)

### End-to-End Tests (Slow)
- `tests/cli/`
  - `cli-e2e.test.js` - Full CLI execution tests ⚠️ (some tests timeout - need investigation)

## Test Status

### ✅ Passing Tests (135 tests)
- All unit tests in `tests/lib/` (6 suites)
- All batch processor tests (1 suite)
- CLI runner tests (3 suites)

### ⏭️ Skipped Tests (15 tests)
- **cli-runner-integration.test.js** (5 tests) - Tests that require mocking `global.require` which doesn't work properly in Jest
- **cli-e2e.test.js** (10 tests) - E2E tests that timeout without full environment setup (config files, valid tokens, etc.)

These skipped tests verify functionality that requires:
- Valid Discord authentication tokens
- Complete configuration files
- Real or mocked file system with Discord data package structure

They can be re-enabled when proper test fixtures and mocking are set up.

## Writing New Tests

### Test Structure
```javascript
describe('Feature Name', () => {
    beforeEach(() => {
        // Setup before each test
        jest.clearAllMocks();
    });

    test('should do something specific', () => {
        // Arrange
        const input = 'test';
        
        // Act
        const result = functionUnderTest(input);
        
        // Assert
        expect(result).toBe('expected');
    });
});
```

### Mocking Dependencies
```javascript
jest.mock('../../src/some-module', () => ({
    someFunction: jest.fn()
}));
```

### Testing Async Functions
```javascript
test('should handle async operations', async () => {
    const result = await asyncFunction();
    expect(result).toBeDefined();
});
```

## Debugging Tests

### Run Tests with Verbose Output
```bash
npm test -- --verbose
```

### Run Single Test
```bash
npm test -- -t "exact test name"
```

### Debug in VS Code
Add this to `.vscode/launch.json`:
```json
{
    "type": "node",
    "request": "launch",
    "name": "Jest Current File",
    "program": "${workspaceFolder}/node_modules/.bin/jest",
    "args": [
        "${fileBasename}",
        "--config",
        "${workspaceFolder}/jest.config.js"
    ],
    "console": "integratedTerminal",
    "internalConsoleOptions": "neverOpen"
}
```

## Common Test Commands

```bash
# Run all tests
npm test

# Run tests for a specific file
npm test -- tests/lib/discord-api.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="API"

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode (reruns on file changes)
npm test -- --watch

# Run only failed tests from last run
npm test -- --onlyFailures

# Update snapshots
npm test -- -u

# Show test execution time
npm test -- --verbose

# Run with Node debugging
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Tips

1. **Keep Tests Fast**: Mock external dependencies and file system operations
2. **Test One Thing**: Each test should verify a single behavior
3. **Clear Mocks**: Use `jest.clearAllMocks()` in `beforeEach()` to prevent test pollution
4. **Descriptive Names**: Test names should clearly describe what they verify
5. **Arrange-Act-Assert**: Follow the AAA pattern for clear test structure

## Continuous Integration

Tests run automatically on:
- Every commit (via pre-commit hooks if configured)
- Pull requests
- Before publishing releases

Aim for:
- **Unit tests**: < 100ms each
- **Integration tests**: < 1s each
- **E2E tests**: < 10s each
- **Total suite**: < 2 minutes
