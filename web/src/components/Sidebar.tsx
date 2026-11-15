import type { User } from "firebase/auth";
import { shareUrls } from "../lib/publicRepository";
import type { Note, Notebook } from "../lib/types";
import { ShareToggle } from "./ShareToggle";

export type Filter = { kind: "all" } | { kind: "notebook"; id: string } | { kind: "tag"; tag: string };

interface Props {
  user: User;
  notebooks: Notebook[];
  notes: Note[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  onCreateNotebook: () => void;
  onRenameNotebook: (nb: Notebook) => void;
  onDeleteNotebook: (nb: Notebook) => void;
  onShareNotebook: (nb: Notebook, isPublic: boolean) => Promise<void>;
  onSignOut: () => void;
}

export function Sidebar(p: Props) {
  const counts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const n of p.notes) {
    counts.set(n.notebookId, (counts.get(n.notebookId) ?? 0) + 1);
    for (const t of n.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const f = p.filter;
  const selectedNb = f.kind === "notebook" ? p.notebooks.find((nb) => nb.id === f.id) : undefined;

  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="brand-mark">¶</span> Marginalia
      </div>

      <button
        type="button"
        className={`side-item ${p.filter.kind === "all" ? "on" : ""}`}
        onClick={() => p.onFilter({ kind: "all" })}
      >
        모든 노트 <span className="count">{p.notes.length}</span>
      </button>

      <div className="side-heading">
        노트북
        <button type="button" className="ghost small" onClick={p.onCreateNotebook} title="새 노트북">＋</button>
      </div>
      {p.notebooks.map((nb) => (
        <button
          type="button"
          key={nb.id}
          className={`side-item ${selectedNb?.id === nb.id ? "on" : ""}`}
          onClick={() => p.onFilter({ kind: "notebook", id: nb.id })}
          onDoubleClick={() => p.onRenameNotebook(nb)}
        >
          {nb.name}
          {nb.isPublic && <span className="public-dot" title="공개 중">공개</span>}
          <span className="count">{counts.get(nb.id) ?? 0}</span>
        </button>
      ))}

      {selectedNb && (
        <div className="notebook-panel">
          <ShareToggle
            label="노트북"
            isPublic={selectedNb.isPublic}
            url={shareUrls.notebook(selectedNb.id)}
            onToggle={(next) => p.onShareNotebook(selectedNb, next)}
          />
          <div className="row">
            <button type="button" className="ghost small" onClick={() => p.onRenameNotebook(selectedNb)}>이름 변경</button>
            <button type="button" className="ghost small danger" onClick={() => p.onDeleteNotebook(selectedNb)}>삭제</button>
          </div>
        </div>
      )}

      {tagCounts.size > 0 && (
        <>
          <div className="side-heading">태그</div>
          <div className="side-tags">
            {[...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, c]) => (
              <button
                type="button"
                key={tag}
                className={`tag ${p.filter.kind === "tag" && p.filter.tag === tag ? "on" : ""}`}
                onClick={() => p.onFilter({ kind: "tag", tag })}
              >
                #{tag} <small>{c}</small>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="sidebar-foot">
        <span>{p.user.displayName ?? p.user.email}</span>
        <button type="button" className="ghost small" onClick={p.onSignOut}>로그아웃</button>
      </div>
    </nav>
  );
}
