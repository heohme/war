export interface FeedbackPayload {
  description: string;
  logs: Array<{ at: number; type: string; detail: string }>;
  context: Record<string, string | number | boolean | null>;
}

export function sanitizeFeedback(value: unknown): FeedbackPayload | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const description = typeof source.description === "string" ? source.description.trim().slice(0, 600) : "";
  if (!description) return null;
  const logs = Array.isArray(source.logs) ? source.logs.slice(-40).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const type = typeof entry.type === "string" ? entry.type.slice(0, 40) : "";
    const detail = typeof entry.detail === "string" ? entry.detail.slice(0, 240) : "";
    const at = typeof entry.at === "number" && Number.isFinite(entry.at) ? entry.at : Date.now();
    return type && detail ? [{ at, type, detail }] : [];
  }) : [];
  const context: FeedbackPayload["context"] = {};
  const rawContext = source.context && typeof source.context === "object" ? source.context as Record<string, unknown> : {};
  for (const key of ["screen", "roomId", "side", "round", "stage", "mode", "viewport", "path", "userAgent"]) {
    const item = rawContext[key];
    if (typeof item === "string") context[key] = item.slice(0, key === "userAgent" ? 180 : 100);
    else if (typeof item === "number" || typeof item === "boolean" || item === null) context[key] = item;
  }
  return { description, logs, context };
}
