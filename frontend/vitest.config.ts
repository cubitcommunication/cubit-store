import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Same build settings as the app (path aliases, plugins), plus the test setup that stands in for the server-written page data.
export default mergeConfig(viteConfig, defineConfig({ test: { setupFiles: ["./src/test-setup.ts"] } }));
