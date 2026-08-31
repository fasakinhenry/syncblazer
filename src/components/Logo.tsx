import { Fire } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <span className={`flex items-center justify-center rounded-lg bg-brand ${className}`}>
      <Fire weight="fill" className="h-[60%] w-[60%] text-white" />
    </span>
  );
}

export function Logo({ to = "/", className = "" }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-8 w-8" />
      <span className="font-display text-lg font-semibold tracking-tight text-text-primary">SyncBlaze</span>
    </Link>
  );
}
