import { ShareNetwork } from "@phosphor-icons/react";

interface ShareTargetsProps {
  url: string;
  title: string;
  className?: string;
}

const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

/** A row of share-target buttons next to a copy-link control — native share
 * sheet where available, direct platform links everywhere else. */
export function ShareTargets({ url, title, className = "" }: ShareTargetsProps) {
  const nativeShare = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      // user cancelled — nothing to do
    }
  };

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {canNativeShare && (
        <button
          type="button"
          onClick={nativeShare}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-surface-hover"
          aria-label="Share"
          title="Share"
        >
          <ShareNetwork className="h-3.5 w-3.5" />
        </button>
      )}
      <a
        href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-surface-hover"
        aria-label="Share on X"
        title="Share on X"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
      <a
        href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-surface-hover"
        aria-label="Share on WhatsApp"
        title="Share on WhatsApp"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12.004 2c-5.514 0-9.997 4.483-9.997 9.997 0 1.763.463 3.483 1.343 4.997L2 22l5.14-1.35a9.958 9.958 0 0 0 4.864 1.24h.004c5.514 0 9.996-4.483 9.996-9.997C21.996 6.483 17.518 2 12.004 2zm0 18.19h-.003a8.19 8.19 0 0 1-4.174-1.143l-.3-.178-3.05.8.814-2.97-.195-.305a8.176 8.176 0 0 1-1.257-4.377c0-4.519 3.678-8.196 8.198-8.196 4.518 0 8.194 3.677 8.194 8.196 0 4.518-3.677 8.173-8.227 8.173z" />
        </svg>
      </a>
      <a
        href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-surface-hover"
        aria-label="Share by email"
        title="Share by email"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={2}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      </a>
    </div>
  );
}
