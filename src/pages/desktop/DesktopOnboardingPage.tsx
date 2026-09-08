import { useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Fire, Note as NoteIcon, WifiHigh } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button.tsx";
import { LogoMark } from "@/components/Logo.tsx";

const ONBOARDING_SEEN_KEY = "syncblaze.desktopOnboardingSeen";

interface OnboardingSlide {
  icon: typeof Fire;
  title: string;
  description: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    icon: Fire,
    title: "Welcome to SyncBlaze",
    description: "Move files, notes, and links between your devices — instantly, without the cloud getting in the way.",
  },
  {
    icon: WifiHigh,
    title: "Works without Wi-Fi or data",
    description: "Pair your phone with this computer directly over your local network or a hotspot — nothing has to touch the internet.",
  },
  {
    icon: NoteIcon,
    title: "Notes and files, shared live",
    description: "Keep notes in sync across every device, and send files with a tap — no accounts to manage on the other end.",
  },
];

// +1 for the final sign-in/create-account slide, which isn't part of SLIDES
// since it renders differently (buttons, not just an icon/blurb).
const TOTAL_SLIDES = SLIDES.length + 1;
const SWIPE_THRESHOLD_PX = 50;

export function hasSeenDesktopOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markDesktopOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
  } catch {
    // Private mode or storage disabled — non-fatal, just means onboarding
    // may show again on the next launch.
  }
}

/** The desktop app's first-run experience — replaces the scrolling web
 * landing page (see PublicRoute in ProtectedRoute.tsx) with a native-feeling
 * swipeable carousel, ending in sign-in/sign-up rather than a marketing page. */
export function DesktopOnboardingPage() {
  const [current, setCurrent] = useState(0);
  const startXRef = useRef<number | null>(null);

  const goTo = (index: number) => setCurrent(Math.max(0, Math.min(TOTAL_SLIDES - 1, index)));

  const onPointerDown = (e: PointerEvent) => {
    startXRef.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (startXRef.current === null) return;
    const delta = e.clientX - startXRef.current;
    startXRef.current = null;
    if (delta > SWIPE_THRESHOLD_PX) goTo(current - 1);
    else if (delta < -SWIPE_THRESHOLD_PX) goTo(current + 1);
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex flex-1 touch-pan-y overflow-hidden" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className="flex flex-1 transition-transform duration-300 ease-out" style={{ transform: `translateX(-${current * 100}%)` }}>
          {SLIDES.map((slide) => {
            const Icon = slide.icon;
            return (
              <div key={slide.title} className="flex w-full shrink-0 flex-col items-center justify-center gap-6 px-10 text-center">
                <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-soft text-brand">
                  <Icon weight="duotone" className="h-10 w-10" />
                </span>
                <div className="flex flex-col gap-2">
                  <h1 className="font-display text-2xl font-semibold text-text-primary">{slide.title}</h1>
                  <p className="max-w-sm text-sm text-text-secondary">{slide.description}</p>
                </div>
              </div>
            );
          })}

          <div className="flex w-full shrink-0 flex-col items-center justify-center gap-6 px-10 text-center">
            <LogoMark className="h-16 w-16" />
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-2xl font-semibold text-text-primary">Let's get you set up</h1>
              <p className="max-w-sm text-sm text-text-secondary">Sign in if you've already got an account, or create one — it only takes a moment.</p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2">
              <Link to="/register" onClick={markDesktopOnboardingSeen} className="w-full">
                <Button className="w-full">Create account</Button>
              </Link>
              <Link to="/login" onClick={markDesktopOnboardingSeen} className="w-full">
                <Button variant="secondary" className="w-full">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 pb-10 pt-2">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === current ? "w-6 bg-brand" : "w-1.5 bg-border"}`}
            />
          ))}
        </div>

        {current < TOTAL_SLIDES - 1 && (
          <div className="flex w-full max-w-xs items-center justify-between px-10">
            {current > 0 ? (
              <button
                onClick={() => goTo(current - 1)}
                className="flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={() => goTo(current + 1)}
              className="flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-hover"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
