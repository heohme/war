import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the Multi War matching page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>WAR — 六边格策略对战<\/title>/i);
  assert.match(html, /MULTI·WAR/);
  assert.match(html, /在线匹配/);
  assert.match(html, /单人测试/);
  assert.match(html, /长按看范围图/);
  assert.match(html, /aria-label="全部武器"/);
  assert.match(html, /近战兵装/);
  assert.match(html, /远程兵装/);
  assert.match(html, /法杖/);
  assert.match(html, /aria-label="重新开始"/);
  assert.match(html, /aria-label="新手引导"/);
  assert.match(html, /aria-label="问题反馈"/);
  assert.match(html, /撤 · 搜 · 打/);
  assert.doesNotMatch(html, /Building your site|react-loading-skeleton/);
});
