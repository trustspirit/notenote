import type { User } from "firebase/auth";
import { useMemo, useState } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import type { Note, Notebook } from "../lib/types";
import { NoteEditor } from "./NoteEditor";
import { NoteList } from "./NoteList";
import { Sidebar, type Filter } from "./Sidebar";

export function Workspace({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { repo, notebooks, notes, loading, isNotebookPublic } = useWorkspace(user);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (filter.kind === "notebook" && n.notebookId !== filter.id) return false;
      if (filter.kind === "tag" && !n.tags.includes(filter.tag)) return false;
      if (!q) return true;
      return n.title.toLowerCase().includes(q) || n.contentHtml.toLowerCase().includes(q);
    });
  }, [notes, filter, search]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const heading =
    filter.kind === "notebook" ? notebooks.find((nb) => nb.id === filter.id)?.name ?? "노트북"
    : filter.kind === "tag" ? `#${filter.tag}` : "모든 노트";

  async function createNote() {
    const notebookId = filter.kind === "notebook" ? filter.id : notebooks[0]?.id;
    if (!notebookId) return;
    const now = Date.now();
    const note: Note = {
      id: repo.newNoteRef().id, notebookId, title: "", contentHtml: "",
      tags: filter.kind === "tag" ? [filter.tag] : [], isPublic: false, createdAt: now, updatedAt: now,
    };
    await repo.saveNote(null, note, isNotebookPublic);
    setSelectedId(note.id);
  }

  async function deleteNote(note: Note) {
    if (!confirm(`"${note.title || "제목 없음"}" 노트를 삭제할까요?`)) return;
    setSelectedId(null);
    await repo.deleteNote(note, isNotebookPublic);
  }

  async function createNotebook() {
    const name = prompt("새 노트북 이름");
    if (!name?.trim()) return;
    const id = await repo.createNotebook(name.trim());
    setFilter({ kind: "notebook", id });
  }

  async function renameNotebook(nb: Notebook) {
    const name = prompt("노트북 이름", nb.name);
    if (name?.trim() && name.trim() !== nb.name) await repo.renameNotebook(nb, name.trim());
  }

  async function deleteNotebook(nb: Notebook) {
    if (notebooks.length <= 1) return alert("마지막 노트북은 삭제할 수 없습니다.");
    const inside = notes.filter((n) => n.notebookId === nb.id);
    if (!confirm(`"${nb.name}"과 안의 노트 ${inside.length}개를 모두 삭제할까요?`)) return;
    setFilter({ kind: "all" });
    setSelectedId(null);
    await repo.deleteNotebook(nb, inside, isNotebookPublic);
  }

  if (loading) return <div className="center-screen">불러오는 중…</div>;

  return (
    <div className="workspace">
      <Sidebar
        user={user}
        notebooks={notebooks}
        notes={notes}
        filter={filter}
        onFilter={(f) => { setFilter(f); setSearch(""); }}
        onCreateNotebook={createNotebook}
        onRenameNotebook={renameNotebook}
        onDeleteNotebook={deleteNotebook}
        onShareNotebook={(nb, isPublic) =>
          repo.setNotebookPublic(nb, isPublic, notes.filter((n) => n.notebookId === nb.id))}
        onSignOut={onSignOut}
      />
      <NoteList
        heading={heading}
        notes={visible}
        selectedId={selectedId}
        search={search}
        onSearch={setSearch}
        onSelect={setSelectedId}
        onCreate={createNote}
      />
      <main className="editor-pane">
        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            notebooks={notebooks}
            onSave={(prev, next) => repo.saveNote(prev, next, isNotebookPublic)}
            onDelete={deleteNote}
          />
        ) : (
          <div className="empty">
            <p className="empty-mark">¶</p>
            <p>노트를 선택하거나 새로 만드세요.</p>
          </div>
        )}
      </main>
    </div>
  );
}
