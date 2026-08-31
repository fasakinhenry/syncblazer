import { useState, useRef, useEffect } from "react";
import { TextAa, Check, CaretDown } from "@phosphor-icons/react";
import { NOTE_FONTS, fontLabelFor } from "@/lib/noteFonts.ts";

export function FontPicker({ value, onChange }: { value: string; onChange: (cssFamily: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover"
      >
        <TextAa className="h-3.5 w-3.5" />
        {fontLabelFor(value)}
        <CaretDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-surface py-1 shadow-lg">
          {NOTE_FONTS.map((font) => (
            <button
              key={font.id}
              type="button"
              onClick={() => {
                onChange(font.cssFamily);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-hover"
              style={{ fontFamily: font.cssFamily }}
            >
              {font.label}
              {value === font.cssFamily && <Check className="h-3.5 w-3.5 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
