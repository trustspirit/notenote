import type { NotebookTree } from "./folders";

/** Container key for notes that sit outside every folder. */
export const ROOT = "root";

/** What a notebook looks like while a drag is in flight: folder order, and each container's note ids. */
export interface Layout {
  folders: string[];
  /** Keyed by folder id, or ROOT for notes outside folders. */
  notes: Record<string, string[]>;
}

export function layoutFromTree(tree: NotebookTree): Layout {
  const notes: Record<string, string[]> = { [ROOT]: tree.loose.map((n) => n.id) };
  for (const { folder, notes: inside } of tree.folders) notes[folder.id] = inside.map((n) => n.id);
  return { folders: tree.folders.map((f) => f.folder.id), notes };
}

/** Moves a note to `index` of `container` (clamped), taking it out of wherever it was. */
export function moveNoteInLayout(layout: Layout, noteId: string, container: string, index: number): Layout {
  const notes: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(layout.notes)) notes[key] = ids.filter((id) => id !== noteId);
  const target = [...(notes[container] ?? [])];
  target.splice(Math.max(0, Math.min(index, target.length)), 0, noteId);
  notes[container] = target;
  return { folders: layout.folders, notes };
}

export function reorderFolders(layout: Layout, folderId: string, index: number): Layout {
  const rest = layout.folders.filter((id) => id !== folderId);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, folderId);
  return { folders: rest, notes: layout.notes };
}

const STEP = 1000;
/** Below this gap two orders can't be split any further without losing precision. */
const MIN_GAP = 1e-6;

/**
 * New `order` values after `movedId` was dropped into `ids` (the container's final sequence).
 * Usually just one write — a value between its neighbours. If a neighbour has no order yet
 * (older notes) or there is no room left, the whole container is renumbered.
 */
export function orderUpdates(
  ids: string[],
  orders: Record<string, number | undefined>,
  movedId: string,
): { id: string; order: number }[] {
  const i = ids.indexOf(movedId);
  const renumber = () => ids.map((id, idx) => ({ id, order: idx * STEP }));
  const prev = i > 0 ? orders[ids[i - 1]] : undefined;
  const next = i < ids.length - 1 ? orders[ids[i + 1]] : undefined;
  const hasPrev = i > 0;
  const hasNext = i < ids.length - 1;

  if (!hasPrev && !hasNext) return [{ id: movedId, order: 0 }];
  if (hasPrev && hasNext) {
    if (prev === undefined || next === undefined || next - prev < MIN_GAP) return renumber();
    return [{ id: movedId, order: (prev + next) / 2 }];
  }
  if (hasPrev) return prev === undefined ? renumber() : [{ id: movedId, order: prev + STEP }];
  return next === undefined ? renumber() : [{ id: movedId, order: next - STEP }];
}

/** An order that sorts before every ordered item, or undefined when none is ordered (then updatedAt decides). */
export function topOrder(orders: (number | undefined)[]): number | undefined {
  const finite = orders.filter((o): o is number => o !== undefined);
  return finite.length ? Math.min(...finite) - STEP : undefined;
}
