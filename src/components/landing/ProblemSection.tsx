import { Check, Fire, X } from "@phosphor-icons/react";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow.tsx";
import { Reveal } from "@/components/landing/Reveal.tsx";

const OLD_WAY = ["Find the file on your phone", "Open your email app", "Email it to yourself", "Open your laptop", "Find the email", "Download the attachment"];

const NEW_WAY = ["Open Quick Blaze on your phone", "Pick your laptop", "Blaze"];

export function ProblemSection() {
  return (
    <section className="border-t border-border bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <SectionEyebrow number="01" label="The problem" />
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="max-w-2xl font-display text-3xl font-medium leading-tight text-text-primary sm:text-4xl">
            The file isn't hard to find. Getting it to your other device is.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal delay={0.1}>
            <p className="mb-6 text-sm font-semibold uppercase tracking-[0.14em] text-text-secondary">
              The old way
            </p>
            <ol className="flex flex-col gap-4">
              {OLD_WAY.map((step) => (
                <li key={step} className="flex items-center gap-3 text-text-secondary">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs">
                    <X className="h-3 w-3" />
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Reveal>

          <Reveal delay={0.15}>
            <p className="mb-6 text-sm font-semibold uppercase tracking-[0.14em] text-brand">With SyncBlaze</p>
            <ol className="flex flex-col gap-4">
              {NEW_WAY.map((step) => (
                <li key={step} className="flex items-center gap-3 text-text-primary">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                    <Check className="h-3.5 w-3.5" weight="bold" />
                  </span>
                  <span className="font-medium">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft px-5 py-4">
              <Fire className="h-5 w-5 shrink-0 text-brand" weight="fill" />
              <p className="text-sm text-text-primary">
                Three steps instead of six, and it works even without an internet connection.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
