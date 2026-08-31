import type { ReactNode } from "react";
import { ArrowsLeftRight, Lightning, ShieldCheck } from "@phosphor-icons/react";
import { Logo } from "@/components/Logo.tsx";

const PANEL_POINTS = [
  { icon: Lightning, text: "Move files, text and links between devices in seconds" },
  { icon: ArrowsLeftRight, text: "Works over your local network, no internet required" },
  { icon: ShieldCheck, text: "Direct transfers never pass through our servers" },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand px-12 py-12 text-white md:flex">
        <Logo className="[&_span]:text-white" />
        <div className="max-w-md">
          <p className="font-display text-4xl font-medium leading-[1.1] text-white">
            Your devices. One workspace.
          </p>
          <ul className="mt-10 flex flex-col gap-5">
            {PANEL_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-white/95">
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/80">Local first. Cloud when necessary.</p>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-3xl font-medium text-text-primary">{title}</h1>
          <p className="mt-1.5 text-sm text-text-secondary">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
