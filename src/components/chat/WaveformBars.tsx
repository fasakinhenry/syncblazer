interface WaveformBarsProps {
  levels: number[];
  /** Fraction (0..1) of bars to render in the "played/active" color —
   * omit for a uniform look (e.g. while still recording). */
  progress?: number;
  activeColor?: string;
  mutedColor?: string;
  className?: string;
  barClassName?: string;
}

const MIN_HEIGHT_PCT = 12;

export function WaveformBars({
  levels,
  progress,
  activeColor = "currentColor",
  mutedColor = "currentColor",
  className = "",
  barClassName = "",
}: WaveformBarsProps) {
  return (
    <div className={`flex h-8 items-center gap-[3px] ${className}`}>
      {levels.map((level, i) => {
        const heightPct = MIN_HEIGHT_PCT + Math.max(0, Math.min(1, level)) * (100 - MIN_HEIGHT_PCT);
        const isActive = progress !== undefined && i / levels.length < progress;
        return (
          <span
            key={i}
            className={`w-[3px] shrink-0 rounded-full transition-[height] duration-75 ${barClassName}`}
            style={{
              height: `${heightPct}%`,
              backgroundColor: isActive ? activeColor : mutedColor,
              opacity: progress !== undefined ? (isActive ? 1 : 0.4) : 1,
            }}
          />
        );
      })}
    </div>
  );
}
