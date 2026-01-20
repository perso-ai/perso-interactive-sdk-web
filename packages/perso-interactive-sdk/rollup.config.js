import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { spawn } from "child_process";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import dts from "rollup-plugin-dts";
import livereload from "rollup-plugin-livereload";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const production = !process.env.ROLLUP_WATCH;

// npm package output paths
const clientDistBase = "dist/client";
const serverDistBase = "dist/server";

let distDirReady = false;

function serve() {
  let server;

  function toExit() {
    if (server) server.kill(0);
  }

  return {
    writeBundle() {
      if (server) return;
      server = spawn("npm", ["run", "start", "--", "--dev"], {
        stdio: ["ignore", "inherit", "inherit"],
        shell: true,
      });

      process.on("SIGTERM", toExit);
      process.on("exit", toExit);
    },
  };
}

function createDistDir() {
  return {
    name: "create-dist-dir",
    buildStart() {
      if (production && !distDirReady) {
        const clientDir = join(__dirname, clientDistBase);
        const serverDir = join(__dirname, serverDistBase);
        mkdirSync(clientDir, { recursive: true });
        mkdirSync(serverDir, { recursive: true });
        console.log(`✓ Created dist directories: dist/client, dist/server`);
        distDirReady = true;
      }
    },
  };
}

// ============================================================================
// Build Configurations
// ============================================================================

// Client ESM bundle
const clientEsmConfig = {
  input: "src/client/index.ts",
  output: {
    sourcemap: !production,
    format: "es",
    file: `${clientDistBase}/index.js`,
  },
  external: ["emoji-regex"],
  plugins: [
    createDistDir(),
    resolve({
      browser: true,
    }),
    commonjs(),
    typescript({
      sourceMap: !production,
      inlineSources: !production,
    }),
    production && terser(),
  ],
};

// Client CJS bundle
const clientCjsConfig = {
  input: "src/client/index.ts",
  output: {
    sourcemap: !production,
    format: "cjs",
    file: `${clientDistBase}/index.cjs`,
  },
  external: ["emoji-regex"],
  plugins: [
    resolve({
      browser: true,
    }),
    commonjs(),
    typescript({
      sourceMap: !production,
      inlineSources: !production,
    }),
    production && terser(),
  ],
};

// Client IIFE bundle (for direct browser usage via script tag)
const clientIifeConfig = {
  input: "src/client/index.ts",
  output: {
    sourcemap: !production,
    format: "iife",
    name: "PersoInteractive",
    file: `${clientDistBase}/index.iife.js`,
  },
  plugins: [
    resolve({
      browser: true,
    }),
    commonjs(),
    typescript({
      sourceMap: !production,
      inlineSources: !production,
    }),
    !production && serve(),
    !production && livereload("public"),
    production && terser(),
  ],
};

// Server ESM bundle
const serverEsmConfig = {
  input: "src/server/index.ts",
  output: {
    sourcemap: !production,
    format: "es",
    file: `${serverDistBase}/index.js`,
  },
  plugins: [
    createDistDir(),
    resolve({
      browser: false,
      preferBuiltins: true,
    }),
    commonjs(),
    typescript({
      sourceMap: !production,
      inlineSources: !production,
    }),
    production && terser(),
  ],
};

// Server CJS bundle
const serverCjsConfig = {
  input: "src/server/index.ts",
  output: {
    sourcemap: !production,
    format: "cjs",
    file: `${serverDistBase}/index.cjs`,
  },
  plugins: [
    resolve({
      browser: false,
      preferBuiltins: true,
    }),
    commonjs(),
    typescript({
      sourceMap: !production,
      inlineSources: !production,
    }),
    production && terser(),
  ],
};

// ============================================================================
// Type Declaration Configurations (production only)
// ============================================================================

const clientDtsConfig = {
  input: "src/client/index.ts",
  output: {
    file: `${clientDistBase}/index.d.ts`,
    format: "es",
  },
  plugins: [dts()],
};

const serverDtsConfig = {
  input: "src/server/index.ts",
  output: {
    file: `${serverDistBase}/index.d.ts`,
    format: "es",
  },
  plugins: [dts()],
};

// ============================================================================
// Export Configuration
// ============================================================================

const configs = production
  ? [
      // Client builds
      clientEsmConfig,
      clientCjsConfig,
      clientIifeConfig,
      // Server builds
      serverEsmConfig,
      serverCjsConfig,
      // Type declarations
      clientDtsConfig,
      serverDtsConfig,
    ]
  : [clientIifeConfig]; // Development mode: only IIFE for live reload

export default configs;
