import {
  DndContext, DragOverlay, MouseSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NotebookTree } from "../lib/folders";
import { ROOT, layoutFromTree, moveNoteInLayout, reorderFolders, type Layout } from "../lib/placement";
import type { Folder, Note } from "../lib/types";

interface Props {
  tree: NotebookTree;
  collapsed: Set<string>;
  /** The folder's header content: toggle, name, count and its menu. */
  renderFolderHead: (folder: Folder, notes: Note[], isOpen: boolean) => ReactNode;
  /** The note row (without the surrounding <li>). */
  renderNote: (note: Note) => ReactNode;
  /** The note was dropped at its final place: `orderedIds` is its container's new sequence. */
  onPlaceNote: (noteId: string, container: string, orderedIds: string[]) => Promise<void>;
  onPlaceFolder: (folderId: string, orderedIds: string[]) => Promise<void>;
}

const noteKey = (id: string) => `n:${id}`;
const folderKey = (id: string) => `f:${id}`;
const ROOT_KEY = "c:root";
const idOf = (key: string | number) => String(key).slice(2);

function containerOf(layout: Layout, noteId: string): string | null {
  for (const [key, ids] of Object.entries(layout.notes)) if (ids.includes(noteId)) return key;
  return null;
}

function SortableNote({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: noteKey(id), data: { type: "note" } });
  return (
    <li
      ref={setNodeRef}
      className={isDragging ? "dnd-source" : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
    >
      {children}
    </li>
  );
}

