import React, { SVGProps } from "react";

/**
 * Original icon set for Upscayl.
 *
 * These are hand-written SVGs created specifically for this fork. They replace
 * every icon that was previously pulled from "lucide-react" so the app does not
 * ship third-party icon artwork. Each component keeps the same export name and
 * accepts standard SVG props (className, size, ...), so existing call sites only
 * need their import path changed.
 */

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  width: 24,
  height: 24,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const ChevronLeftIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const ChevronRightIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const EllipsisIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const WrenchIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M14.7 6.3a4 4 0 105.4 5.4l-2.2-2.2-2 2-1.2-1.2 2-2-2-2z" />
    <path d="M14.7 11.7L4.5 21.9a2 2 0 01-2.8-2.8l10.2-10.2" />
  </svg>
);

export const X = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const Settings = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
);

export const Search = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4.2-4.2" />
  </svg>
);

export const GripVertical = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const SkullIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M12 3a7 7 0 00-7 7c0 2.4 1.2 4.2 2.8 5.3V18h8.4v-2.7C17.8 14.2 19 12.4 19 10a7 7 0 00-7-7z" />
    <circle cx="9" cy="10" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1.4" fill="currentColor" stroke="none" />
    <path d="M10 21h4M11 18v3M13 18v3" />
  </svg>
);

export const Maximize2 = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

export const SwatchBookIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <rect x="3" y="4" width="7" height="16" rx="2" />
    <rect x="12" y="4" width="4" height="16" rx="2" />
    <rect x="18" y="4" width="3" height="16" rx="1.5" />
    <path d="M6.5 8h.01M14 8h.01M19.5 8h.01" />
  </svg>
);

export default {
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisIcon,
  WrenchIcon,
  X,
  Settings,
  Search,
  GripVertical,
  SkullIcon,
  Maximize2,
  SwatchBookIcon,
};
