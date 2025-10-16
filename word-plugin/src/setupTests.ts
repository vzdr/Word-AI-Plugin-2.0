import '@testing-library/jest-dom';

// Mock Office.js globals
global.Office = {
  onReady: jest.fn((callback) => {
    if (typeof callback === 'function') {
      callback({ host: 'Word', platform: 'PC' });
    }
    return Promise.resolve({ host: 'Word', platform: 'PC' });
  }),
  context: {
    document: {},
  },
} as any;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
};
