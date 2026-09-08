import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastVariant = "info" | "success" | "error";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** Returns the new toast's id — pass it to `updateToast` to turn a
   * one-shot toast into a live-updating one (e.g. send progress). */
  toast: (message: string, variant?: ToastVariant) => string;
  /** Updates an existing toast in place instead of stacking a new one, and
   * restarts its auto-dismiss timer from this update rather than the
   * original post time — a toast being actively updated (a transfer in
   * progress) shouldn't vanish out from under it. A no-op if the toast
   * already dismissed (e.g. update arrives after the 4s window). */
  updateToast: (id: string, message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: "border-border bg-surface text-text-primary",
  success: "border-success/30 bg-surface text-success",
  error: "border-danger/30 bg-surface text-danger",
};

const DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const scheduleDismiss = useCallback((id: string) => {
    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    timersRef.current[id] = setTimeout(() => {
      delete timersRef.current[id];
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DISMISS_MS);
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant }]);
      scheduleDismiss(id);
      return id;
    },
    [scheduleDismiss]
  );

  const updateToast = useCallback(
    (id: string, message: string, variant?: ToastVariant) => {
      setToasts((prev) => {
        if (!prev.some((t) => t.id === id)) return prev;
        return prev.map((t) => (t.id === id ? { ...t, message, variant: variant ?? t.variant } : t));
      });
      scheduleDismiss(id);
    },
    [scheduleDismiss]
  );

  const value = useMemo(() => ({ toast, updateToast }), [toast, updateToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg ${VARIANT_STYLES[t.variant]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
