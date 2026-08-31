import { Code, GraduationCap, PenNib, Camera, Briefcase } from "@phosphor-icons/react";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow.tsx";
import { Reveal } from "@/components/landing/Reveal.tsx";

const USE_CASES = [
  { icon: GraduationCap, title: "Students", moves: "Slides, PDFs, screenshots, assignments" },
  { icon: Code, title: "Developers", moves: "Code snippets, URLs, logs, screenshots" },
  { icon: PenNib, title: "Designers", moves: "Assets, references, exported images" },
  { icon: Camera, title: "Creators", moves: "Photos, video clips, drafts" },
  { icon: Briefcase, title: "Professionals", moves: "Documents, presentations, links" },
];

export function UseCasesSection() {
  return (
    <section id="use-cases" className="border-t border-border bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <SectionEyebrow number="05" label="Who it's for" />
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="max-w-xl font-display text-3xl font-medium leading-tight text-text-primary sm:text-4xl">
            Built for anyone working across more than one screen.
          </h2>
        </Reveal>

        <div className="mt-14 flex gap-4 overflow-x-auto pb-4 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:pb-0 lg:grid-cols-5">
          {USE_CASES.map((useCase, i) => (
            <Reveal key={useCase.title} delay={i * 0.05} className="w-56 shrink-0 sm:w-auto">
              <div className="h-full rounded-2xl border border-border p-6 transition-colors hover:border-brand/40">
                <useCase.icon className="h-6 w-6 text-brand" />
                <h3 className="mt-4 font-display text-lg font-medium text-text-primary">{useCase.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{useCase.moves}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
