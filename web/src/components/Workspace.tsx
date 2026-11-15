import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { VStack } from "@astryxdesign/core/VStack";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import type { User } from "firebase/auth";
import { useMemo, useState } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { shareUrls } from "../lib/publicRepository";
import { createMindmap, mindmapToHtml } from "../lib/mindmap";
import type { Note, Notebook, NoteKind } from "../lib/types";
import { useDialogs } from "./Dialogs";
import { Loading } from "./Loading";
import { LogoMark } from "./Logo";
import { NoteEditor } from "./NoteEditor";
import { NoteList } from "./NoteList";
import { ShareToggle } from "./ShareToggle";
import { Sidebar, type Filter } from "./Sidebar";

export function Workspace({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { repo, notebooks, notes, loading, isNotebookPublic } = useWorkspace(user);
  const dialogs = useDialogs();
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Below 900px the list and the editor share one column: list first, editor after a pick.
  const isNarrow = useMediaQuery("(max-width: 899px)");

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
  const selectedNb = filter.kind === "notebook" ? notebooks.find((nb) => nb.id === filter.id) : undefined;
  const heading = selectedNb?.name ?? (filter.kind === "tag" ? `#${filter.tag}` : "모든 노트");

  async function createNote(kind: NoteKind = "text") {
    const notebookId = selectedNb?.id ?? notebooks[0]?.id;
    if (!notebookId) return;
    const now = Date.now();
    const note: Note = {
      id: repo.newNoteRef().id, notebookId, title: "", contentHtml: "",
      tags: filter.kind === "tag" ? [filter.tag] : [], isPublic: false, createdAt: now, updatedAt: now,
      kind,
    };
    if (kind === "mindmap") {
      note.mindmap = createMindmap("중심 주제", () => crypto.randomUUID().slice(0, 8));
      note.contentHtml = mindmapToHtml(note.mindmap);
    }
    await repo.saveNote(null, note, isNotebookPublic);
    setSelectedId(note.id);
  }

  async function deleteNote(note: Note) {
    const ok = await dialogs.confirm({
      title: "노트 삭제",
      description: `"${note.title || "제목 없음"}" 노트를 삭제할까요? 공개 링크도 함께 사라집니다.`,
      actionLabel: "삭제",
    });
    if (!ok) return;
    setSelectedId(null);
    await repo.deleteNote(note, isNotebookPublic);
  }

  async function createNotebook() {
    const name = await dialogs.prompt({ title: "새 노트북", label: "노트북 이름", actionLabel: "만들기" });
    if (!name) return;
    const id = await repo.createNotebook(name);
    setFilter({ kind: "notebook", id });
  }

  async function renameNotebook(nb: Notebook) {
    const name = await dialogs.prompt({ title: "노트북 이름 변경", label: "노트북 이름", initialValue: nb.name, actionLabel: "저장" });
    if (name && name !== nb.name) await repo.renameNotebook(nb, name);
  }

  async function deleteNotebook(nb: Notebook) {
    if (notebooks.length <= 1) {
      await dialogs.confirm({ title: "삭제할 수 없어요", description: "마지막 노트북은 삭제할 수 없습니다.", actionLabel: "확인" });
      return;
    }
    const inside = notes.filter((n) => n.notebookId === nb.id);
    const ok = await dialogs.confirm({
      title: "노트북 삭제",
      description: `"${nb.name}"과 안의 노트 ${inside.length}개를 모두 삭제할까요?`,
      actionLabel: "모두 삭제",
    });
    if (!ok) return;
    setFilter({ kind: "all" });
    setSelectedId(null);
    await repo.deleteNotebook(nb, inside, isNotebookPublic);
  }

  if (loading) return <Loading />;

  const topNav = (
    <TopNav
      label="상단 메뉴"
      heading={<TopNavHeading logo={<LogoMark />} heading="Pensieve" />}
      endContent={
        <HStack gap={2} vAlign="center">
          {!isNarrow && <Text type="supporting">{user.displayName ?? user.email}</Text>}
          <Button label="로그아웃" size="sm" variant="ghost" onClick={onSignOut} />
        </HStack>
      }
    />
  );

  const notebookControls = selectedNb && (
    <VStack gap={2} className="notebook-controls">
      <ShareToggle
        label="노트북"
        isPublic={selectedNb.isPublic}
        url={shareUrls.notebook(selectedNb.id)}
        onToggle={(next) => repo.setNotebookPublic(selectedNb, next, notes.filter((n) => n.notebookId === selectedNb.id))}
      />
      <HStack gap={1}>
        <Button label="이름 변경" size="sm" variant="ghost" onClick={() => void renameNotebook(selectedNb)} />
        <Button label="노트북 삭제" size="sm" variant="ghost" onClick={() => void deleteNotebook(selectedNb)} />
      </HStack>
    </VStack>
  );

  const listView = (
    <NoteList
      heading={heading}
      notes={visible}
      selectedId={selectedId}
      search={search}
      onSearch={setSearch}
      onSelect={setSelectedId}
      onCreate={() => void createNote()}
      onCreateMindmap={() => void createNote("mindmap")}
      headerExtra={notebookControls}
    />
  );

  const editorView = selected ? (
    <NoteEditor
      key={selected.id}
      note={selected}
      notebooks={notebooks}
      onSave={(prev, next) => repo.saveNote(prev, next, isNotebookPublic)}
      onDelete={(n) => void deleteNote(n)}
      onBack={isNarrow ? () => setSelectedId(null) : undefined}
    />
  ) : (
    <div className="center-screen">
      <EmptyState
        title="노트를 선택하세요"
        description="왼쪽 목록에서 노트를 고르거나 새로 만들어 보세요."
        actions={<Button label="새 노트" variant="primary" onClick={() => void createNote()} />}
      />
    </div>
  );

  return (
    <AppShell
      topNav={topNav}
      sideNav={
        <Sidebar
          notebooks={notebooks}
          notes={notes}
          filter={filter}
          onFilter={(f) => { setFilter(f); setSearch(""); }}
          onCreateNotebook={() => void createNotebook()}
        />
      }
    >
      {isNarrow ? (
        <Layout content={<LayoutContent isScrollable padding={0} label={selected ? "편집기" : "노트 목록"}>
          {selected ? editorView : <div className="narrow-list">{listView}</div>}
        </LayoutContent>} />
      ) : (
        <Layout
          start={
            <LayoutPanel width={340} hasDivider isScrollable padding={4} label="노트 목록">
              {listView}
            </LayoutPanel>
          }
          content={
            <LayoutContent isScrollable padding={0} label="편집기">
              {editorView}
            </LayoutContent>
          }
        />
      )}
    </AppShell>
  );
}
