# Testing Guide

## Overview

This project uses Jest as the testing framework with comprehensive test coverage for core functionality.

## Test Statistics

- **Total Tests**: 189 passing
- **Test Files**: 5
- **Overall Coverage**: 32.24%
- **Target Coverage**: 80%

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage report
```bash
npm run test:coverage
```

### Run tests in CI mode
```bash
npm run test:ci
```

## Test Structure

```
word-plugin/src/
├── utils/__tests__/
│   ├── textReplacement.test.ts (32 tests) ✅
│   ├── tableDetection.test.ts (34 tests) ✅
│   ├── tableFiller.test.ts (68 tests) ✅
│   ├── fileValidation.test.ts (55 tests) ✅
│   └── storage.test.ts (32 tests) ✅
├── services/__tests__/
│   └── (future tests)
├── hooks/__tests__/
│   └── (future tests)
└── components/__tests__/
    └── (future tests)
```

## Coverage by Module

### High Coverage (>80%)
- ✅ **fileValidation.ts**: 100% coverage
- ✅ **storage.ts**: 94.49% coverage
- ✅ **tableFiller.ts**: 93.2% coverage
- ✅ **textReplacement.ts**: 79.73% coverage
- ✅ **logger.ts**: 78.94% coverage

### Medium Coverage (50-80%)
- ⚠️ **tableDetection.ts**: 69.36% coverage

### Low Coverage (<50%)
- ⚠️ **textSelection.ts**: 30.3% coverage
- ⚠️ **aiService.ts**: 15% coverage
- ⚠️ **retry.ts**: 9.43% coverage
- ⚠️ **tableService.ts**: 4.09% coverage

### No Coverage (0%)
- ❌ **settingsStorage.ts**: 0%
- ❌ **errorReporting.ts**: 0%
- ❌ All React components and hooks: 0%

## Testing Patterns

### Mocking Office.js

```typescript
// Mock Word global
(global as any).Word = {
  run: jest.fn(),
  InsertLocation: {
    replace: 'Replace',
  },
};

// Create mock context
function createMockContext(selectedText: string) {
  return {
    document: {
      getSelection: jest.fn().mockReturnValue({
        text: selectedText,
        load: jest.fn(),
        insertText: jest.fn().mockReturnValue({ select: jest.fn() }),
      }),
    },
    sync: jest.fn().mockResolvedValue(undefined),
  };
}

// Use in tests
(Word.run as jest.Mock).mockImplementation(async (callback) => {
  return await callback(mockContext);
});
```

### Mocking sessionStorage

```typescript
const mockSessionStorage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    key: jest.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
    get length() {
      return Object.keys(store).length;
    },
  };
})();

Object.defineProperty(global, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
});
```

### Testing Async Functions

```typescript
it('should handle async operations', async () => {
  const result = await replaceSelectedText('new text');
  expect(result.success).toBe(true);
});
```

### Testing Error Handling

```typescript
it('should handle errors gracefully', async () => {
  const mockContext = {
    sync: jest.fn().mockRejectedValue(new Error('API error')),
  };

  (Word.run as jest.Mock).mockImplementation(async (callback) => {
    return await callback(mockContext);
  });

  const result = await replaceSelectedText('text');
  expect(result.success).toBe(false);
  expect(result.error).toContain('API error');
});
```

## Continuous Integration

Tests automatically run on:
- Push to `main`, `develop`, or `epic/*` branches
- Pull requests to `main` or `develop`

The CI pipeline:
1. Runs tests on Node.js 18.x and 20.x
2. Generates coverage reports
3. Uploads coverage to Codecov
4. Archives coverage artifacts

## Next Steps

To reach 80% coverage target, implement tests for:

1. **Services** (Priority: High)
   - aiService.ts - AI API integration
   - tableService.ts - Table content generation

2. **Utilities** (Priority: Medium)
   - settingsStorage.ts - Settings persistence
   - errorReporting.ts - Error tracking
   - retry.ts - Retry logic
   - textSelection.ts - Selection utilities

3. **React Hooks** (Priority: Medium)
   - useAsync.ts
   - useRetry.ts
   - useSessionStorage.ts
   - useSettings.ts

4. **React Components** (Priority: Low)
   - App.tsx
   - All taskpane components
   - ErrorBoundary.tsx
   - OfflineIndicator.tsx

## Best Practices

1. **Test Naming**: Use descriptive test names that explain the expected behavior
2. **Arrange-Act-Assert**: Structure tests clearly
3. **Mock External Dependencies**: Always mock Office.js, storage, and network calls
4. **Test Edge Cases**: Include error scenarios, empty inputs, and boundary conditions
5. **Clean Up**: Use `beforeEach` and `afterEach` to reset mocks and state
6. **Avoid Implementation Details**: Test behavior, not implementation

## Troubleshooting

### Tests timeout
- Increase Jest timeout in jest.config.js
- Check for unresolved promises in your code

### Mocks not working
- Ensure mocks are set up in `beforeEach`
- Clear mocks with `jest.clearAllMocks()`
- Reset mock implementations if needed

### Coverage not accurate
- Check that all source files are included in `collectCoverageFrom`
- Verify test files are excluded from coverage
- Run `npm run test:coverage` to see detailed report

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Office.js Testing Guide](https://docs.microsoft.com/en-us/office/dev/add-ins/testing/)
