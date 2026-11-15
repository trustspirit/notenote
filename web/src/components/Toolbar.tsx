import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Toolbar as AstryxToolbar } from "@astryxdesign/core/Toolbar";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Fragment } from "react";
import { useDialogs } from "./Dialogs";

interface Tool {
  label: string;
  glyph: string;
  glyphClass?: string;
  run: (e: Editor) => void | Promise<void>;
  active?: (e: Editor) => boolean;
}

function buildGroups(promptLink: (e: Editor) => Promise<void>): Tool[][] {
  return [
    [
      { label: "실행 취소 (⌘Z)", glyph: "↶", run: (e) => void e.chain().focus().undo().run() },
      { label: "다시 실행 (⇧⌘Z)", glyph: "↷", run: (e) => void e.chain().focus().redo().run() },
    ],
    [
      { label: "제목 1", glyph: "H1", run: (e) => void e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive("heading", { level: 1 }) },
      { label: "제목 2", glyph: "H2", run: (e) => void e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive("heading", { level: 2 }) },
      { label: "제목 3", glyph: "H3", run: (e) => void e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive("heading", { level: 3 }) },
    ],
    [
      { label: "굵게 (⌘B)", glyph: "B", glyphClass: "g-bold", run: (e) => void e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
      { label: "기울임 (⌘I)", glyph: "I", glyphClass: "g-italic", run: (e) => void e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
      { label: "밑줄 (⌘U)", glyph: "U", glyphClass: "g-underline", run: (e) => void e.chain().focus().toggleUnderline().run(), active: (e) => e.isActive("underline") },
      { label: "취소선", glyph: "S", glyphClass: "g-strike", run: (e) => void e.chain().focus().toggleStrike().run(), active: (e) => e.isActive("strike") },
      { label: "형광펜", glyph: "✎", run: (e) => void e.chain().focus().toggleHighlight().run(), active: (e) => e.isActive("highlight") },
      { label: "링크 (⌘K)", glyph: "🔗", run: promptLink, active: (e) => e.isActive("link") },
    ],
    [
      { label: "글머리 목록", glyph: "•≡", run: (e) => void e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
      { label: "번호 목록", glyph: "1≡", run: (e) => void e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
      { label: "체크리스트", glyph: "☑", run: (e) => void e.chain().focus().toggleTaskList().run(), active: (e) => e.isActive("taskList") },
      { label: "인용", glyph: "❝", run: (e) => void e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
      { label: "코드 블록", glyph: "</>", run: (e) => void e.chain().focus().toggleCodeBlock().run(), active: (e) => e.isActive("codeBlock") },
      { label: "구분선", glyph: "―", run: (e) => void e.chain().focus().setHorizontalRule().run() },
    ],
    [
      { label: "왼쪽 정렬", glyph: "⇤", run: (e) => void e.chain().focus().setTextAlign("left").run(), active: (e) => e.isActive({ textAlign: "left" }) },
      { label: "가운데 정렬", glyph: "↔", run: (e) => void e.chain().focus().setTextAlign("center").run(), active: (e) => e.isActive({ textAlign: "center" }) },
      { label: "오른쪽 정렬", glyph: "⇥", run: (e) => void e.chain().focus().setTextAlign("right").run(), active: (e) => e.isActive({ textAlign: "right" }) },
    ],
  ];
}

/** Formatting bar: Astryx Toolbar + ToggleButtons driving the TipTap editor. */
export function Toolbar({ editor }: { editor: Editor }) {
  const { prompt } = useDialogs();

  async function promptLink(e: Editor) {
    const prev = e.getAttributes("link").href as string | undefined;
    const url = await prompt({ title: "링크", label: "URL (비우면 링크 제거)", initialValue: prev ?? "https://", actionLabel: "적용" });
    if (url === null && prev === undefined) return;
    if (!url) e.chain().focus().extendMarkRange("link").unsetLink().run();
    else e.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  const groups = buildGroups(promptLink);
  // Re-render only when the set of active marks changes.
  const activeKey = useEditorState({
    editor,
    selector: ({ editor: e }) => groups.flat().map((t) => (t.active?.(e) ? "1" : "0")).join(""),
  });

  let i = 0;
  return (
    <AstryxToolbar
      label="서식"
      size="sm"
      dividers={["bottom"]}
      startContent={
        <HStack gap={1} vAlign="center" wrap="wrap">
          {groups.map((group, gi) => (
            <Fragment key={gi}>
              {gi > 0 && <Divider orientation="vertical" />}
              {group.map((tool) => {
                const on = activeKey[i++] === "1";
                return (
                  <ToggleButton
                    key={tool.label}
                    label={tool.label}
                    tooltip={tool.label}
                    isIconOnly
                    icon={<span className={`glyph ${tool.glyphClass ?? ""}`}>{tool.glyph}</span>}
                    isPressed={on}
                    onPressedChange={() => void tool.run(editor)}
                  />
                );
              })}
            </Fragment>
          ))}
        </HStack>
      }
    />
  );
}
