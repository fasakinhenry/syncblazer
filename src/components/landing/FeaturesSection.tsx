import { ChatCircleDots, DeviceMobile, Fire, House, Note, UsersThree } from "@phosphor-icons/react";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow.tsx";
import { Reveal } from "@/components/landing/Reveal.tsx";

const FEATURES = [
  {
    icon: House,
    title: "Rooms",
    description: "A space you share with your own devices, or with other people you invite by email.",
  },
  {
    icon: Note,
    title: "Notes",
    description: "Quick notes that update on every device the second you type, no saving needed.",
  },
  {
    icon: ChatCircleDots,
    title: "Room chat",
    description: "A private chat per room, encrypted so only the people in it can ever read it.",
  },
  {
    icon: Fire,
    title: "Quick Blaze",
    description: "The fastest way to send something: pick it, pick where it goes, done.",
  },
  {
    icon: DeviceMobile,
    title: "Devices",
    description: "Every device you've connected, in one list. Rename or remove any of them anytime.",
  },
  {
    icon: UsersThree,
    title: "Guest access",
    description: "Try it with one tap, no account needed. Save an account for later if you like it.",
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
            Six simple pieces. Nothing to configure.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 0.06}>
              <div className="h-full rounded-2xl border border-border p-6 transition-colors hover:border-brand/40">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <feature.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-medium text-text-primary">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{feature.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
