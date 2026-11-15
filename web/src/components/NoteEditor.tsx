import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ListTree } from "lucide-react";
import { useRef, useState } from "react";
import { useAutosave, type SaveStatus } from "../hooks/useAutosave";
import { createMindmap, mindmapToHtml, type MindNode } from "../lib/mindmap";
import { organizeWithAI } from "../lib/organizeApi";
import { shareUrls } from "../lib/publicRepository";
import { sanitizeNoteHtml } from "../lib/sanitize";
import type { Note, Notebook } from "../lib/types";
import { MindMapCanvas } from "./MindMapCanvas";
import { ShareToggle } from "./ShareToggle";
import { Toolbar } from "./Toolbar";

interface Props {
  note: Note;
  notebooks: Notebook[];
  onSave: (prev: Note, next: Note) => Promise<void>;
  onDelete: (note: Note) => void;
  /** Narrow screens: go back to the note list. */
  onBack?: () => void;
}

interface Snapshot { title: string; html: string; tags: string[] }

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "저장됨", dirty: "편집 중…", saving: "저장 중…", error: "저장 실패 · 다시 시도",
};
const STATUS_BADGE = { saved: "success", dirty: "neutral", saving: "info", error: "error" } as const;

export const editorExtensions = [
  StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
  Highlight,
  TaskList,
  TaskItem.configure({ nested: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Placeholder.configure({ placeholder: "생각나는 대로 적어두세요. 정리는 나중에 해도 돼요." }),
];

/** Mount with `key={note.id}` so switching notes resets all local state. */
export function NoteEditor({ note, notebooks, onSave, onDelete, onBack }: Props) {
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [notebookId, setNotebookId] = useState(note.notebookId);
  const [isPublic, setIsPublic] = useState(note.isPublic);
  const [aiState, setAiState] = useState<{ busy: boolean; error?: string; undo?: Snapshot; summary?: string }>({ busy: false });

  // Latest persisted version: the "prev" side for public-mirror diffs.
  const lastSaved = useRef<Note>(note);
  // Fields set outside of React state flow (AI result) that the next save must include.
  const pending = useRef<Partial<Note>>({});
  const isMindmap = note.kind === "mindmap";
  const mindmap = useRef<MindNode[]>(
    note.mindmap ?? createMindmap(note.title, () => crypto.randomUUID().slice(0, 8)),
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: note.contentHtml,
    onUpdate: () => autosave.schedule(),
  });

  // Read values through refs at save time so a debounced save sees the latest edits.
  const fields = useRef({ title, tags, notebookId, isPublic });
  fields.current = { title, tags, notebookId, isPublic };

  const autosave = useAutosave(async () => {
    if (!editor) return;
    const next: Note = {
      ...lastSaved.current,
      ...fields.current,
      ...pending.current,
      ...(isMindmap
        ? { mindmap: mindmap.current, contentHtml: mindmapToHtml(mindmap.current) }
        : { contentHtml: editor.getHTML() }),
      updatedAt: Date.now(),
    };
    pending.current = {};
    await onSave(lastSaved.current, next);
    lastSaved.current = next;
  });

  // Debounced save runs after the re-render, so `fields` already holds the new value.
  function change<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      autosave.schedule();
    };
  }

  async function organize() {
    if (!editor || editor.isEmpty) return;
    await autosave.flush();
    const before: Snapshot = { title: fields.current.title, html: editor.getHTML(), tags: fields.current.tags };
    setAiState({ busy: true });
    try {
      const result = await organizeWithAI(before.title, before.html);
      editor.commands.setContent(sanitizeNoteHtml(result.html), { emitUpdate: false });
      setTitle(result.title);
      setTags(result.tags);
      fields.current = { ...fields.current, title: result.title, tags: result.tags };
      pending.current = { aiOrganizedAt: Date.now() };
      autosave.schedule();
      await autosave.flush();
      setAiState({ busy: false, undo: before, summary: result.summary });
    } catch (err) {
      setAiState({ busy: false, error: err instanceof Error ? err.message : "정리에 실패했습니다." });
    }
  }

  async function undoOrganize() {
    const snap = aiState.undo;
    if (!editor || !snap) return;
    editor.commands.setContent(snap.html, { emitUpdate: false });
    setTitle(snap.title);
    setTags(snap.tags);
    fields.current = { ...fields.current, title: snap.title, tags: snap.tags };
    autosave.schedule();
    await autosave.flush();
    setAiState({ busy: false });
  }

  const [tagDraft, setTagDraft] = useState("");
  function addTag(raw: string) {
    const tag = raw.trim().replace(/^#/, "").toLowerCase();
    setTagDraft("");
    if (!tag || tags.includes(tag)) return;
    change(setTags)([...tags, tag]);
  }

  if (!editor) return null;

  return (
    <article className="editor">
      <HStack gap={2} vAlign="center" wrap="wrap" className="editor-meta">
        {onBack && (
          <IconButton
            label="목록으로"
            tooltip="목록으로"
            variant="ghost"
            icon={<Icon icon="chevronLeft" />}
            onClick={() => { void autosave.flush(); onBack(); }}
          />
        )}
        <Selector
          label="노트북"
          isLabelHidden
          size="sm"
          width={180}
          value={notebookId}
          options={notebooks.map((nb) => ({ value: nb.id, label: nb.name }))}
          onChange={(v) => change(setNotebookId)(v)}
        />
        <Badge variant={STATUS_BADGE[autosave.status]} label={STATUS_TEXT[autosave.status]} />
        <div className="spacer" />
        {!isMindmap && <Button
          label={aiState.busy ? "정리하는 중…" : "정리하기"}
          icon={<ListTree size={16} strokeWidth={2} aria-hidden />}
          variant="secondary"
          isLoading={aiState.busy}
          isDisabled={editor.isEmpty}
          tooltip="제목·문단·목록을 정돈해서 다시 저장해요"
          onClick={() => void organize()}
        />}
        <Button label="삭제" variant="ghost" onClick={() => onDelete(lastSaved.current)} />
      </HStack>

      {aiState.undo && (
        <Banner
          status="success"
          title="노트를 정리했어요"
          description={aiState.summary}
          isDismissable
          dismissLabel="닫기"
          onDismiss={() => setAiState({ busy: false })}
          endContent={<Button label="원래대로" size="sm" onClick={() => void undoOrganize()} />}
        />
      )}
      {aiState.error && (
        <Banner
          status="error"
          title="정리하지 못했어요"
          description={aiState.error}
          isDismissable
          dismissLabel="닫기"
          onDismiss={() => setAiState({ busy: false })}
        />
      )}

      <input
        className="title-input"
        value={title}
        placeholder="제목 없음"
        aria-label="제목"
        onChange={(e) => change(setTitle)(e.target.value)}
      />

      <HStack gap={1} vAlign="center" wrap="wrap" className="tags">
        {tags.map((t) => (
          <Token
            key={t}
            label={`#${t}`}
            size="sm"
            color="blue"
            onRemove={() => change(setTags)(tags.filter((x) => x !== t))}
          />
        ))}
        <TextInput
          label="태그 추가"
          isLabelHidden
          size="sm"
          width={140}
          placeholder="+ 태그 (Enter)"
          value={tagDraft}
          onChange={setTagDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagDraft);
            }
          }}
        />
      </HStack>

      {isMindmap ? (
        <MindMapCanvas
          nodes={mindmap.current}
          height="max(420px, calc(100dvh - 330px))"
          onChange={(next) => { mindmap.current = next; autosave.schedule(); }}
        />
      ) : (
        <Card padding={0}>
          <Toolbar editor={editor} />
          <EditorContent editor={editor} className="prose editor-body" />
        </Card>
      )}

      <Card padding={4} className="editor-footer">
        <ShareToggle
          label="이 노트"
          isPublic={isPublic}
          url={shareUrls.note(note.id)}
          onToggle={async (next) => {
            // Save right away (not debounced) so the link works the moment it's shown.
            setIsPublic(next);
            fields.current = { ...fields.current, isPublic: next };
            autosave.schedule();
            await autosave.flush();
          }}
        />
      </Card>
    </article>
  );
}
