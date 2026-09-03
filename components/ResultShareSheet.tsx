"use client";
/* eslint-disable @next/next/no-img-element -- generated data URL must remain a real image for mobile long-press saving. */

export type ResultShareStatus = "generating" | "ready" | "error";

export function ResultShareSheet({ status, imageUrl, filename, onRetry, onClose }: {
  status: ResultShareStatus;
  imageUrl: string;
  filename: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return <div className="sheet-backdrop result-share-backdrop">
    <button type="button" className="sheet-dismiss" aria-label="关闭战报" onClick={onClose} />
    <section className="result-share-sheet" aria-modal="true" role="dialog" aria-labelledby="result-share-title">
      <button type="button" className="sheet-close" aria-label="关闭" onClick={onClose}>×</button>
      <div className={`result-share-preview is-${status}`}>
        {status === "generating" && <div className="result-card-loading"><i /><strong>正在生成战报</strong><span>把这局写进图片…</span></div>}
        {status === "error" && <div className="result-card-error"><i>!</i><strong>图片生成失败</strong><span>可以再试一次</span></div>}
        {status === "ready" && imageUrl && <img src={imageUrl} alt="本局搜打撤战绩海报" />}
      </div>
      <div className="result-share-copy">
        <small>SHARE REPORT</small>
        <h2 id="result-share-title">长按图片<br />保存或转发</h2>
        <p>手机端长按左侧战报，使用系统菜单保存或转发。图片只包含本局战绩，不会上传操作日志。</p>
        <div className="result-share-actions">
          {status === "ready" && imageUrl
            ? <a href={imageUrl} download={filename}>下载图片</a>
            : <button type="button" disabled={status === "generating"} onClick={onRetry}>{status === "generating" ? "生成中…" : "重新生成"}</button>}
          {status === "ready" && <button type="button" onClick={onRetry}>重新生成</button>}
        </div>
        <em>3:4 竖版战报 · 适合发笔记或聊天</em>
      </div>
    </section>
  </div>;
}
