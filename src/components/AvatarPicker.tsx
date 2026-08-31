import { useState } from "react";
import { ArrowsClockwise, Check } from "@phosphor-icons/react";
import { generateAvatarOptions } from "@/lib/avatar.ts";

interface AvatarPickerProps {
  current?: string;
  onSelect: (avatarUrl: string) => void;
  count?: number;
}

export function AvatarPicker({ current, onSelect, count = 8 }: AvatarPickerProps) {
  const [options, setOptions] = useState<string[]>(() => generateAvatarOptions(count));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {options.map((url) => {
          const selected = url === current;
          return (
            <button
              key={url}
              type="button"
              onClick={() => onSelect(url)}
              aria-label="Choose this avatar"
              className={`relative aspect-square rounded-full border-2 bg-surface-hover p-0.5 transition-colors ${
                selected ? "border-brand" : "border-transparent hover:border-border"
              }`}
            >
              <img src={url} alt="" className="h-full w-full rounded-full" />
              {selected && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white">
                  <Check className="h-2.5 w-2.5" weight="bold" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setOptions(generateAvatarOptions(count))}
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-brand"
      >
        <ArrowsClockwise className="h-4 w-4" />
        Shuffle avatars
      </button>
    </div>
  );
}
