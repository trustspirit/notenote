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
import { useMemo, useRef, useState } from "react";
import { useDriveBackup } from "../hooks/useDriveBackup";
import { useNoteSearch } from "../hooks/useNoteSearch";
import { useWorkspace } from "../hooks/useWorkspace";
import { shareUrls } from "../lib/publicRepository";
import { groupNotebookNotes, type MoveTarget } from "../lib/folders";
import { ROOT, orderUpdates, topOrder } from "../lib/placement";
import { createMindmap, mindmapToHtml } from "../lib/mindmap";
import type { Folder, Note, Notebook, NoteKind } from "../lib/types";
import { useDialogs } from "./Dialogs";
import { DriveBackupButton } from "./DriveBackup";
import { Loading } from "./Loading";
import { LogoMark } from "./Logo";
import { NoteEditor, type EditorControl } from "./NoteEditor";
import { NoteList } from "./NoteList";
import { ShareToggle } from "./ShareToggle";
import { Sidebar, type Filter } from "./Sidebar";

export function Workspace({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { repo, notebooks, notes, folders, loading } = useWorkspace(user);
  const backup = useDriveBackup(user, notes, notebooks, !loading);
  const dialogs = useDialogs();
  const editorControl = useRef<EditorControl | null>(null);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Below 900px the list and the editor share one column: list first, editor after a pick.
  const isNarrow = useMediaQuery("(max-width: 899px)");

  const matches = useNoteSearch(notes, search);
  const visible = useMemo(() => notes.filter((n) => {
    if (filter.kind === "notebook" && n.notebookId !== filter.id) return false;
    if (filter.kind === "tag" && !n.tags.includes(filter.tag)) return false;
    return matches(n);
  }), [notes, filter, matches]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  // The editor must never write back a stale notebook/folder: placement is owned by moveNote.
  const latestNotes = useRef(notes);
  latestNotes.current = notes;
  const selectedNb = filter.kind === "notebook" ? notebooks.find((nb) => nb.id === filter.id) : undefined;
  const tree = useMemo(
    () => (selectedNb && !search.trim() ? groupNotebookNotes(notes, folders, selectedNb.id) : null),
    [selectedNb, search, notes, folders],
  );
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
    const top = topOrder(notes.filter((n) => n.notebookId === notebookId && !n.folderId).map((n) => n.order));
    if (top !== undefined) note.order = top;
    if (kind === "mindmap") {
      note.mindmap = createMindmap("중심 주제", () => crypto.randomUUID().slice(0, 8));
      note.contentHtml = mindmapToHtml(note.mindmap);
    }
    await repo.saveNote(note);
    setSelectedId(note.id);
  }

  async function moveNote(note: Note, to: MoveTarget) {
    // Land at the top of the destination, like a new note.
    const siblings = notes.filter((n) => n.notebookId === to.notebookId && (to.folderId ? n.folderId === to.folderId : !n.folderId));
    await repo.moveNote(note, { notebookId: to.notebookId, folderId: to.folderId, order: topOrder(siblings.map((n) => n.order)) });
  }

  /** Drag and drop: the note ended up in `container` (a folder id, or ROOT) with `orderedIds` as its sequence. */
  async function placeNote(noteId: string, container: string, orderedIds: string[]) {
    const folderId = container === ROOT ? null : container;
    const orders = Object.fromEntries(orderedIds.map((id) => [id, notes.find((n) => n.id === id)?.order]));
    const ops = orderUpdates(orderedIds, orders, noteId).map((u) => ({
      kind: "note" as const, id: u.id, patch: u.id === noteId ? { order: u.order, folderId } : { order: u.order },
    }));
    await repo.applyPlacement(ops);
  }

  async function placeFolder(folderId: string, orderedIds: string[]) {
    const orders = Object.fromEntries(orderedIds.map((id) => [id, folders.find((f) => f.id === id)?.order]));
    await repo.applyPlacement(orderUpdates(orderedIds, orders, folderId).map((u) => ({
      kind: "folder" as const, id: u.id, patch: { order: u.order },
    })));
  }

  /** Save from the editor, keeping the note where moveNote last put it. */
  function saveFromEditor(next: Note) {
    const current = latestNotes.current.find((n) => n.id === next.id);
    return repo.saveNote(current
      ? { ...next, notebookId: current.notebookId, folderId: current.folderId ?? null, ...(current.order !== undefined && { order: current.order }) }
      : next);
  }

  async function createFolder() {
    if (!selectedNb) return;
    const name = await dialogs.prompt({ title: "새 폴더", label: "폴더 이름", actionLabel: "만들기" });
    if (name) await repo.createFolder(selectedNb.id, name);
  }

  async function renameFolder(folder: Folder) {
    const name = await dialogs.prompt({ title: "폴더 이름 변경", label: "폴더 이름", initialValue: folder.name, actionLabel: "저장" });
    if (name && name !== folder.name) await repo.renameFolder(folder, name);
  }

  async function deleteFolder(folder: Folder) {
    const inside = notes.filter((n) => n.folderId === folder.id);
    const ok = await dialogs.confirm({
      title: "폴더 삭제",
      description: inside.length
        ? `"${folder.name}" 폴더를 삭제할까요? 안의 노트 ${inside.length}개는 삭제되지 않고 노트북 맨 위 목록으로 나와요.`
        : `"${folder.name}" 폴더를 삭제할까요?`,
      actionLabel: "폴더 삭제",
    });
    if (ok) await repo.deleteFolder(folder, inside);
  }

  async function deleteNote(note: Note) {
    const ok = await dialogs.confirm({
      title: "노트 삭제",
      description: `"${note.title || "제목 없음"}" 노트를 삭제할까요? 공개 링크도 함께 사라집니다.`,
      actionLabel: "삭제",
    });
    if (!ok) return;
    // Drop pending edits first, or the editor's unmount save would re-create the note.
    if (editorControl.current?.noteId === note.id) editorControl.current.discard();
    // The list can now delete a note other than the open one; keep the open editor in that case.
    if (selectedId === note.id) setSelectedId(null);
    await repo.deleteNote(note);
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
    const open = editorControl.current;
    if (open && inside.some((n) => n.id === open.noteId)) open.discard();
    else await open?.flush();
    setFilter({ kind: "all" });
    setSelectedId(null);
    await repo.deleteNotebook(nb, inside, folders.filter((f) => f.notebookId === nb.id));
  }

  // Save the open note while still signed in: after sign-out the rules reject the write.
  async function signOut() {
    await editorControl.current?.flush();
    onSignOut();
  }

  if (loading) return <Loading />;

  const topNav = (
    <TopNav
      label="상단 메뉴"
      heading={<TopNavHeading logo={<LogoMark />} heading="Pensieve" />}
      endContent={
        <HStack gap={2} vAlign="center">
          <DriveBackupButton backup={backup} isCompact={isNarrow} />
          {!isNarrow && <Text type="supporting">{user.displayName ?? user.email}</Text>}
          <Button label="로그아웃" size="sm" variant="ghost" onClick={() => void signOut()} />
        </HStack>
      }
    />
  );

  const notebookControls = selectedNb && (
    <VStack gap={2} className="notebook-controls">
      <ShareToggle
        label="노트북"
        isPublic={selectedNb.isPublic}
        url={shareUrls.notebook(user.uid, selectedNb.id)}
        onToggle={(next) => repo.setNotebookPublic(selectedNb, next)}
      />
      <HStack gap={1} wrap="wrap">
        <Button label="새 폴더" size="sm" variant="secondary" onClick={() => void createFolder()} />
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
      onDelete={(n) => void deleteNote(n)}
      notebooks={notebooks}
      folders={folders}
      tree={tree}
      onMove={(n, to) => void moveNote(n, to)}
      onPlaceNote={placeNote}
      onPlaceFolder={placeFolder}
      onRenameFolder={(f) => void renameFolder(f)}
      onDeleteFolder={(f) => void deleteFolder(f)}
      headerExtra={notebookControls ?? (filter.kind === "tag" && (
        <Button label="태그 필터 해제" size="sm" variant="secondary" onClick={() => setFilter({ kind: "all" })} />
      ))}
    />
  );

  const editorView = selected ? (
    <NoteEditor
      key={selected.id}
      note={selected}
      ownerUid={user.uid}
      controlRef={editorControl}
      notebooks={notebooks}
      folders={folders}
      onMove={(n, to) => void moveNote(n, to)}
      onSave={saveFromEditor}
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
