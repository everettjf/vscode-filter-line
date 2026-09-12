import tseslint from 'typescript-eslint';
export default tseslint.config(
    { ignores: ['out/**', 'node_modules/**', '.vscode-test/**'] },
    ...tseslint.configs.recommended,
    { rules: { '@typescript-eslint/no-empty-function': 'off' } },
);
