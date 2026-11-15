import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack } from "@astryxdesign/core/HStack";
import { Switch } from "@astryxdesign/core/Switch";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
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

  async function toggle(next: boolean) {
    setBusy(true);
    try { await onToggle(next); } finally { setBusy(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <VStack gap={2}>
      <Switch
        label={`${label} 공개 공유`}
        description={isPublic ? "링크가 있는 누구나 읽을 수 있어요 (읽기 전용)" : "나만 볼 수 있어요"}
        value={isPublic}
        isLoading={busy}
        onChange={(checked) => void toggle(checked)}
      />
      {isPublic && (
        <HStack gap={2} vAlign="center" wrap="wrap" className="share-row">
          <div className="share-url">
            <TextInput label="공유 링크" isLabelHidden isReadOnly value={url} size="sm" width="100%" />
          </div>
          <Button label={copied ? "복사됨" : "링크 복사"} icon={<Icon icon={copied ? "checkDouble" : "copy"} />} size="sm" onClick={() => void copy()} />
          <Button label="열기" icon={<Icon icon="externalLink" />} size="sm" variant="ghost" href={url} target="_blank" rel="noreferrer" />
        </HStack>
      )}
    </VStack>
  );
}
