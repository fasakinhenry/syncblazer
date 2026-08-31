import { Fire, House, DeviceMobile, Note, User } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

export interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  emphasize?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/room", label: "Room", icon: House },
  { to: "/notes", label: "Notes", icon: Note },
  { to: "/blaze", label: "Blaze", icon: Fire, emphasize: true },
  { to: "/devices", label: "Devices", icon: DeviceMobile },
  { to: "/profile", label: "Profile", icon: User },
];
