import { cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { rebuildDataIndex } from "../scripts/lib/data-index";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let isServeCommand = false;

export default defineConfig({
  root: projectRoot,
  publicDir: false,
  build: {
    outDir: path.join(projectRoot, "dist"),
    emptyOutDir: true
  },
  server: {
    fs: {
      allow: [projectRoot]
    }
  },
  plugins: [
    tailwindcss(),
    react(),
    {
      name: "copy-runtime-data",
      configResolved(config) {
        isServeCommand = config.command === "serve";
      },
      async buildStart() {
        if (!isServeCommand) {
          await rebuildDataIndex({
            rootDir: projectRoot,
            normalizeItems: true
          });
        }
      },
      configureServer(server) {
        server.middlewares.use(async (request, _response, next) => {
          const requestPath = request.url?.split("?")[0];
          if (requestPath === "/data/index.json") {
            try {
              await rebuildDataIndex({
                rootDir: projectRoot,
                normalizeItems: true
              });
            } catch (error) {
              server.config.logger.error(
                error instanceof Error ? error.message : "Failed to rebuild data/index.json."
              );
            }
          }

          next();
        });
      },
      async closeBundle() {
        if (isServeCommand) {
          return;
        }

        await cp(path.join(projectRoot, "data"), path.join(projectRoot, "dist", "data"), {
          recursive: true
        });
        await cp(path.join(projectRoot, "images"), path.join(projectRoot, "dist", "images"), {
          recursive: true
        });
      }
    }
  ]
});
