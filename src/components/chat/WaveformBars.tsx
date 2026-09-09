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
    // min-w-0 + overflow-hidden + flexible (not fixed-width) bars: on a
    // narrow viewport this row must actually shrink to fit next to the
    // stop/send button rather than forcing the composer wider and pushing
    // that button off-screen (the mobile bug this was fixed for).
    <div className={`flex h-8 min-w-0 items-center gap-0.5 overflow-hidden ${className}`}>
      {levels.map((level, i) => {
        const heightPct = MIN_HEIGHT_PCT + Math.max(0, Math.min(1, level)) * (100 - MIN_HEIGHT_PCT);
        const isActive = progress !== undefined && i / levels.length < progress;
        return (
          <span
            key={i}
            className={`min-w-0.5 flex-1 rounded-full transition-[height] duration-75 ${barClassName}`}
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
