import React, { SVGProps } from "react";

/**
 * Original Upscayl logo for this fork.
 *
 * Replaces the previous blue pixel-grid mark with an original design: a rounded
 * gradient tile, four "crop" corners and an upward chevron that represents
 * upscaling. No artwork from the upstream project is reused.
 */
const UpscaylSVGLogo = ({ ...rest }: SVGProps<SVGSVGElement>) => {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <defs>
        <linearGradient
          id="upscayl-original-gradient"
          x1="0"
          y1="0"
          x2="256"
          y2="256"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#14B8A6" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect
        width="256"
        height="256"
        rx="56"
        fill="url(#upscayl-original-gradient)"
      />
      <path
        d="M74 96V74h22M182 96V74h-22M74 160v22h22M182 160v22h-22"
        stroke="#FFFFFF"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M96 146l32-32 32 32"
        stroke="#FFFFFF"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default UpscaylSVGLogo;
