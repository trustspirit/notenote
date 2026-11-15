import { excerpt } from "../lib/sanitize";
import type { Note } from "../lib/types";
import { formatDate } from "../lib/format";

interface Props {
  heading: string;
  notes: Note[];
  selectedId: string | null;
  search: string;
  onSearch: (q: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function NoteList(p: Props) {
  return (
    <section className="note-list">
      <header>
        <h2>{p.heading}</h2>
        <button type="button" className="primary" onClick={p.onCreate}>＋ 새 노트</button>
      </header>
      <input
        className="search"
        type="search"
        placeholder="노트 검색"
        value={p.search}
        onChange={(e) => p.onSearch(e.target.value)}
      />
      <p className="list-count">{p.notes.length}개의 노트</p>
      <ul>
        {p.notes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={`note-card ${p.selectedId === n.id ? "on" : ""}`}
              onClick={() => p.onSelect(n.id)}
            >
              <span className="note-card-title">
                {n.title || "제목 없음"}
                {n.isPublic && <span className="public-dot">공개</span>}
                {n.aiOrganizedAt && <span className="ai-dot" title="AI로 정리됨">✦</span>}
              </span>
              <span className="note-card-excerpt">{excerpt(n.contentHtml) || "내용 없음"}</span>
              <span className="note-card-date">{formatDate(n.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
