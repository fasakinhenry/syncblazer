import { useEffect, useRef, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import QrScanner from "qr-scanner";
import QrScannerWorkerPath from "qr-scanner/qr-scanner-worker.min.js?url";
import { Spinner } from "@/components/ui/Spinner.tsx";

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
  const [cameraReady, setCameraReady] = useState(false);
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    if (!active || !videoRef.current) return;
    // qr-scanner decodes continuously while the camera is pointed at a code —
    // holding it steady for even a moment fires onResult several times with
    // the same data. A signaling exchange must only ever be submitted once,
    // so stop scanning the instant we get a hit instead of debouncing it.
    let resolved = false;
    setCameraReady(false);
    setDetected(false);

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        if (resolved) return;
        resolved = true;
        scanner.stop();
        setDetected(true);
        // A brief pause so the "code detected" state is actually visible
        // before the view moves on to whatever onResult triggers next.
        setTimeout(() => onResultRef.current(result.data.trim()), 350);
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
      .then(() => {
        setError(null);
        setCameraReady(true);
      })
      .catch(() => setError("Camera access is unavailable. Use the code fallback instead."));

    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [active]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-black/5">
      <video ref={videoRef} className="h-64 w-full bg-black object-cover" muted playsInline />

      {!cameraReady && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-white">
          <Spinner className="h-5 w-5 border-white/40 border-t-white" />
          <span className="text-xs">Starting camera…</span>
        </div>
      )}

      {cameraReady && !detected && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
            Point at the other device's code
          </span>
        </div>
      )}

      {detected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-success/90 text-white">
          <CheckCircle weight="fill" className="h-8 w-8" />
          <span className="text-xs font-medium">Code detected</span>
        </div>
      )}

      {error ? <p className="p-3 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
