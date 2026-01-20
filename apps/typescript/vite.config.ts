import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(__dirname, "src"),
  publicDir: path.resolve(__dirname, "public"),
  plugins: [
    {
      name: "typescript-index-js",
      apply: "build",
      enforce: "pre",
      transformIndexHtml(html) {
        return {
          html: html.replace(
            /<script[^>]*src=['"]\/?index\.ts['"][^>]*><\/script>/,
            ""
          ),
          tags: [
            {
              tag: "script",
              attrs: { src: "./index.js" },
              injectTo: "body",
            },
          ],
        };
      },
    },
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "src/index.html"),
        index: path.resolve(__dirname, "src/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
