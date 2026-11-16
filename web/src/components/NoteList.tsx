import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { Network } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { formatDate } from "../lib/format";
import { ACTION_WIDTH, lockAxis, settleOpen, swipeOffset } from "../lib/swipe";
import { excerpt } from "../lib/sanitize";
import type { Note } from "../lib/types";

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

      {p.notes.length === 0 ? (
        <EmptyState isCompact title="노트가 없어요" description="새 노트를 만들어 생각을 적어보세요." />
      ) : (
        <ul className="note-items" role="list">
          {p.notes.map((n) => (
            <li key={n.id}>
              <SwipeRow open={openId === n.id} onOpenChange={(o) => setOpenId(o ? n.id : null)} onDelete={() => p.onDelete(n)}>
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
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
    </VStack>
  );
}
