import { defineConfig } from '@vscode/test-cli';
export default defineConfig({
    ...(process.env.VSCODE_EXECUTABLE_PATH ? { useInstallation: { fromPath: process.env.VSCODE_EXECUTABLE_PATH } } : {}),
    extensionDevelopmentPath: process.env.FILTER_LINE_EXTENSION_PATH || '.',
    files: 'out/test/integration/**/*.test.js',
    version: process.env.VSCODE_TEST_VERSION || 'stable',
    workspaceFolder: './src/test/fixtures/workspace.code-workspace',
    launchArgs: ['--disable-extensions', '--skip-welcome', '--skip-release-notes'],
    mocha: { ui: 'tdd', timeout: 20000 },
});
