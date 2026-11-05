interface MiniTool {
  getLaunchOptions?: () => Promise<{ miniToolEnv?: { buildVersion?: number } }>;
  getStorage?: (options: { key: string }) => Promise<{ data: string | null }>;
  setStorage?: (options: { key: string; data: string }) => Promise<unknown>;
  writeTempFile?: (options: { data: string }) => Promise<{ filePath: string }>;
  saveImageToPhotosAlbum?: (options: { filePath: string }) => Promise<unknown>;
}

async function platform() {
  const xhs = (window as Window & { xhs?: {
    launchOptions?: { miniToolEnv?: { buildVersion?: number } };
    miniTool?: MiniTool;
  } }).xhs;
  let build = Number(xhs?.launchOptions?.miniToolEnv?.buildVersion) || 0;
  if (!build && typeof xhs?.miniTool?.getLaunchOptions === "function") {
    try { build = Number((await xhs.miniTool.getLaunchOptions()).miniToolEnv?.buildVersion) || 0; }
    catch { /* Unknown versions use the documented compatibility path. */ }
  }
  return { api: xhs?.miniTool, version: Math.floor(build / 1000) };
}

function legacyValue(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export async function readLocalValue(key: string): Promise<string | null> {
  const { api, version } = await platform();
  if (version >= 9460 && typeof api?.getStorage === "function") {
    try {
      const { data } = await api.getStorage({ key });
      if (data !== null && data !== undefined) {
        const value: unknown = JSON.parse(data);
        return typeof value === "string" ? value : null;
      }
      // Migrate the old guide flag without clearing any previous user data.
      const old = legacyValue(key);
      if (old !== null && typeof api.setStorage === "function") {
        await api.setStorage({ key, data: JSON.stringify(old) });
      }
      return old;
    } catch { return null; }
  }
  return legacyValue(key);
}

export async function writeLocalValue(key: string, value: string): Promise<boolean> {
  const { api, version } = await platform();
  if (version >= 9460 && typeof api?.setStorage === "function") {
    try { await api.setStorage({ key, data: JSON.stringify(value) }); return true; }
    catch { return false; }
  }
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}

export async function saveReportImage(data: string): Promise<void> {
  const { api, version } = await platform();
  if (version < 9420 || typeof api?.saveImageToPhotosAlbum !== "function") {
    throw new Error("当前环境不支持保存，请使用新版小红书打开");
  }
  const filePath = typeof api.writeTempFile === "function"
    ? (await api.writeTempFile({ data })).filePath : data;
  await api.saveImageToPhotosAlbum({ filePath });
}
