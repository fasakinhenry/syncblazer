interface FilterPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function FilterPill({ label, active, onClick }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "border-brand bg-brand text-white" : "border-border text-text-secondary hover:bg-surface-hover"
      }`}
    >
      {label}
    </button>
  );
}
