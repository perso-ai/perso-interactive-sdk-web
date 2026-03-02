/** @type {import('eslint').Linter.Config} */
module.exports = {
	extends: ['@perso-interactive-sdk-web/eslint-config'],
	parserOptions: {
		project: ['./tsconfig.json'],
		tsconfigRootDir: __dirname
	},
	overrides: [
		{
			files: ['*.svelte'],
			parserOptions: {
				project: null
			}
		}
	]
};
