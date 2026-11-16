import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { IconButton } from "@astryxdesign/core/IconButton";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { ChevronDown, ChevronRight, FolderClosed, MoreHorizontal, Network } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { formatDate } from "../lib/format";
import { moveTargets, type MoveTarget, type NotebookTree } from "../lib/folders";
import { ACTION_WIDTH, lockAxis, settleOpen, swipeOffset } from "../lib/swipe";
import { excerpt } from "../lib/sanitize";
import type { Folder, Note, Notebook } from "../lib/types";

interface Props {
  heading: string;
  notes: Note[];
  selectedId: string | null;
  search: string;
  onSearch: (q: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onCreateMindmap: () => void;
  /** Delete a note (the caller confirms). Triggered by the touch swipe action. */
  onDelete: (note: Note) => void;
  /** Notebook share/rename/delete controls when a notebook is selected. */
  headerExtra?: ReactNode;
  notebooks: Notebook[];
  folders: Folder[];
  /** Set while a whole notebook is shown without search: renders its folders instead of a flat list. */
  tree: NotebookTree | null;
  onMove: (note: Note, to: MoveTarget) => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
}

/** Touch-only swipe-left row that reveals a delete button. Vertical scroll stays native (touch-action: pan-y). */
function SwipeRow({ open, onOpenChange, onDelete, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; onDelete: () => void; children: ReactNode;
}) {
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; startOpen: boolean } | null>(null);
  const axis = useRef<ReturnType<typeof lockAxis>>("pending");
  const suppressClick = useRef(false);
  const offset = dragOffset ?? (open ? -ACTION_WIDTH : 0);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return;
    start.current = { x: e.clientX, y: e.clientY, startOpen: open };
    axis.current = "pending";
    suppressClick.current = false;
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s || axis.current === "vertical") return;
    const dx = e.clientX - s.x;
    if (axis.current === "pending") {
      axis.current = lockAxis(dx, e.clientY - s.y);
      if (axis.current === "horizontal") e.currentTarget.setPointerCapture(e.pointerId);
      else return;
    }
    setDragOffset(swipeOffset(s.startOpen, dx));
  }
  function finish(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const s = start.current;
    start.current = null;
    if (!s || axis.current !== "horizontal") return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 350);
    onOpenChange(cancelled ? s.startOpen : settleOpen(swipeOffset(s.startOpen, e.clientX - s.x)));
    setDragOffset(null);
  }

  return (
    <div className="swipe-row" data-open={open}>
      <button
        type="button"
        className="swipe-delete"
        style={{ width: -offset, visibility: offset === 0 ? "hidden" : "visible" }}
        tabIndex={open ? 0 : -1}
        onClick={() => { onOpenChange(false); onDelete(); }}
      >삭제</button>
      <div
        className="swipe-content"
        data-dragging={dragOffset !== null}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onClickCapture={(e) => {
          if (suppressClick.current || open) {
            e.preventDefault();
            e.stopPropagation();
            if (open && !suppressClick.current) onOpenChange(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function NoteList(p: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleFolder = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  // Close the open row on outside touch or any scroll.
  useEffect(() => {
    if (!openId) return;
    const close = () => setOpenId(null);
    const onDown = (e: Event) => {
      if (!(e.target as Element).closest?.('.swipe-row[data-open="true"]')) close();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", close, true);
    };
  }, [openId]);

  const noteRow = (n: Note) => (
    <li key={n.id}>
      <SwipeRow open={openId === n.id} onOpenChange={(o) => setOpenId(o ? n.id : null)} onDelete={() => p.onDelete(n)}>
        <div className="note-row">
          <button
            type="button"
            className="note-item"
            aria-current={p.selectedId === n.id}
            onClick={() => p.onSelect(n.id)}
          >
            <HStack gap={1} vAlign="center">
              <Text weight="semibold" maxLines={1}>{n.title || "제목 없음"}</Text>
              {n.isPublic && <Badge variant="blue" label="공개" />}
              {n.kind === "mindmap" && <Badge variant="neutral" label="마인드맵" />}
              {n.aiOrganizedAt && <Badge variant="neutral" label="정리됨" />}
            </HStack>
            <Text type="supporting" maxLines={2}>{excerpt(n.contentHtml) || "내용 없음"}</Text>
            <Text type="supporting" size="2xs">{formatDate(n.updatedAt)}</Text>
          </button>
          <div className="note-row-menu">
            <DropdownMenu
              presentation="adaptive"
              renderTrigger={(tp) => (
                <IconButton {...tp} label="노트 메뉴" size="sm" variant="ghost" icon={<MoreHorizontal size={16} aria-hidden />} />
              )}
              items={[{
                label: "이동",
                items: moveTargets(p.notebooks, p.folders, n).map((t) => ({
                  label: t.label, isDisabled: t.isCurrent, onClick: () => p.onMove(n, t),
                })),
              }]}
            />
          </div>
        </div>
      </SwipeRow>
    </li>
  );

  return (
    <VStack gap={3} className="note-list">
      <HStack gap={2} vAlign="center" justify="between">
        <Heading level={2} maxLines={1}>{p.heading}</Heading>
        <HStack gap={1}>
          <Button label="마인드맵" icon={<Network size={15} aria-hidden />} size="sm" variant="secondary" tooltip="새 마인드맵" onClick={p.onCreateMindmap} />
          <Button label="새 노트" icon={<span className="glyph">＋</span>} variant="primary" size="sm" onClick={p.onCreate} />
        </HStack>
      </HStack>
      {p.headerExtra}
      <TextInput
        label="노트 검색"
        isLabelHidden
        startIcon="search"
        placeholder="노트 검색"
        value={p.search}
        onChange={p.onSearch}
        hasClear
      />
      <Text type="supporting">{p.notes.length}개의 노트</Text>

      {p.notes.length === 0 && !(p.tree && p.tree.folders.length > 0) ? (
        <EmptyState isCompact title="노트가 없어요" description="새 노트를 만들어 생각을 적어보세요." />
      ) : p.tree ? (
        <ul className="note-items" role="list">
          {p.tree.folders.map(({ folder, notes }) => {
            const isOpen = !collapsed.has(folder.id);
            return (
              <li key={folder.id} className="folder-item">
                <HStack gap={1} vAlign="center" className="folder-head">
                  <button
                    type="button"
                    className="folder-toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggleFolder(folder.id)}
                  >
                    {isOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                    <FolderClosed size={16} aria-hidden />
                    <Text weight="semibold" maxLines={1}>{folder.name}</Text>
                    <Text type="supporting" size="2xs">{notes.length}</Text>
                  </button>
                  <DropdownMenu
                    presentation="adaptive"
                    renderTrigger={(tp) => (
                      <IconButton {...tp} label={`${folder.name} 폴더 메뉴`} size="sm" variant="ghost" icon={<MoreHorizontal size={16} aria-hidden />} />
                    )}
                    items={[
                      { label: "이름 변경", onClick: () => p.onRenameFolder(folder) },
                      { label: "폴더 삭제", onClick: () => p.onDeleteFolder(folder) },
                    ]}
                  />
                </HStack>
                {isOpen && (notes.length === 0
                  ? <Text type="supporting" size="2xs" className="folder-empty">비어 있어요. 노트의 ⋯ 메뉴에서 이동할 수 있어요.</Text>
                  : <ul className="note-items folder-notes" role="list">{notes.map(noteRow)}</ul>)}
              </li>
            );
          })}
          {p.tree.loose.map(noteRow)}
        </ul>
      ) : (
        <ul className="note-items" role="list">
          {p.notes.map(noteRow)}
        </ul>
      )}
    </VStack>
  );
}
