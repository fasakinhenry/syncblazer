export function SectionEyebrow({ number, label }: { number: string; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="font-display text-sm font-medium text-brand">{number}</span>
      <span className="h-px w-8 bg-border" />
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">{label}</span>
    </div>
  );
}
