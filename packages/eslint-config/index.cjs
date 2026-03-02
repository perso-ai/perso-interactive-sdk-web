/** @type {import('eslint').Linter.Config} */
module.exports = {
	root: true,
	env: {
		browser: true,
		es2022: true,
		node: true
	},
	ignorePatterns: [
		'node_modules',
		'dist',
		'build',
		'.svelte-kit',
		'.vercel',
		'.netlify'
	],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:svelte/recommended',
		'prettier'
	],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
		project: ['./tsconfig.json'],
		tsconfigRootDir: process.cwd()
	},
	settings: {
		'svelte3/typescript': () => require('typescript')
	},
	plugins: ['@typescript-eslint'],
	overrides: [
		{
			files: ['*.svelte'],
			parser: 'svelte-eslint-parser',
			parserOptions: {
				parser: {
					ts: '@typescript-eslint/parser'
				},
				extraFileExtensions: ['.svelte'],
				project: null
			},
			rules: {
				// Disable type-aware rules for svelte files (TypeScript can't process .svelte)
				'@typescript-eslint/no-unsafe-assignment': 'off',
				'@typescript-eslint/no-unsafe-member-access': 'off',
				'@typescript-eslint/no-unsafe-call': 'off',
				'@typescript-eslint/no-unsafe-return': 'off',
				'@typescript-eslint/no-unsafe-argument': 'off',
				// Allow Svelte component scripts to use unused exports (commonly used for props).
				'@typescript-eslint/no-unused-vars': [
					'warn',
					{
						vars: 'all',
						args: 'after-used',
						argsIgnorePattern: '^_',
						ignoreRestSiblings: true
					}
				]
			}
		},
		{
			files: ['*.js', '*.cjs', '*.mjs'],
			parserOptions: {
				sourceType: 'module',
				tsconfigRootDir: process.cwd()
			}
		}
	],
	rules: {
		'@typescript-eslint/consistent-type-imports': 'warn',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/no-namespace': 'off',
		'@typescript-eslint/no-unused-vars': [
			'warn',
			{
				vars: 'all',
				args: 'after-used',
				argsIgnorePattern: '^_',
				ignoreRestSiblings: true
			}
		]
	}
};
