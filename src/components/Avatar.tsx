interface AvatarProps {
  name: string;
  src?: string;
  className?: string;
}

export function Avatar({ name, src, className = "h-8 w-8 text-sm" }: AvatarProps) {
  if (src) {
    return <img src={src} alt="" className={`shrink-0 rounded-full bg-surface-hover object-cover ${className}`} />;
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand ${className}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
