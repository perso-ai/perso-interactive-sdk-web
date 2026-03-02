#!/usr/bin/env node

const path = require("path");

// Find eslint package.json first, then navigate to bin/eslint.js
const eslintPkgPath = require.resolve("eslint/package.json", {
  paths: [process.cwd(), __dirname],
});
const eslintBin = path.join(path.dirname(eslintPkgPath), "bin", "eslint.js");

require(eslintBin);
