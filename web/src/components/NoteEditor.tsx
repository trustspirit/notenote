import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState } from "react";
import { useAutosave, type SaveStatus } from "../hooks/useAutosave";
import { organizeWithAI } from "../lib/organizeApi";
import { shareUrls } from "../lib/publicRepository";
import { sanitizeNoteHtml } from "../lib/sanitize";
import type { Note, Notebook } from "../lib/types";
import { ShareToggle } from "./ShareToggle";
import { Toolbar } from "./Toolbar";

interface Props {
  note: Note;
  notebooks: Notebook[];
  onSave: (prev: Note, next: Note) => Promise<void>;
  onDelete: (note: Note) => void;
}

interface Snapshot { title: string; html: string; tags: string[] }

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "저장됨", dirty: "편집 중…", saving: "저장 중…", error: "저장 실패 · 다시 시도",
};

export const editorExtensions = [
  StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
  Highlight,
  TaskList,
  TaskItem.configure({ nested: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Placeholder.configure({ placeholder: "생각나는 대로 적어두세요. 정리는 나중에 AI에게 맡겨도 됩니다." }),
];

/** Mount with `key={note.id}` so switching notes resets all local state. */
export function NoteEditor({ note, notebooks, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [notebookId, setNotebookId] = useState(note.notebookId);
  const [isPublic, setIsPublic] = useState(note.isPublic);
  const [aiState, setAiState] = useState<{ busy: boolean; error?: string; undo?: Snapshot; summary?: string }>({ busy: false });

  // Latest persisted version: the "prev" side for public-mirror diffs.
  const lastSaved = useRef<Note>(note);
  // Fields set outside of React state flow (AI result) that the next save must include.
  const pending = useRef<Partial<Note>>({});

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
      contentHtml: editor.getHTML(),
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

  function addTag(raw: string) {
    const tag = raw.trim().replace(/^#/, "").toLowerCase();
    if (!tag || tags.includes(tag)) return;
    change(setTags)([...tags, tag]);
  }

  if (!editor) return null;

  return (
    <article className="editor">
      <header className="editor-meta">
        <select
          value={notebookId}
          onChange={(e) => change(setNotebookId)(e.target.value)}
          aria-label="노트북"
        >
          {notebooks.map((nb) => <option key={nb.id} value={nb.id}>{nb.name}</option>)}
        </select>
        <span className={`save-status ${autosave.status}`}>{STATUS_TEXT[autosave.status]}</span>
        <div className="spacer" />
        <button
          type="button"
          className="ai-button"
          onClick={organize}
          disabled={aiState.busy || editor.isEmpty}
          title="Claude가 노트를 구조화하고 다듬어 저장합니다"
        >
          {aiState.busy ? "정리하는 중…" : "✦ AI로 정리"}
        </button>
        <button type="button" className="ghost danger" onClick={() => onDelete(lastSaved.current)}>삭제</button>
      </header>

      {aiState.undo && (
        <div className="banner">
          <span>AI가 정리해서 저장했어요. {aiState.summary}</span>
          <button type="button" onClick={undoOrganize}>원래대로</button>
          <button type="button" className="ghost" onClick={() => setAiState({ busy: false })}>닫기</button>
        </div>
      )}
      {aiState.error && (
        <div className="banner error">
          <span>{aiState.error}</span>
          <button type="button" className="ghost" onClick={() => setAiState({ busy: false })}>닫기</button>
        </div>
      )}

      <input
        className="title-input"
        value={title}
        placeholder="제목 없음"
        onChange={(e) => change(setTitle)(e.target.value)}
      />

      <div className="tags">
        {tags.map((t) => (
          <button key={t} type="button" className="tag" onClick={() => change(setTags)(tags.filter((x) => x !== t))} title="태그 제거">
            #{t} ×
          </button>
        ))}
        <input
          className="tag-input"
          placeholder="+ 태그"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(e.currentTarget.value);
              e.currentTarget.value = "";
            }
          }}
        />
      </div>

      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="prose editor-body" />

      <footer className="editor-footer">
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
      </footer>
    </article>
  );
}
