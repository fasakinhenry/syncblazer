import { CloudCheck, WifiHigh, WifiSlash } from "@phosphor-icons/react";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow.tsx";
import { Reveal } from "@/components/landing/Reveal.tsx";

export function LocalFirstSection() {
  return (
    <section id="local-first" className="border-t border-border bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <Reveal>
              <SectionEyebrow number="04" label="Local first" />
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="font-display text-3xl font-medium leading-tight text-text-primary sm:text-4xl">
                Nearby devices shouldn't need the internet to talk to each other.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-md text-base leading-relaxed text-text-secondary">
                When your phone and laptop are on the same network, SyncBlaze sends things directly
                between them. Nothing passes through our servers. When they're apart, it can route
                through the cloud instead. You never have to choose which. SyncBlaze does.
              </p>
            </Reveal>

            <Reveal delay={0.15}>
              <dl className="mt-10 flex flex-col gap-6 border-t border-border pt-8">
                <div className="flex gap-4">
                  <dt className="w-28 shrink-0 font-display text-sm text-brand">Local</dt>
                  <dd className="text-sm text-text-secondary">Direct, fast, and private. The default whenever it's possible.</dd>
                </div>
                <div className="flex gap-4">
                  <dt className="w-28 shrink-0 font-display text-sm text-brand">Cloud</dt>
                  <dd className="text-sm text-text-secondary">A fallback for when devices are apart. Encrypted in transit.</dd>
                </div>
                <div className="flex gap-4">
                  <dt className="w-28 shrink-0 font-display text-sm text-brand">You</dt>
                  <dd className="text-sm text-text-secondary">See none of that complexity. Just pick a device and send.</dd>
                </div>
              </dl>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-border bg-background p-8">
              <div className="flex items-center gap-2 text-warning">
                <WifiSlash className="h-5 w-5" />
                <span className="text-sm font-medium">No internet connection</span>
              </div>
              <div className="mt-5 flex items-center gap-2 text-success">
                <CloudCheck className="h-5 w-5" />
                <span className="text-sm font-medium">Local transfer available</span>
              </div>

              <div className="mt-8 flex items-center justify-between rounded-xl border border-border p-4">
                <div className="flex items-center gap-3">
                  <WifiHigh className="h-5 w-5 text-text-secondary" />
                  <span className="text-sm text-text-primary">Henry's Laptop</span>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Connected
                </span>
              </div>

              <p className="mt-6 border-t border-border pt-6 font-display text-lg italic text-text-primary">
                &ldquo;No internet? Still connected.&rdquo;
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
