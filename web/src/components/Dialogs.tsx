import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ConfirmOptions { title: string; description: string; actionLabel: string }
interface PromptOptions { title: string; label: string; initialValue?: string; actionLabel?: string }

interface DialogsApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  prompt: (o: PromptOptions) => Promise<string | null>;
}

const DialogsContext = createContext<DialogsApi | null>(null);

/** Promise-based replacements for window.confirm / window.prompt, rendered with Astryx dialogs. */
export function DialogsProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [promptState, setPromptState] = useState<PromptOptions | null>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<((v: unknown) => void) | null>(null);

  const settle = (v: unknown) => {
    resolver.current?.(v);
    resolver.current = null;
    setConfirmState(null);
    setPromptState(null);
  };

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current = resolve as (v: unknown) => void;
    setConfirmState(o);
  }), []);

  const prompt = useCallback((o: PromptOptions) => new Promise<string | null>((resolve) => {
    resolver.current = resolve as (v: unknown) => void;
    setValue(o.initialValue ?? "");
    setPromptState(o);
  }), []);

  const submitPrompt = () => settle(value.trim() || null);

  return (
    <DialogsContext.Provider value={{ confirm, prompt }}>
      {children}
      {confirmState && (
        <AlertDialog
          isOpen
          onOpenChange={(open) => !open && settle(false)}
          title={confirmState.title}
          description={confirmState.description}
          actionLabel={confirmState.actionLabel}
          cancelLabel="취소"
          onAction={() => settle(true)}
        />
      )}
      {promptState && (
        <Dialog isOpen purpose="form" onOpenChange={(open) => !open && settle(null)}>
          <DialogHeader title={promptState.title} onOpenChange={(open) => !open && settle(null)} />
          <VStack gap={4} padding={4}>
            <TextInput label={promptState.label} value={value} onChange={setValue} onEnter={submitPrompt} hasAutoFocus />
            <HStack gap={2} justify="end">
              <Button label="취소" variant="ghost" onClick={() => settle(null)} />
              <Button label={promptState.actionLabel ?? "확인"} variant="primary" onClick={submitPrompt} />
            </HStack>
          </VStack>
        </Dialog>
      )}
    </DialogsContext.Provider>
  );
}

export function useDialogs(): DialogsApi {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error("useDialogs must be used inside <DialogsProvider>");
  return ctx;
}
