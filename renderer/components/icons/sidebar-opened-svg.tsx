import React, { SVGProps } from "react";

/**
 * Original "sidebar opened" icon: a rounded frame with a left-pointing chevron
 * inside, drawn for this fork to replace the previous third-party glyph.
 */
const SidebarOpened = ({ ...rest }: SVGProps<SVGSVGElement>) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M9 8l-4 4 4 4" />
    </svg>
  );
};

export default SidebarOpened;
