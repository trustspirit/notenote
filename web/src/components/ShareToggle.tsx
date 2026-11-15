import { useState } from "react";

interface Props {
  isPublic: boolean;
  url: string;
  label: string;
  onToggle: (next: boolean) => Promise<void> | void;
}

/** Public/private switch + copyable read-only link. */
export function ShareToggle({ isPublic, url, label, onToggle }: Props) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function toggle() {
    setBusy(true);
    try { await onToggle(!isPublic); } finally { setBusy(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="share">
      <label className="switch">
        <input type="checkbox" checked={isPublic} disabled={busy} onChange={toggle} />
        <span>{isPublic ? `${label} 공개 중 · 읽기 전용` : `${label} 비공개`}</span>
      </label>
      {isPublic && (
        <div className="share-link">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" onClick={copy}>{copied ? "복사됨" : "링크 복사"}</button>
          <a href={url} target="_blank" rel="noreferrer">열기 ↗</a>
        </div>
      )}
    </div>
  );
}
