import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, ShareNetwork } from "@phosphor-icons/react";
import { formatForManualDisplay } from "@/lib/webrtc/localSignalingCodec.ts";
import { Button } from "@/components/ui/Button.tsx";

const canShare = typeof navigator !== "undefined" && "share" in navigator;

export function InviteCodeDisplay({ code, instructions }: { code: string; instructions: string }) {
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = () => {
    navigator.share({ title: "SyncBlaze pairing code", text: code }).catch(() => undefined);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-xl border border-border bg-white p-3">
        <QRCodeSVG value={code} size={200} />
      </div>
      <p className="text-center text-sm text-text-secondary">{instructions}</p>

      <p className="text-xs font-medium text-text-secondary">No camera on the other device?</p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {canShare && (
          <Button size="sm" variant="secondary" onClick={share} className="gap-1.5">
            <ShareNetwork className="h-3.5 w-3.5" />
            Share via AirDrop, Nearby Share…
          </Button>
        )}
        <button type="button" onClick={() => setShowText((s) => !s)} className="text-xs font-medium text-brand">
          {showText ? "Hide text code" : "Or show a text code to type in"}
        </button>
      </div>

      {showText && (
        <div className="w-full">
          <textarea
            readOnly
            value={formatForManualDisplay(code)}
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-surface-hover p-3 font-mono text-xs text-text-primary"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={copy}
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
      )}
    </div>
  );
}
