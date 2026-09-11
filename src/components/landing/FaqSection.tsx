import { SectionEyebrow } from "@/components/landing/SectionEyebrow.tsx";
import { Reveal } from "@/components/landing/Reveal.tsx";

const FAQS = [
  {
    question: "Do I need to create an account?",
    answer:
      "No. Tap \"Continue as guest\" and you're in right away. Save a real account later, whenever you want, without losing anything.",
  },
  {
    question: "Is it free?",
    answer: "Yes, SyncBlaze is free.",
  },
  {
    question: "Do my files go through your servers?",
    answer:
      "Only when they have to. If your two devices share the same Wi-Fi, files travel straight between them and never touch a server.",
  },
  {
    question: "Do I need to install anything?",
    answer: "No, it works right in your browser. Installing it as an app is optional, just a faster shortcut if you want one.",
  },
  {
    question: "Does it work between an iPhone and a Windows laptop?",
    answer: "Yes. SyncBlaze runs in any modern browser, so mixing Android, iPhone, Mac, Windows, or Linux is completely fine.",
  },
  {
    question: "Is room chat actually private?",
    answer: "Yes, it's end-to-end encrypted. Only the devices in that room can read it. Not even we can.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="border-t border-border bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <Reveal>
          <SectionEyebrow number="06" label="Questions" />
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="max-w-xl font-display text-3xl font-medium leading-tight text-text-primary sm:text-4xl">
            Quick answers, before you ask.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {FAQS.map((faq, i) => (
            <Reveal key={faq.question} delay={i * 0.04}>
              <h3 className="font-display text-base font-medium text-text-primary">{faq.question}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{faq.answer}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
