import { DeviceMobile, DeviceTablet, Laptop, Monitor } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { DeviceType } from "@/lib/types.ts";

export const DEVICE_TYPE_ICON: Record<DeviceType, Icon> = {
  desktop: Monitor,
  laptop: Laptop,
  mobile: DeviceMobile,
  tablet: DeviceTablet,
};
