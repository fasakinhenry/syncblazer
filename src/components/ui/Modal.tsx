import { useEffect, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "md" | "lg";
}

const SIZE_CLASSES: Record<"md" | "lg", string> = {
  md: "max-w-md",
  lg: "max-w-2xl",
};

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative w-full ${SIZE_CLASSES[size]} max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="modal-title" className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
