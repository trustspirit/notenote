import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";

interface ToolButton {
  label: string;
  title: string;
  run: (e: Editor) => void;
  active?: (e: Editor) => boolean;
  className?: string;
}

const GROUPS: ToolButton[][] = [
  [
    { label: "B", title: "굵게 (⌘B)", className: "b", run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
    { label: "I", title: "기울임 (⌘I)", className: "i", run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
    { label: "U", title: "밑줄 (⌘U)", className: "u", run: (e) => e.chain().focus().toggleUnderline().run(), active: (e) => e.isActive("underline") },
    { label: "S", title: "취소선", className: "s", run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive("strike") },
    { label: "형광", title: "형광펜", run: (e) => e.chain().focus().toggleHighlight().run(), active: (e) => e.isActive("highlight") },
  ],
  [
    { label: "H1", title: "제목 1", run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive("heading", { level: 1 }) },
    { label: "H2", title: "제목 2", run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive("heading", { level: 2 }) },
    { label: "H3", title: "제목 3", run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive("heading", { level: 3 }) },
  ],
  [
    { label: "• 목록", title: "글머리 목록", run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
    { label: "1. 목록", title: "번호 목록", run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
    { label: "☐ 할 일", title: "체크리스트", run: (e) => e.chain().focus().toggleTaskList().run(), active: (e) => e.isActive("taskList") },
    { label: "“ 인용", title: "인용", run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
    { label: "</>", title: "코드 블록", run: (e) => e.chain().focus().toggleCodeBlock().run(), active: (e) => e.isActive("codeBlock") },
    { label: "―", title: "구분선", run: (e) => e.chain().focus().setHorizontalRule().run() },
  ],
  [
    { label: "좌", title: "왼쪽 정렬", run: (e) => e.chain().focus().setTextAlign("left").run(), active: (e) => e.isActive({ textAlign: "left" }) },
    { label: "중", title: "가운데 정렬", run: (e) => e.chain().focus().setTextAlign("center").run(), active: (e) => e.isActive({ textAlign: "center" }) },
    { label: "우", title: "오른쪽 정렬", run: (e) => e.chain().focus().setTextAlign("right").run(), active: (e) => e.isActive({ textAlign: "right" }) },
  ],
  [
    {
      label: "링크", title: "링크",
      run: (e) => {
        const prev = e.getAttributes("link").href as string | undefined;
        const url = window.prompt("링크 URL (비우면 제거)", prev ?? "https://");
        if (url === null) return;
        if (url.trim() === "") e.chain().focus().unsetLink().run();
        else e.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
      },
      active: (e) => e.isActive("link"),
    },
    { label: "↶", title: "실행 취소 (⌘Z)", run: (e) => e.chain().focus().undo().run() },
    { label: "↷", title: "다시 실행 (⇧⌘Z)", run: (e) => e.chain().focus().redo().run() },
  ],
];

export function Toolbar({ editor }: { editor: Editor }) {
  // Re-render only when the set of active marks changes.
  const activeKey = useEditorState({
    editor,
    selector: ({ editor: e }) => GROUPS.flat().map((b) => (b.active?.(e) ? "1" : "0")).join(""),
  });

  let i = 0;
  return (
    <div className="toolbar" role="toolbar" aria-label="서식">
      {GROUPS.map((group, gi) => (
        <div className="toolbar-group" key={gi}>
          {group.map((btn) => {
            const on = activeKey[i++] === "1";
            return (
              <button
                key={btn.title}
                type="button"
                title={btn.title}
                aria-pressed={on}
                className={`tool ${btn.className ?? ""} ${on ? "on" : ""}`}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => btn.run(editor)}
              >
                {btn.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
