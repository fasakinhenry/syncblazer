import { Link } from "react-router-dom";
import { CircleHalf, Moon, Sun, WifiSlash } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";
import { useTheme } from "@/context/ThemeContext.tsx";
import { useOnlineStatus } from "@/hooks/useOnlineStatus.ts";
import { Avatar } from "@/components/Avatar.tsx";

const THEME_CYCLE = ["light", "dark", "system"] as const;
const THEME_ICON = { light: Sun, dark: Moon, system: CircleHalf };

export function TopBar() {
  const { user } = useAuth();
  const { connected } = useSocket();
  const online = useOnlineStatus();
  const { theme, setTheme } = useTheme();
  const ThemeIcon = THEME_ICON[theme];

  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:px-8">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        {!online ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-warning">
            <WifiSlash className="h-3.5 w-3.5" />
            No internet. Local devices still connected.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-success" : "bg-text-secondary/40"}`} />
            {connected ? "Live" : "Connecting…"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={cycleTheme}
          aria-label={`Theme: ${theme}`}
          title={`Theme: ${theme}`}
          className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          <ThemeIcon className="h-5 w-5" />
        </button>
        <Link to="/profile">
          <Avatar name={user?.name ?? "?"} src={user?.avatarUrl} />
        </Link>
      </div>
    </header>
  );
}
