/**
 * Mind-map model: a flat list of nodes forming one tree. Pure functions only,
 * ported from the workspace `mindmap` project's layout and tuned for Pensieve
 * (text-dependent node widths, explicit node levels).
 */

export type MindLevel = "root" | "branch" | "leaf";

export interface MindNode {
  id: string;
  text: string;
  /** Index into BRANCH_COLORS; children inherit their branch's color. */
  color: number;
  x: number;
  y: number;
  parent?: string;
  level: MindLevel;
}

export const BRANCH_COLORS = ["#E07B39", "#0064E0", "#2E9E6E", "#D6457A", "#C79A1E", "#7A5AF5"];
export const NODE_GAP = 16;
export const LEVEL_GAP = 72;
export const DEFAULT_NODE_TEXT = "새 아이디어";

const LEVEL_STYLE: Record<MindLevel, { font: number; padX: number; height: number; min: number; max: number }> = {
  root: { font: 17, padX: 22, height: 52, min: 120, max: 280 },
  branch: { font: 14, padX: 16, height: 40, min: 96, max: 240 },
  leaf: { font: 13, padX: 12, height: 30, min: 72, max: 220 },
};

/** Rough text width: CJK glyphs are ~1em wide, latin ~0.6em. Avoids DOM measuring. */
function textWidth(text: string, font: number): number {
  let w = 0;
  for (const ch of text) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? font : font * 0.6;
  return w;
}

export function nodeSize(node: Pick<MindNode, "text" | "level">) {
  const s = LEVEL_STYLE[node.level];
  const width = Math.round(Math.min(s.max, Math.max(s.min, textWidth(node.text, s.font) + s.padX * 2)));
  return { width, height: s.height };
}

export function rootOf(nodes: MindNode[]): MindNode | undefined {
  return nodes.find((n) => !n.parent);
}

export function childrenOf(nodes: MindNode[], id: string): MindNode[] {
  return nodes.filter((n) => n.parent === id).sort((a, b) => a.y - b.y);
}

export function descendantsOf(nodes: MindNode[], id: string): Set<string> {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (n.parent && result.has(n.parent) && !result.has(n.id)) { result.add(n.id); changed = true; }
    }
  }
  return result;
}

/** -1 when the node hangs on the left of the root, 1 on the right (root itself: 1). */
export function sideOf(nodes: MindNode[], node: MindNode): -1 | 1 {
  const root = rootOf(nodes);
  if (!root || !node.parent) return 1;
  return node.x < root.x ? -1 : 1;
}

/**
 * Two-sided tree layout around a fixed root. Each subtree gets its own vertical
 * band; direct children keep the side (left/right) they are on and their order (by y).
 */
export function layoutMindmap(source: MindNode[]): MindNode[] {
  const result = source.map((n) => ({ ...n }));
  const root = result.find((n) => !n.parent);
  if (!root) return result;

  const kids = new Map<string, MindNode[]>();
  for (const n of result) if (n.parent) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  for (const list of kids.values()) list.sort((a, b) => a.y - b.y);

  const memo = new Map<string, number>();
  const bandHeight = (n: MindNode): number => {
    const cached = memo.get(n.id);
    if (cached !== undefined) return cached;
    const children = kids.get(n.id) ?? [];
    const childrenH = children.reduce((sum, c) => sum + bandHeight(c), 0) + NODE_GAP * Math.max(0, children.length - 1);
    const h = Math.max(nodeSize(n).height, childrenH);
    memo.set(n.id, h);
    return h;
  };

  const placeGroup = (group: MindNode[], parent: MindNode, centerY: number, dir: -1 | 1) => {
    const total = group.reduce((sum, c) => sum + bandHeight(c), 0) + NODE_GAP * Math.max(0, group.length - 1);
    let cursor = centerY - total / 2;
    for (const child of group) {
      const band = bandHeight(child);
      const size = nodeSize(child);
      child.x = dir < 0 ? parent.x - LEVEL_GAP - size.width : parent.x + nodeSize(parent).width + LEVEL_GAP;
      child.y = cursor + (band - size.height) / 2;
      placeGroup(kids.get(child.id) ?? [], child, child.y + size.height / 2, dir);
      cursor += band + NODE_GAP;
    }
  };

  const rootCenterY = root.y + nodeSize(root).height / 2;
  const direct = kids.get(root.id) ?? [];
  placeGroup(direct.filter((n) => n.x < root.x), root, rootCenterY, -1);
  placeGroup(direct.filter((n) => n.x >= root.x), root, rootCenterY, 1);
  return result;
}

