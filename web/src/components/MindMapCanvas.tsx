import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { Maximize, Plus, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useHistory } from "../hooks/useHistory";
import {
  addChild, BRANCH_COLORS, edgePath, fitView, nodeSize, removeSubtree, renameNode, rootOf, sideOf, zoomAt,
  type MindNode, type View,
} from "../lib/mindmap";

const newId = () => crypto.randomUUID().slice(0, 8);

interface Props {
  nodes: MindNode[];
  /** Omit for a read-only map (public pages). */
  onChange?: (nodes: MindNode[]) => void;
  height?: number | string;
}

export function MindMapCanvas({ nodes: initial, onChange, height = 520 }: Props) {
  const readOnly = !onChange;
  const history = useHistory(initial);
  const nodes = readOnly ? initial : history.value;
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const frame = useRef<HTMLDivElement>(null);
  const pan = useRef<{ id: number; x: number; y: number; vx: number; vy: number } | null>(null);

  // Persist after every committed change. Compared by identity rather than a
  // "first run" flag, which StrictMode's double effect would defeat (saving on open).
  const notified = useRef(history.value);
  useEffect(() => {
    if (history.value === notified.current) return;
    notified.current = history.value;
    onChange?.(history.value);
  }, [history.value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mirrors `editing` so blur handlers that run synchronously during focus() see the latest value.
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const fit = () => {
    const el = frame.current;
    if (el) setView(fitView(nodes, el.clientWidth, el.clientHeight));
  };
  useLayoutEffect(fit, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel / trackpad pinch zooms around the pointer. Needs a non-passive listener.
  const viewRef = useRef(view);
  viewRef.current = view;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Read-only maps sit inside a scrolling page: plain wheel scrolls it, pinch / ctrl+wheel zooms.
      if (readOnlyRef.current && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      const factor = Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * (e.ctrlKey ? 0.01 : 0.002));
      setView(zoomAt(v, v.scale * factor, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the selected node on screen (e.g. a new node added past the edge).
  useEffect(() => {
    const el = frame.current;
    const n = selected ? nodes.find((x) => x.id === selected) : undefined;
    if (!el || !n) return;
    const s = nodeSize(n);
    const margin = 40;
    setView((v) => {
      const left = n.x * v.scale + v.x, top = n.y * v.scale + v.y;
      const right = left + s.width * v.scale, bottom = top + s.height * v.scale;
      const dx = left < margin ? margin - left : right > el.clientWidth - margin ? el.clientWidth - margin - right : 0;
      const dy = top < margin ? margin - top : bottom > el.clientHeight - 64 ? el.clientHeight - 64 - bottom : 0;
      return dx || dy ? { ...v, x: v.x + dx, y: v.y + dy } : v;
    });
  }, [selected, nodes]);

  function zoomBy(factor: number) {
    const el = frame.current!;
    setView((v) => zoomAt(v, v.scale * factor, el.clientWidth / 2, el.clientHeight / 2));
  }

  // ---------- editing ----------
  function add(parentId: string | undefined) {
    const root = rootOf(nodes);
    const res = addChild(nodes, parentId ?? root!.id, newId);
    history.commit(res.nodes);
    setSelected(res.id);
    setEditing({ id: res.id, text: "" });
  }
  function remove(id: string | null) {
    if (!id) return;
    const target = nodes.find((n) => n.id === id);
    if (!target?.parent) return;
    history.commit(removeSubtree(nodes, id));
    setSelected(target.parent);
  }
  function endEdit(save: boolean) {
    const edit = editingRef.current;
    if (!edit) return;
    // Clear first: focusing the frame blurs the textarea, which calls endEdit again.
    editingRef.current = null;
    setEditing(null);
    const current = nodes.find((n) => n.id === edit.id);
    if (save && current && edit.text.trim() && edit.text !== current.text) history.commit(renameNode(nodes, edit.id, edit.text));
    frame.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    // Only when the canvas itself has focus: keys on toolbar buttons keep their normal meaning,
    // and Tab still moves focus out once nothing is selected.
    if (readOnly || editing || e.target !== e.currentTarget) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) history.redo(); else history.undo(); return; }
    if (!selected) return;
    const node = nodes.find((n) => n.id === selected);
    if (!node) return;
    if (e.key === "Enter") { e.preventDefault(); add(node.id); }
    else if (e.key === "Tab") { e.preventDefault(); add(node.parent ?? node.id); }
    else if (e.key === "F2") { e.preventDefault(); setEditing({ id: node.id, text: node.text }); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(node.id); }
    else if (e.key === "Escape") setSelected(null);
  }

  // ---------- panning on empty space ----------
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".mm-node, .mm-tools")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    setSelected(null);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    setView((v) => ({ ...v, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y }));
  }
  const endPan = () => { pan.current = null; };

  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div
      ref={frame}
      className={`mm-frame${readOnly ? " is-readonly" : ""}`}
      style={{ height }}
      tabIndex={0}
      role="application"
      aria-label="마인드맵. Enter 하위 추가, Tab 형제 추가, F2 이름 변경, Delete 삭제"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      <div className="mm-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        <svg className="mm-edges" aria-hidden>
          {nodes.map((n) => {
            const parent = n.parent ? byId.get(n.parent) : undefined;
            if (!parent) return null;
            return (
              <path
                key={n.id}
                d={edgePath(parent, n, sideOf(nodes, n))}
                stroke={BRANCH_COLORS[n.color]}
                strokeWidth={parent.parent ? 1.5 : 2.5}
                fill="none"
              />
            );
          })}
        </svg>

        {nodes.map((n) => {
          const size = nodeSize(n);
          const isEditing = editing?.id === n.id;
          return (
            <div
              key={n.id}
              className={`mm-node mm-${n.level}`}
              data-selected={selected === n.id || undefined}
              style={{ left: n.x, top: n.y, width: size.width, height: size.height, ["--mm-color" as string]: BRANCH_COLORS[n.color] }}
              title={n.text}
              onClick={() => setSelected(n.id)}
              onDoubleClick={() => !readOnly && setEditing({ id: n.id, text: n.text })}
            >
              {isEditing ? (
                <textarea
                  autoFocus
                  rows={1}
                  aria-label="노드 이름"
                  placeholder={n.text}
                  value={editing.text}
                  onChange={(e) => setEditing({ id: n.id, text: e.target.value })}
                  onBlur={() => endEdit(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); endEdit(true); }
                    if (e.key === "Escape") { e.preventDefault(); endEdit(false); }
                  }}
                />
              ) : (
                <span>{n.text}</span>
              )}
              {!readOnly && selected === n.id && !isEditing && (
                <button
                  type="button"
                  className="mm-quick-add"
                  data-side={sideOf(nodes, n)}
                  aria-label="하위 아이디어 추가"
                  onClick={(e) => { e.stopPropagation(); add(n.id); }}
                >+</button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mm-tools">
        {!readOnly && (
          <>
            <IconButton label="실행 취소" tooltip="실행 취소 (⌘Z)" size="sm" variant="ghost" icon={<Undo2 size={16} />} isDisabled={!history.canUndo} onClick={history.undo} />
            <IconButton label="다시 실행" tooltip="다시 실행 (⇧⌘Z)" size="sm" variant="ghost" icon={<Redo2 size={16} />} isDisabled={!history.canRedo} onClick={history.redo} />
            <IconButton label="하위 아이디어 추가" tooltip="하위 추가 (Enter)" size="sm" variant="ghost" icon={<Plus size={16} />} onClick={() => add(selected ?? undefined)} />
            <IconButton label="선택한 노드 삭제" tooltip="삭제 (Delete)" size="sm" variant="ghost" icon={<Trash2 size={16} />} isDisabled={!selected || !byId.get(selected)?.parent} onClick={() => remove(selected)} />
            <span className="mm-sep" />
          </>
        )}
        <IconButton label="축소" size="sm" variant="ghost" icon={<ZoomOut size={16} />} onClick={() => zoomBy(1 / 1.2)} />
        <Text type="supporting" hasTabularNumbers>{Math.round(view.scale * 100)}%</Text>
        <IconButton label="확대" size="sm" variant="ghost" icon={<ZoomIn size={16} />} onClick={() => zoomBy(1.2)} />
        <IconButton label="화면에 맞추기" tooltip="화면에 맞추기" size="sm" variant="ghost" icon={<Maximize size={16} />} onClick={fit} />
      </div>
    </div>
  );
}
