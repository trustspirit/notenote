import { AppShell } from "@astryxdesign/core/AppShell";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { formatDate } from "../lib/format";
import { publicRepository } from "../lib/publicRepository";
import { excerpt, sanitizeNoteHtml } from "../lib/sanitize";
import type { PublicNote, PublicNotebook } from "../lib/types";
import { navigate } from "../router";
import { Loading } from "./Loading";
import { LogoMark } from "./Logo";
import { MindMapCanvas } from "./MindMapCanvas";

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

/** In-app navigation for links that keep a real href (open-in-new-tab still works). */
const go = (to: string) => (e: MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  navigate(to);
};

function PublicShell({ children, sideNav, subheading }: { children: ReactNode; sideNav?: ReactNode; subheading?: string }) {
  return (
    <AppShell
      contentPadding={0}
      sideNav={sideNav}
      topNav={
        <TopNav
          label="상단 메뉴"
          heading={<TopNavHeading logo={<LogoMark />} heading="Pensieve" headingHref="/" subheading={subheading} />}
          endContent={<Badge variant="neutral" label="읽기 전용" />}
        />
      }
    >
      {children}
    </AppShell>
  );
}

function NotFound() {
  return (
    <PublicShell>
      <div className="center-screen">
        <EmptyState title="페이지를 찾을 수 없어요" description="공유가 중지되었거나 존재하지 않는 페이지입니다." />
      </div>
    </PublicShell>
  );
}

function NoteArticle({ note }: { note: PublicNote }) {
  return (
    <article className="public-article">
      <VStack gap={2}>
        <Heading level={1}>{note.title || "제목 없음"}</Heading>
        <Text type="supporting">{note.authorName} · {formatDate(note.updatedAt)} 수정</Text>
        {note.tags.length > 0 && (
          <HStack gap={1} wrap="wrap">
            {note.tags.map((t) => <Token key={t} size="sm" color="blue" label={`#${t}`} />)}
          </HStack>
        )}
      </VStack>
      {note.kind === "mindmap" && note.mindmap?.length ? (
        <>
          <MindMapCanvas nodes={note.mindmap} height="min(70dvh, 640px)" />
          <details className="mm-outline">
            <summary>목록으로 보기</summary>
            <div className="prose readonly" dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(note.contentHtml) }} />
          </details>
        </>
      ) : (
        <div className="prose readonly" dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(note.contentHtml) }} />
      )}
    </article>
  );
}

export function PublicNotePage({ noteId }: { noteId: string }) {
  const { data, loading } = useLoad(() => publicRepository.getNote(noteId), [noteId]);
  if (loading) return <Loading />;
  if (!data) return <NotFound />;
  return <PublicShell><NoteArticle note={data} /></PublicShell>;
}

export function PublicNotebookPage({ notebookId, noteId }: { notebookId: string; noteId?: string }) {
  const nb = useLoad<PublicNotebook>(() => publicRepository.getNotebook(notebookId), [notebookId]);
  const list = useLoad<PublicNote[]>(() => publicRepository.listNotebookNotes(notebookId), [notebookId]);

  if (nb.loading || list.loading) return <Loading />;
  if (!nb.data) return <NotFound />;

  const notes = list.data ?? [];
  const base = `/share/notebook/${notebookId}`;
  const current = noteId ? notes.find((n) => n.id === noteId) : undefined;

  const sideNav = (
    <SideNav>
      <SideNavSection title={nb.data.name} subtitle={`${nb.data.authorName} · 노트 ${notes.length}개`}>
        <SideNavItem label="전체 목록" href={base} isSelected={!noteId} onClick={go(base)} />
        {notes.map((n) => (
          <SideNavItem
            key={n.id}
            label={n.title || "제목 없음"}
            href={`${base}/${n.id}`}
            isSelected={n.id === noteId}
            onClick={go(`${base}/${n.id}`)}
          />
        ))}
      </SideNavSection>
    </SideNav>
  );

  return (
    <PublicShell sideNav={sideNav} subheading={nb.data.name}>
      {noteId ? (
        current ? <NoteArticle key={current.id} note={current} /> : (
          <div className="center-screen"><EmptyState title="공유되지 않는 노트" description="이 노트는 더 이상 공유되지 않습니다." /></div>
        )
      ) : (
        <div className="public-list">
          <VStack gap={1}>
            <Heading level={1}>{nb.data.name}</Heading>
            <Text type="supporting">{nb.data.authorName} · 노트 {notes.length}개</Text>
          </VStack>
          {notes.length === 0 ? (
            <EmptyState title="아직 공유된 노트가 없어요" />
          ) : (
            <VStack gap={3}>
              {notes.map((n) => (
                <a key={n.id} className="public-card" href={`${base}/${n.id}`} onClick={go(`${base}/${n.id}`)}>
                  <Card padding={4}>
                    <VStack gap={1}>
                      <Heading level={3}>{n.title || "제목 없음"}</Heading>
                      <Text color="secondary" maxLines={2}>{excerpt(n.contentHtml, 180)}</Text>
                      <Text type="supporting" size="2xs">{formatDate(n.updatedAt)}</Text>
                    </VStack>
                  </Card>
                </a>
              ))}
            </VStack>
          )}
        </div>
      )}
    </PublicShell>
  );
}
