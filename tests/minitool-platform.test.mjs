import assert from "node:assert/strict";
import test from "node:test";
import { readLocalValue, saveReportImage, writeLocalValue } from "../minitool/platform.ts";

async function withWindow(windowValue, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowValue });
  try { await run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
}

test("modern mini-tool storage uses native JSON strings and migrates the legacy guide", async () => {
  const values = new Map();
  await withWindow({
    xhs: { launchOptions: { miniToolEnv: { buildVersion: 9462004 } }, miniTool: {
      getStorage: async ({ key }) => ({ data: values.get(key) ?? null }),
      setStorage: async ({ key, data }) => { values.set(key, data); },
    } },
    localStorage: { getItem: () => "complete", setItem: () => assert.fail("native storage should be preferred") },
  }, async () => {
    assert.equal(await readLocalValue("guide"), "complete");
    assert.equal(values.get("guide"), '"complete"');
    assert.equal(await writeLocalValue("feedback", "example"), true);
    assert.equal(await readLocalValue("feedback"), "example");
  });
});

test("blocked browser storage cannot break startup or report a successful save", async () => {
  await withWindow({ get localStorage() { throw new Error("storage blocked"); } }, async () => {
    assert.equal(await readLocalValue("guide"), null);
    assert.equal(await writeLocalValue("feedback", "example"), false);
  });
});

test("native write errors are reported without silently switching stores", async () => {
  await withWindow({
    xhs: { launchOptions: { miniToolEnv: { buildVersion: 9460001 } }, miniTool: {
      setStorage: async () => { throw new Error("quota exceeded"); },
    } },
    localStorage: { setItem: () => assert.fail("do not hide native write errors") },
  }, async () => { assert.equal(await writeLocalValue("feedback", "example"), false); });
});

test("photo saving resolves the async client version and uses a native temporary file", async () => {
  const calls = [];
  await withWindow({ xhs: { miniTool: {
    getLaunchOptions: async () => ({ miniToolEnv: { buildVersion: 9533001 } }),
    writeTempFile: async ({ data }) => { calls.push(data); return { filePath: "native-temp-image" }; },
    saveImageToPhotosAlbum: async ({ filePath }) => { calls.push(filePath); },
  } } }, async () => { await saveReportImage("data:image/png;base64,example"); });
  assert.deepEqual(calls, ["data:image/png;base64,example", "native-temp-image"]);
});

test("unsupported photo saving gives a clear error instead of attempting a download", async () => {
  await withWindow({}, async () => {
    await assert.rejects(saveReportImage("data:image/png;base64,example"), /当前环境不支持保存/);
  });
});
