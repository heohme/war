/* eslint-disable @next/next/no-img-element -- generated local image preview. */
import { useState } from "react";
import type { ResultShareStatus } from "../components/ResultShareSheet";
import { saveReportImage } from "./platform";

export function ResultShareSheet({ status, imageUrl, onRetry, onClose }: {
  status: ResultShareStatus; imageUrl: string; onRetry: () => void; onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const save = async () => {
    if (saving || !imageUrl) return;
    setSaving(true); setNotice("");
    try { await saveReportImage(imageUrl); setNotice("已保存到相册，可以从相册分享战报"); }
    catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败，请检查相册权限后重试");
    } finally { setSaving(false); }
  };
  return <div className="sheet-backdrop result-share-backdrop">
    <button type="button" className="sheet-dismiss" aria-label="关闭战报" onClick={onClose} />
    <section className="result-share-sheet" aria-modal="true" role="dialog" aria-labelledby="result-share-title">
      <button type="button" className="sheet-close" aria-label="关闭" onClick={onClose}>×</button>
      <div className={`result-share-preview is-${status}`}>
        {status === "generating" && <div className="result-card-loading"><strong>正在生成战报</strong></div>}
        {status === "error" && <div className="result-card-error"><strong>图片生成失败</strong></div>}
        {status === "ready" && imageUrl && <img src={imageUrl} alt="本局搜打撤战绩海报" />}
      </div>
      <div className="result-share-copy">
        <small>SHARE REPORT</small><h2 id="result-share-title">保存这局战报</h2>
        <p>保存至相册后，可在笔记或聊天中分享。图片只包含本局战绩。</p>
        <div className="result-share-actions">
          {status === "ready" && imageUrl && <button type="button" disabled={saving} onClick={save}>{saving ? "保存中…" : "保存到相册"}</button>}
          <button type="button" disabled={saving || status === "generating"} onClick={onRetry}>重新生成</button>
        </div>
        {notice && <p role="status">{notice}</p>}
        <em>3:4 竖版战报 · 适合发笔记或聊天</em>
      </div>
    </section>
  </div>;
}
