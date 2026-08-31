import { useEffect } from "react";
import Confetti from "react-confetti";
import { useWindowSize } from "@/hooks/useWindowSize.ts";

const BRAND_COLORS = ["#287BFF", "#60A5FA", "#16A34A", "#F8FAFC", "#0F172A"];

interface ConfettiBurstProps {
  active: boolean;
  onComplete?: () => void;
  durationMs?: number;
}

export function ConfettiBurst({ active, onComplete, durationMs = 3200 }: ConfettiBurstProps) {
  const { width, height } = useWindowSize();

  useEffect(() => {
    if (!active || !onComplete) return;
    const timeout = setTimeout(onComplete, durationMs);
    return () => clearTimeout(timeout);
  }, [active, onComplete, durationMs]);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="true">
      <Confetti
        width={width}
        height={height}
        numberOfPieces={260}
        recycle={false}
        gravity={0.25}
        colors={BRAND_COLORS}
      />
    </div>
  );
}
