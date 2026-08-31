import { CursorClick, Fire, QrCode, SealCheck } from "@phosphor-icons/react";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow.tsx";
import { Reveal } from "@/components/landing/Reveal.tsx";

const STEPS = [
  {
    icon: QrCode,
    title: "Pair",
    description: "Scan a QR code once to trust a device. No accounts to juggle, no cables.",
  },
  {
    icon: CursorClick,
    title: "Select",
    description: "Pick a file, an image, a link or some text. Or just drag it onto the page.",
  },
  {
    icon: Fire,
    title: "Blaze",
    description: "Choose where it's going and send it. Direct over your network when devices are nearby.",
  },
  {
    icon: SealCheck,
    title: "Done",
    description: "It's already there. No inbox to check, no upload to wait on.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-t border-border bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <SectionEyebrow number="02" label="How it works" />
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="max-w-xl font-display text-3xl font-medium leading-tight text-text-primary sm:text-4xl">
            Four steps. That's the whole product.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.08}>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-3xl font-medium text-border">{`0${i + 1}`}</span>
                  <step.icon className="h-6 w-6 text-brand" />
                </div>
                <h3 className="font-display text-xl font-medium text-text-primary">{step.title}</h3>
                <p className="text-sm leading-relaxed text-text-secondary">{step.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
