import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button.tsx";
import { Reveal } from "@/components/landing/Reveal.tsx";

export function FinalCTASection() {
  return (
    <section className="border-t border-border bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <Reveal>
          <h2 className="font-display text-4xl font-medium leading-tight text-text-primary sm:text-5xl">
            Pair. Select. Blaze.
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mx-auto mt-5 max-w-md text-lg text-text-secondary">
            Set up your first device pairing in under a minute. No card required.
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link to="/register">
              <Button size="lg" className="gap-2">
                Get started free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="secondary">
                I have an account
              </Button>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
