import { useState } from "react";
import { Camera, TextAa } from "@phosphor-icons/react";
import { LocalQrScanner } from "@/components/localSession/LocalQrScanner.tsx";
import { Button } from "@/components/ui/Button.tsx";

interface CodeEntryProps {
  title: string;
  onSubmit: (code: string) => void;
  busy?: boolean;
}

export function CodeEntry({ title, onSubmit, busy }: CodeEntryProps) {
  const [mode, setMode] = useState<"scan" | "type">("scan");
  const [text, setText] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode("scan")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${mode === "scan" ? "bg-brand-soft text-brand" : "text-text-secondary hover:bg-surface-hover"}`}
          >
            <Camera className="h-3.5 w-3.5" />
            Scan
          </button>
          <button
            type="button"
            onClick={() => setMode("type")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${mode === "type" ? "bg-brand-soft text-brand" : "text-text-secondary hover:bg-surface-hover"}`}
          >
            <TextAa className="h-3.5 w-3.5" />
            Type code
          </button>
        </div>
      </div>

      {mode === "scan" ? (
        <LocalQrScanner active={mode === "scan"} onResult={onSubmit} />
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste or type the code here"
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-surface p-3 font-mono text-xs text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <Button size="sm" disabled={!text.trim() || busy} loading={busy} onClick={() => onSubmit(text.trim())}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
