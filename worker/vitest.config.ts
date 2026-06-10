import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Local, in-memory KV namespace for tests; never touches production.
          kvNamespaces: ["SHARES"],
        },
      },
    },
  },
});
