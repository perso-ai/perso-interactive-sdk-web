const baseConfig = require('./packages/prettier-config');

module.exports = {
	...baseConfig,
	plugins: ['prettier-plugin-svelte'],
	overrides: [
		{
			files: '*.svelte',
			options: {
				parser: 'svelte'
			}
		}
	]
};
