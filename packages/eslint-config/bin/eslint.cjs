#!/usr/bin/env node

const eslintBin = require.resolve("eslint/bin/eslint.js", {
  paths: [process.cwd(), __dirname],
});

require(eslintBin);
