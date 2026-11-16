import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { openableHref } from "../lib/links";
import { useDialogs } from "./Dialogs";

/** Actions for the link under the cursor: open in a new tab, copy the address, edit, remove. */
export function LinkBar({ editor }: { editor: Editor }) {
  const { prompt } = useDialogs();
  const href = useEditorState({
    editor,
    selector: ({ editor: e }) => (e.isActive("link") ? ((e.getAttributes("link").href as string | undefined) ?? "") : null),
  });
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCopied(false); }, [href]);

  if (href === null) return null;
  const target = openableHref(href);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure context, permissions): fall back to a selectable prompt.
      await prompt({ title: "링크 주소", label: "복사해서 사용하세요", initialValue: href ?? "", actionLabel: "닫기" });
    }
  }

  async function edit() {
    const next = await prompt({ title: "링크 수정", label: "URL", initialValue: href ?? "https://", actionLabel: "적용" });
    if (next === null) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: next }).run();
  }

  return (
    <HStack gap={2} vAlign="center" wrap="wrap" className="link-bar" role="group" aria-label="링크 도구">
      <Text type="supporting" maxLines={1} className="link-bar-url">{href || "(주소 없음)"}</Text>
      <HStack gap={1}>
        <Button
          label="새 창에서 열기"
          size="sm"
          variant="secondary"
          isDisabled={!target}
          onClick={() => { if (target) window.open(target, "_blank", "noopener,noreferrer"); }}
        />
        <Button label={copied ? "복사됨" : "주소 복사"} size="sm" variant="secondary" onClick={() => void copy()} />
        <Button label="수정" size="sm" variant="ghost" onClick={() => void edit()} />
        <Button label="링크 해제" size="sm" variant="ghost" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} />
      </HStack>
    </HStack>
  );
}
