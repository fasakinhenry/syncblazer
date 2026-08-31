import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, DeviceMobile, Fire, Laptop } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button.tsx";
import { Reveal } from "@/components/landing/Reveal.tsx";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:pt-28">
      <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
        <div>
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">A local first workspace</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-4 font-display text-5xl font-medium leading-[1.05] tracking-tight text-text-primary sm:text-6xl lg:text-[4.25rem]">
              Your devices.
              <br />
              One workspace.
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-text-secondary">
              Move files, images, links and text between your phone and laptop without emailing
              yourself, plugging in a cable, or uploading everything to the cloud.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link to="/register">
                <Button size="lg" className="gap-2">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button size="lg" variant="ghost">
                  See how it works
                </Button>
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mt-6 text-sm text-text-secondary">
              No credit card. Continue as a guest in one tap.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="relative">
          <div className="rounded-2xl border border-border bg-surface p-8 sm:p-10">
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center gap-2">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-background">
                  <DeviceMobile className="h-7 w-7 text-text-secondary" />
                </span>
                <span className="text-xs font-medium text-text-secondary">Phone</span>
              </div>

              <div className="relative mx-2 h-px flex-1 bg-border">
                <motion.span
                  className="absolute -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white"
                  animate={{ left: ["0%", "88%"], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.9, ease: "easeInOut" }}
                >
                  <Fire className="h-3 w-3" weight="fill" />
                </motion.span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-background">
                  <Laptop className="h-7 w-7 text-text-secondary" />
                </span>
                <span className="text-xs font-medium text-text-secondary">Laptop</span>
              </div>
            </div>

            <div className="mt-10 border-t border-border pt-6">
              <p className="font-display text-lg italic text-text-primary">
                &ldquo;I have something here. I need it there.&rdquo;
              </p>
              <p className="mt-2 text-sm text-text-secondary">Blaze it across. Done.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
