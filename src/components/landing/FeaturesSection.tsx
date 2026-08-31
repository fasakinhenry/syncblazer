import { DeviceMobile, Fire, House, Note } from "@phosphor-icons/react";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow.tsx";
import { Reveal } from "@/components/landing/Reveal.tsx";

const FEATURES = [
  {
    icon: House,
    title: "Rooms",
    description:
      "A shared space for your own devices, or a project. See what's connected and what happened recently, at a glance.",
  },
  {
    icon: Note,
    title: "Notes",
    description:
      "Fast, plain notes that sync across every device. Not a workspace to manage. Just a place to write something down.",
  },
  {
    icon: Fire,
    title: "Quick Blaze",
    description:
      "The fastest path from one device to another. Pick the content, pick the destination, send it.",
  },
  {
    icon: DeviceMobile,
    title: "Devices",
    description:
      "Every device you've paired, with clear status. Rename them, remove them, or pair a new one in seconds.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="border-t border-border bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <SectionEyebrow number="03" label="Inside SyncBlaze" />
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="max-w-xl font-display text-3xl font-medium leading-tight text-text-primary sm:text-4xl">
            Four ideas. One workspace that holds them together.
          </h2>
        </Reveal>

        <div className="mt-16 grid divide-y divide-border border-t border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 0.06} className="px-1 py-8 sm:px-6 sm:py-10">
              <feature.icon className="h-6 w-6 text-brand" />
              <h3 className="mt-5 font-display text-xl font-medium text-text-primary">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">{feature.description}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
