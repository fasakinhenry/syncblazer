import { Lock } from "@phosphor-icons/react";
import { Reveal } from "@/components/landing/Reveal.tsx";

export function PrivacySection() {
  return (
    <section className="border-t border-border bg-brand py-20 text-white sm:py-24">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <Reveal>
          <Lock className="mx-auto h-8 w-8 text-white/70" />
        </Reveal>
        <Reveal delay={0.05}>
          <p className="mt-6 font-display text-3xl font-medium leading-snug sm:text-4xl">
            Nearby transfers stay between your devices, whenever that's possible.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-white/95">
            When SyncBlaze routes through the cloud instead, that traffic travels over an encrypted
            connection and stays visible only to your own devices. We don't read your files, your
            notes, or your clipboard, and we never will.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
