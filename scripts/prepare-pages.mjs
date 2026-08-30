import { copyFile, rm } from "node:fs/promises";

await Promise.all([
  copyFile("dist/server/prerendered-routes/index.html", "dist/client/index.html"),
  copyFile("dist/server/prerendered-routes/404.html", "dist/client/404.html"),
]);

// vinext creates a temporary Worker deploy redirect; Pages must read the root
// wrangler.jsonc so its Durable Object bindings are included.
await rm(".wrangler/deploy/config.json", { force: true });
