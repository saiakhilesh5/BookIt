export default {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Native ESM (package.json has "type": "module") — run with
  // NODE_OPTIONS=--experimental-vm-modules (see package.json test script).
  transform: {},
  testTimeout: 60000,
  verbose: true,
};
