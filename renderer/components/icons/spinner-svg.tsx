import React, { SVGProps } from "react";

/**
 * Original loading spinner. The previous component reused third-party artwork
 * (with an author credit). This version draws eight fading dots on a circle and
 * animates them with CSS, so the app ships only original artwork.
 */
function Spinner({ className, ...rest }: SVGProps<SVGSVGElement>) {
  const dots = Array.from({ length: 8 });
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={
        className ??
        "h-16 w-16 rounded-full bg-base-300 p-2 text-base-content"
      }
      {...rest}
    >
      <style>{`
        @keyframes upscayl-original-spin {
          to { transform: rotate(360deg); }
        }
        .upscayl-original-spinner {
          animation: upscayl-original-spin 1s linear infinite;
          transform-origin: 12px 12px;
        }
      `}</style>
      <g className="upscayl-original-spinner">
        {dots.map((_, index) => {
          const angle = (index * Math.PI * 2) / dots.length;
          const x = 12 + Math.cos(angle) * 7.5;
          const y = 12 + Math.sin(angle) * 7.5;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r={1.6}
              fill="currentColor"
              opacity={0.15 + (index / dots.length) * 0.85}
            />
          );
        })}
      </g>
    </svg>
  );
}

export default Spinner;
