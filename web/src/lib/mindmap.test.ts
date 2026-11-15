import { describe, expect, it } from "vitest";
import {
  addChild, boundsOf, createMindmap, descendantsOf, fitView, mindmapToHtml, nodeSize,
  removeSubtree, renameNode, rootOf, zoomAt, type MindNode,
} from "./mindmap";

function ids() {
  let i = 0;
  return () => `n${i++}`;
}

function overlap(a: MindNode, b: MindNode) {
  const sa = nodeSize(a), sb = nodeSize(b);
  return a.x < b.x + sb.width && a.x + sa.width > b.x && a.y < b.y + sb.height && a.y + sa.height > b.y;
}

/** root with `branches` branches, each with `leaves` leaves. */
function build(branches: number, leaves: number) {
  const id = ids();
  let nodes = createMindmap("주제", id);
  const root = nodes[0].id;
  for (let b = 0; b < branches; b++) {
    const added = addChild(nodes, root, id);
    nodes = added.nodes;
    for (let l = 0; l < leaves; l++) nodes = addChild(nodes, added.id, id).nodes;
  }
  return nodes;
}

describe("addChild", () => {
  it("alternates root branches right, left, right… with distinct colors", () => {
    const nodes = build(4, 0);
    const root = rootOf(nodes)!;
    const branches = nodes.filter((n) => n.parent === root.id);
    expect(branches.filter((n) => n.x > root.x)).toHaveLength(2);
    expect(branches.filter((n) => n.x < root.x)).toHaveLength(2);
    expect(new Set(branches.map((n) => n.color)).size).toBe(4);
  });

  it("deeper nodes inherit side and color of their branch", () => {
    const nodes = build(2, 2);
    for (const leaf of nodes.filter((n) => n.level === "leaf")) {
      const parent = nodes.find((n) => n.id === leaf.parent)!;
      expect(leaf.color).toBe(parent.color);
      expect(Math.sign(leaf.x - parent.x)).toBe(Math.sign(parent.x - rootOf(nodes)!.x));
    }
  });

  it("lays out without overlapping nodes", () => {
    const nodes = build(5, 3);
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) expect(overlap(nodes[i], nodes[j])).toBe(false);
  });

  it("keeps the root fixed", () => {
    const nodes = build(3, 2);
    expect(rootOf(nodes)).toMatchObject({ x: 0, y: 0 });
  });
});

describe("removeSubtree / rename", () => {
  it("removes a node with its descendants but never the root", () => {
    const nodes = build(2, 3);
    const branch = nodes.find((n) => n.level === "branch")!;
    const after = removeSubtree(nodes, branch.id);
    expect(after).toHaveLength(nodes.length - 4);
    expect(removeSubtree(after, rootOf(after)!.id)).toBe(after);
    expect(descendantsOf(nodes, branch.id).size).toBe(4);
  });

  it("falls back to default text for empty names", () => {
    const nodes = build(1, 0);
    const branch = nodes.find((n) => n.level === "branch")!;
    expect(renameNode(nodes, branch.id, "  ").find((n) => n.id === branch.id)!.text).toBe("새 아이디어");
  });

  it("widens nodes for longer text", () => {
    expect(nodeSize({ text: "아주 긴 아이디어 이름입니다", level: "branch" }).width)
      .toBeGreaterThan(nodeSize({ text: "짧음", level: "branch" }).width);
  });
});

describe("mindmapToHtml", () => {
  it("renders an escaped nested outline", () => {
    const id = ids();
    let nodes = createMindmap("<계획>", id);
    const a = addChild(nodes, nodes[0].id, id);
    nodes = renameNode(a.nodes, a.id, "A & B");
    expect(mindmapToHtml(nodes)).toBe("<h2>&lt;계획&gt;</h2><ul><li><p>A &amp; B</p></li></ul>");
  });
});

describe("view math", () => {
  it("zoomAt keeps the anchor point fixed on screen", () => {
    const v = { x: 10, y: 20, scale: 1 };
    const next = zoomAt(v, 2, 110, 120);
    // world point under (110,120) before: (100,100); after: same screen point
    expect(100 * next.scale + next.x).toBeCloseTo(110);
    expect(100 * next.scale + next.y).toBeCloseTo(120);
  });

  it("fitView centers the map", () => {
    const nodes = build(4, 2);
    const v = fitView(nodes, 800, 600);
    const b = boundsOf(nodes);
    expect(((b.minX + b.maxX) / 2) * v.scale + v.x).toBeCloseTo(400);
    expect(((b.minY + b.maxY) / 2) * v.scale + v.y).toBeCloseTo(300);
  });
});
