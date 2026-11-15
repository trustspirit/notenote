import { useEffect, useState } from "react";
import { formatDate } from "../lib/format";
import { publicRepository } from "../lib/publicRepository";
import { excerpt, sanitizeNoteHtml } from "../lib/sanitize";
import type { PublicNote, PublicNotebook } from "../lib/types";
import { Link } from "../router";

function useLoad<T>(load: () => Promise<T | null>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean }>({ data: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true });
    load()
      .then((data) => alive && setState({ data, loading: false }))
      .catch(() => alive && setState({ data: null, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function PublicShell({ children, crumb }: { children: React.ReactNode; crumb?: React.ReactNode }) {
  return (
    <div className="public">
      <header className="public-head">
        <a className="brand" href="/"><span className="brand-mark">¶</span> Marginalia</a>
        {crumb}
        <span className="readonly-badge">읽기 전용</span>
      </header>
      {children}
    </div>
  );
}

function NotFound() {
  return (
    <PublicShell>
      <div className="public-empty">
        <p className="empty-mark">¶</p>
        <p>공유가 중지되었거나 존재하지 않는 페이지입니다.</p>
      </div>
    </PublicShell>
  );
}

function NoteArticle({ note }: { note: PublicNote }) {
  return (
    <article className="public-article">
      <h1>{note.title || "제목 없음"}</h1>
      <p className="byline">{note.authorName} · {formatDate(note.updatedAt)} 수정</p>
      {note.tags.length > 0 && (
        <div className="tags">{note.tags.map((t) => <span key={t} className="tag static">#{t}</span>)}</div>
      )}
      <div className="prose readonly" dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(note.contentHtml) }} />
    </article>
  );
}

export function PublicNotePage({ noteId }: { noteId: string }) {
  const { data, loading } = useLoad(() => publicRepository.getNote(noteId), [noteId]);
  if (loading) return <div className="center-screen">불러오는 중…</div>;
  if (!data) return <NotFound />;
  return <PublicShell><NoteArticle note={data} /></PublicShell>;
}

export function PublicNotebookPage({ notebookId, noteId }: { notebookId: string; noteId?: string }) {
  const nb = useLoad<PublicNotebook>(() => publicRepository.getNotebook(notebookId), [notebookId]);
  const list = useLoad<PublicNote[]>(() => publicRepository.listNotebookNotes(notebookId), [notebookId]);

  if (nb.loading || list.loading) return <div className="center-screen">불러오는 중…</div>;
  if (!nb.data) return <NotFound />;

  const notes = list.data ?? [];
  const base = `/share/notebook/${notebookId}`;
  const current = noteId ? notes.find((n) => n.id === noteId) : undefined;

  return (
    <PublicShell crumb={<span className="crumb">/ {nb.data.name}</span>}>
      <div className="public-notebook">
        <aside className="public-index">
          <h2><Link to={base}>{nb.data.name}</Link></h2>
          <p className="byline">{nb.data.authorName} · 노트 {notes.length}개</p>
          <ol>
            {notes.map((n) => (
              <li key={n.id}>
                <Link to={`${base}/${n.id}`} className={n.id === noteId ? "on" : ""}>
                  {n.title || "제목 없음"}
                </Link>
              </li>
            ))}
          </ol>
        </aside>
        <div className="public-main">
          {noteId ? (
            current ? <NoteArticle note={current} /> : <p className="public-empty">이 노트는 더 이상 공유되지 않습니다.</p>
          ) : (
            <ul className="public-cards">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link to={`${base}/${n.id}`} className="public-card">
                    <strong>{n.title || "제목 없음"}</strong>
                    <span>{excerpt(n.contentHtml, 180)}</span>
                    <small>{formatDate(n.updatedAt)}</small>
                  </Link>
                </li>
              ))}
              {notes.length === 0 && <p className="public-empty">아직 공유된 노트가 없습니다.</p>}
            </ul>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
