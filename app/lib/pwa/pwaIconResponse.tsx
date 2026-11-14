import { ImageResponse } from "next/og";

export const PWA_THEME_COLOR = "#0D1B3A";
export const PWA_BACKGROUND_COLOR = "#0D1B3A";
export const PWA_ACCENT = "#7CFF00";

type PwaIconOptions = {
  size: number;
  /** Extra inset for maskable safe zone (~18%). */
  maskable?: boolean;
};

/**
 * Brand PWA icon (navy pin + M). Used by /icons/* routes for the web manifest.
 */
export function createPwaIconResponse({
  size,
  maskable = false,
}: PwaIconOptions): ImageResponse {
  const padRatio = maskable ? 0.18 : 0.06;
  const pad = Math.round(size * padRatio);
  const inner = Math.max(48, size - pad * 2);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PWA_BACKGROUND_COLOR,
        }}
      >
        <svg
          width={inner}
          height={inner}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="pwaPin"
              x1="32"
              y1="2"
              x2="32"
              y2="56"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#7CFF00" />
              <stop offset="45%" stopColor="#3DB8FF" />
              <stop offset="100%" stopColor="#1565FF" />
            </linearGradient>
          </defs>
          <path
            d="M32 5.5c-9.665 0-17.5 7.72-17.5 17.25 0 12.1 14.35 27.85 16.7 30.3a1.15 1.15 0 0 0 1.6 0c2.35-2.45 16.7-18.2 16.7-30.3C49.5 13.22 41.665 5.5 32 5.5Z"
            stroke="url(#pwaPin)"
            strokeWidth="3.25"
            strokeLinejoin="round"
          />
          <ellipse
            cx="32"
            cy="56.5"
            rx="11"
            ry="2.4"
            fill="#1565FF"
            opacity="0.85"
          />
          <path
            fill="#FFFFFF"
            d="M22.2 34.8V15.6h3.9l5.9 12.55L37.9 15.6h3.9v19.2h-3.35V22.05L33.4 33.9h-2.8L25.55 22.05V34.8H22.2Z"
          />
          <rect
            x="28.6"
            y="36.1"
            width="6.8"
            height="5.4"
            rx="1.15"
            fill={PWA_ACCENT}
          />
          <rect
            x="29.55"
            y="36.85"
            width="2.05"
            height="1.7"
            rx="0.35"
            fill={PWA_BACKGROUND_COLOR}
          />
          <rect
            x="32.4"
            y="36.85"
            width="2.05"
            height="1.7"
            rx="0.35"
            fill={PWA_BACKGROUND_COLOR}
          />
          <rect
            x="29.55"
            y="39.05"
            width="2.05"
            height="1.7"
            rx="0.35"
            fill={PWA_BACKGROUND_COLOR}
          />
          <rect
            x="32.4"
            y="39.05"
            width="2.05"
            height="1.7"
            rx="0.35"
            fill={PWA_BACKGROUND_COLOR}
          />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
