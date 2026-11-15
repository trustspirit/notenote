import { useCallback, useState } from "react";

const LIMIT = 100;

/** Snapshot undo/redo over an immutable value. */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ stack: [initial], index: 0 });

  const commit = useCallback((next: T) => {
    setState((s) => {
      const stack = [...s.stack.slice(0, s.index + 1), next].slice(-LIMIT);
      return { stack, index: stack.length - 1 };
    });
  }, []);
  const undo = useCallback(() => setState((s) => ({ ...s, index: Math.max(0, s.index - 1) })), []);
  const redo = useCallback(() => setState((s) => ({ ...s, index: Math.min(s.stack.length - 1, s.index + 1) })), []);

  return {
    value: state.stack[state.index],
    commit, undo, redo,
    canUndo: state.index > 0,
    canRedo: state.index < state.stack.length - 1,
  };
}
