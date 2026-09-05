import { useEffect, useRef, useState } from "react";
import { GoogleLogo } from "@phosphor-icons/react";
import { loadScriptOnce } from "@/lib/loadScript.ts";
import { useAuth } from "@/context/AuthContext.tsx";
import { useTheme } from "@/context/ThemeContext.tsx";
import { isTauri, startGoogleSignIn } from "@/lib/tauri.ts";
import { Button } from "@/components/ui/Button.tsx";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const DESKTOP_CLIENT_ID = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID;

interface GoogleSignInButtonProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

/** Inside the desktop app, Google's embedded popup flow doesn't work
 * (WebView2 blocks the cross-origin storage it needs, and Google distrusts
 * embedded webviews for sign-in generally) — so this opens the real system
 * browser instead via PKCE, the standard pattern for installed apps. */
function DesktopGoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (!DESKTOP_CLIENT_ID) {
      onError("Google sign-in isn't configured for the desktop app yet.");
      return;
    }
    setLoading(true);
    try {
      const idToken = await startGoogleSignIn(DESKTOP_CLIENT_ID);
      await loginWithGoogle(idToken);
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "We couldn't sign you in with Google. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" variant="secondary" size="lg" loading={loading} onClick={onClick} className="w-full gap-2">
      <GoogleLogo className="h-5 w-5" weight="bold" />
      Continue with Google
    </Button>
  );
}

// Always renders something in this slot: Google's own widget once the
// Identity Services script has initialized, or a same-sized fallback button
// before that (or when no client ID is configured) so the layout never
// shifts and the option is never silently missing.
function WebGoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
  const { loginWithGoogle } = useAuth();
  const { effectiveTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [googleButtonReady, setGoogleButtonReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID || !containerRef.current) return;
    let cancelled = false;

    loadScriptOnce("https://accounts.google.com/gsi/client")
      .then(() => {
        if (cancelled || !window.google || !containerRef.current) return;

        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async (response) => {
            try {
              await loginWithGoogle(response.credential);
              onSuccess();
            } catch {
              onError("We couldn't sign you in with Google. Please try again.");
            }
          },
        });

        containerRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: effectiveTheme === "dark" ? "filled_black" : "outline",
          size: "large",
          shape: "rectangular",
          width: 320,
          text: "continue_with",
        });
        setGoogleButtonReady(true);
      })
      .catch(() => setGoogleButtonReady(false));

    return () => {
      cancelled = true;
    };
  }, [effectiveTheme, loginWithGoogle, onSuccess, onError]);

  const onFallbackClick = () => {
    onError(
      CLIENT_ID
        ? "Google sign-in is still loading. Give it a moment and try again."
        : "Google sign-in isn't configured yet. Set GOOGLE_CLIENT_ID (backend) and VITE_GOOGLE_CLIENT_ID (frontend)."
    );
  };

  return (
    <div className="w-full">
      <div ref={containerRef} className={googleButtonReady ? "flex w-full justify-center" : "hidden"} />
      {!googleButtonReady && (
        <Button type="button" variant="secondary" size="lg" onClick={onFallbackClick} className="w-full gap-2">
          <GoogleLogo className="h-5 w-5" weight="bold" />
          Continue with Google
        </Button>
      )}
    </div>
  );
}

export function GoogleSignInButton(props: GoogleSignInButtonProps) {
  return isTauri() ? <DesktopGoogleSignInButton {...props} /> : <WebGoogleSignInButton {...props} />;
}
