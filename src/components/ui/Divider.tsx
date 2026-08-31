export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="border-border" />;
  return (
    <div className="flex items-center gap-3">
      <hr className="flex-1 border-border" />
      <span className="text-xs uppercase tracking-wider text-text-secondary">{label}</span>
      <hr className="flex-1 border-border" />
    </div>
  );
}
