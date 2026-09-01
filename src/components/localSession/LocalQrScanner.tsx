import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import QrScannerWorkerPath from "qr-scanner/qr-scanner-worker.min.js?url";

QrScanner.WORKER_PATH = QrScannerWorkerPath;

interface LocalQrScannerProps {
  active: boolean;
  onResult: (text: string) => void;
}

export function LocalQrScanner({ active, onResult }: LocalQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !videoRef.current) return;
    // qr-scanner decodes continuously while the camera is pointed at a code —
    // holding it steady for even a moment fires onResult several times with
    // the same data. A signaling exchange must only ever be submitted once,
    // so stop scanning the instant we get a hit instead of debouncing it.
    let resolved = false;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        if (resolved) return;
        resolved = true;
        scanner.stop();
        onResultRef.current(result.data.trim());
      },
      {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
      }
    );
    scannerRef.current = scanner;
    scanner
      .start()
      .then(() => setError(null))
      .catch(() => setError("Camera access is unavailable. Use the code fallback instead."));

    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [active]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black/5">
      <video ref={videoRef} className="h-64 w-full bg-black object-cover" muted playsInline />
      {error ? <p className="p-3 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
