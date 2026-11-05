import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/*
  Unit-тесты: чистая логика из shared/ и server/utils — без браузера и без
  сервера, за секунды. Сценарии в браузере — tests/e2e (Playwright).

    npm run test:unit
*/
export default defineConfig({
  resolve: {
    alias: {
      "#shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