export function createMindmap(rootText: string, newId: () => string): MindNode[] {
  return [{ id: newId(), text: rootText || "중심 주제", color: BRANCH_COLORS.length - 1, x: 0, y: 0, level: "root" }];
}

/**
 * Add a child under `parentId` and re-layout. New root branches go to the
 * lighter side and take the next color; deeper nodes inherit side and color.
 */
export function addChild(nodes: MindNode[], parentId: string, newId: () => string): { nodes: MindNode[]; id: string } {
  const parent = nodes.find((n) => n.id === parentId) ?? rootOf(nodes);
  if (!parent) return { nodes, id: "" };
  const siblings = childrenOf(nodes, parent.id);
  const isRoot = !parent.parent;

  let dir: -1 | 1;
  if (isRoot) {
    const left = siblings.filter((n) => n.x < parent.x).length;
    dir = siblings.length - left <= left ? 1 : -1;
  } else {
    dir = sideOf(nodes, parent);
  }
  const color = isRoot ? siblings.length % (BRANCH_COLORS.length - 1) : parent.color;
  const lastY = siblings.length ? Math.max(...siblings.map((n) => n.y)) + 1 : parent.y;
  const sideX = isRoot ? (dir < 0 ? parent.x - 1 : parent.x + 1) : parent.x + dir;
  const node: MindNode = {
    id: newId(), text: DEFAULT_NODE_TEXT, color, x: sideX, y: lastY,
    parent: parent.id, level: isRoot ? "branch" : "leaf",
  };
  return { nodes: layoutMindmap([...nodes, node]), id: node.id };
}

/** Removes the node and its subtree. The root cannot be removed. */
export function removeSubtree(nodes: MindNode[], id: string): MindNode[] {
  const target = nodes.find((n) => n.id === id);
  if (!target?.parent) return nodes;
  const gone = descendantsOf(nodes, id);
  return layoutMindmap(nodes.filter((n) => !gone.has(n.id)));
}

export function renameNode(nodes: MindNode[], id: string, text: string): MindNode[] {
  const clean = text.trim() || DEFAULT_NODE_TEXT;
  return layoutMindmap(nodes.map((n) => (n.id === id ? { ...n, text: clean } : n)));
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Outline of the map as nested lists. Stored as the note's contentHtml so list
 * excerpts, search and the plain-HTML fallback keep working for mind maps.
 * Order: left side top→bottom, then right side top→bottom.
 */
export function mindmapToHtml(nodes: MindNode[]): string {
  const root = rootOf(nodes);
  if (!root) return "";
  const list = (id: string): string => {
    const children = childrenOf(nodes, id);
    if (!children.length) return "";
    const ordered = id === root.id
      ? [...children.filter((n) => n.x < root.x), ...children.filter((n) => n.x >= root.x)]
      : children;
    return `<ul>${ordered.map((c) => `<li><p>${escapeHtml(c.text)}</p>${list(c.id)}</li>`).join("")}</ul>`;
  };
  return `<h2>${escapeHtml(root.text)}</h2>${list(root.id)}`;
}

export function boundsOf(nodes: MindNode[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const s = nodeSize(n);
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + s.width); maxY = Math.max(maxY, n.y + s.height);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** Cubic Bézier from the parent's facing side to the child's near side. */
export function edgePath(parent: MindNode, child: MindNode, dir: -1 | 1): string {
  const ps = nodeSize(parent);
  const cs = nodeSize(child);
  const x1 = dir > 0 ? parent.x + ps.width : parent.x;
  const y1 = parent.y + ps.height / 2;
  const x2 = dir > 0 ? child.x : child.x + cs.width;
  const y2 = child.y + cs.height / 2;
  const c = Math.min(80, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dir * c} ${y1}, ${x2 - dir * c} ${y2}, ${x2} ${y2}`;
}

export interface View { x: number; y: number; scale: number }
export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;

/** Zoom keeping the screen point (px, py) fixed. */
export function zoomAt(view: View, nextScale: number, px: number, py: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
  const r = scale / view.scale;
  return { scale, x: px - (px - view.x) * r, y: py - (py - view.y) * r };
}

/** View that centers the whole map in a viewport, never enlarging past 100%. */
export function fitView(nodes: MindNode[], width: number, height: number, padding = 40): View {
  const b = boundsOf(nodes);
  const w = Math.max(1, b.maxX - b.minX);
  const h = Math.max(1, b.maxY - b.minY);
  const scale = Math.max(MIN_SCALE, Math.min(1, (width - padding * 2) / w, (height - padding * 2) / h));
  return { scale, x: width / 2 - ((b.minX + b.maxX) / 2) * scale, y: height / 2 - ((b.minY + b.maxY) / 2) * scale };
}