function SortableFolder({ id, head, children }: { id: string; head: ReactNode; children: ReactNode }) {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: folderKey(id), data: { type: "folder" } });
  return (
    <li
      ref={setNodeRef}
      className={`folder-item${isDragging ? " dnd-source" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {/* Only the header starts a folder drag: the notes inside have their own drag handles. */}
      <div ref={setActivatorNodeRef} className="folder-head-wrap" {...listeners}>{head}</div>
      {children}
    </li>
  );
}

/** Notes dropped here (outside every folder) when the top level has no notes to land on. */
function RootZone({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_KEY });
  return <ul ref={setNodeRef} className={`note-items root-zone${isOver ? " is-over" : ""}`} role="list">{children}</ul>;
}

/**
 * A notebook's folders and loose notes with mouse drag and drop: reorder notes, reorder folders,
 * and move notes in and out of folders. Touch screens use the ⋯ "이동" menu instead (MouseSensor only),
 * which keeps swipe-to-delete and scrolling untouched.
 */
export function NoteTree(p: Props) {
  const base = useMemo(() => layoutFromTree(p.tree), [p.tree]);
  const [layout, setLayout] = useState<Layout>(base);
  const [active, setActive] = useState<{ type: "note" | "folder"; id: string } | null>(null);
  const start = useRef<Layout>(base);
  // While dragging, the layout is ours; otherwise it mirrors the data (also after a failed save).
  useEffect(() => { if (!active) setLayout(base); }, [base, active]);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));

  const notes = useMemo(() => new Map([...p.tree.loose, ...p.tree.folders.flatMap((f) => f.notes)].map((n) => [n.id, n])), [p.tree]);
  const folders = useMemo(() => new Map(p.tree.folders.map((f) => [f.folder.id, f.folder])), [p.tree]);
  const listOf = (container: string) => (layout.notes[container] ?? []).flatMap((id) => notes.get(id) ?? []);

  const collision: CollisionDetection = (args) => {
    const type = args.active.data.current?.type;
    const all = args.droppableContainers;
    if (type === "folder") {
      return closestCenter({ ...args, droppableContainers: all.filter((c) => c.data.current?.type === "folder") });
    }
    const hits = pointerWithin(args);
    const noteHit = hits.find((h) => String(h.id).startsWith("n:"));
    if (noteHit) return [noteHit];
    const own = containerOf(layout, idOf(args.active.id));
    const folderHit = hits.find((h) => String(h.id).startsWith("f:"));
    const zone = folderHit ? idOf(folderHit.id) : hits.some((h) => h.id === ROOT_KEY) ? ROOT : null;
    // Between rows of the container the note is already in: stay with the nearest row there, don't jump.
    if (zone && zone === own && (layout.notes[zone]?.length ?? 0) > 0) {
      const mine = new Set(layout.notes[zone].map(noteKey));
      return closestCenter({ ...args, droppableContainers: all.filter((c) => mine.has(String(c.id))) });
    }
    if (folderHit) return [folderHit];
    return hits.length ? hits : closestCenter({ ...args, droppableContainers: all.filter((c) => c.data.current?.type === "note") });
  };

  function onDragStart(e: DragStartEvent) {
    start.current = layout;
    document.body.classList.add("dnd-active");
    setActive({ type: e.active.data.current?.type, id: idOf(e.active.id) });
  }

  function onDragOver({ active: a, over }: DragOverEvent) {
    if (!over || a.data.current?.type !== "note") return;
    const noteId = idOf(a.id);
    const from = containerOf(layout, noteId);
    const overKey = String(over.id);
    let to: string | null;
    let index: number;
    if (overKey.startsWith("n:")) {
      to = containerOf(layout, idOf(overKey));
      if (!to || to === from) return; // same container: the sortable strategy previews it, onDragEnd commits it
      const overIdx = layout.notes[to].indexOf(idOf(overKey));
      const below = (a.rect.current.translated?.top ?? 0) > over.rect.top + over.rect.height / 2;
      index = overIdx + (below ? 1 : 0);
    } else {
      to = overKey === ROOT_KEY ? ROOT : overKey.startsWith("f:") ? idOf(overKey) : null;
      if (!to || to === from) return;
      index = to === ROOT ? layout.notes[ROOT].length : 0; // onto a folder: top of it; onto the top-level zone: the end
    }
    setLayout(moveNoteInLayout(layout, noteId, to, index));
  }

  function finish() {
    document.body.classList.remove("dnd-active");
    setActive(null);
  }

  function onDragEnd({ active: a, over }: DragEndEvent) {
    const prev = start.current;
    if (!over) { setLayout(prev); return finish(); }
    const id = idOf(a.id);
    if (a.data.current?.type === "folder") {
      const overId = idOf(over.id);
      const next = overId === id ? layout : reorderFolders(layout, id, layout.folders.indexOf(overId));
      setLayout(next);
      if (next.folders.join() !== prev.folders.join()) {
        void p.onPlaceFolder(id, next.folders).catch(() => setLayout(prev));
      }
      return finish();
    }
    let next = layout;
    const container = containerOf(layout, id);
    if (container && String(over.id).startsWith("n:")) {
      const overId = idOf(over.id);
      if (containerOf(layout, overId) === container && overId !== id) {
        next = moveNoteInLayout(layout, id, container, layout.notes[container].indexOf(overId));
      }
    }
    setLayout(next);
    const finalContainer = containerOf(next, id);
    if (finalContainer && (finalContainer !== containerOf(prev, id) || next.notes[finalContainer].join() !== prev.notes[finalContainer]?.join())) {
      void p.onPlaceNote(id, finalContainer, next.notes[finalContainer]).catch(() => setLayout(prev));
    }
    finish();
  }

  const draggingFolder = active?.type === "folder";
  const overlayNote = active?.type === "note" ? notes.get(active.id) : undefined;
  const overlayFolder = active?.type === "folder" ? folders.get(active.id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setLayout(start.current); finish(); }}
    >
      <ul className="note-items" role="list">
        <SortableContext items={layout.folders.map(folderKey)} strategy={verticalListSortingStrategy}>
          {layout.folders.flatMap((fid) => {
            const folder = folders.get(fid);
            if (!folder) return [];
            const inside = listOf(fid);
            // A collapsed folder opens while the dragged note is inside it: if the node were unmounted,
            // dnd-kit would lose the drag (no rect, no `over`) and the drop would be cancelled.
            const holdsDragged = active?.type === "note" && layout.notes[fid]?.includes(active.id);
            const isOpen = (!p.collapsed.has(fid) || !!holdsDragged) && !draggingFolder;
            return (
              <SortableFolder key={fid} id={fid} head={p.renderFolderHead(folder, inside, isOpen)}>
                {isOpen && (
                  <SortableContext items={inside.map((n) => noteKey(n.id))} strategy={verticalListSortingStrategy}>
                    <ul className="note-items folder-notes" role="list">
                      {inside.map((n) => <SortableNote key={n.id} id={n.id}>{p.renderNote(n)}</SortableNote>)}
                    </ul>
                  </SortableContext>
                )}
              </SortableFolder>
            );
          })}
        </SortableContext>
      </ul>
      <SortableContext items={listOf(ROOT).map((n) => noteKey(n.id))} strategy={verticalListSortingStrategy}>
        <RootZone>
          {listOf(ROOT).map((n) => <SortableNote key={n.id} id={n.id}>{p.renderNote(n)}</SortableNote>)}
        </RootZone>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" }}>
        {overlayNote && <div className="drag-ghost">{overlayNote.title || "제목 없음"}</div>}
        {overlayFolder && <div className="drag-ghost">📁 {overlayFolder.name}</div>}
      </DragOverlay>
    </DndContext>
  );
}
