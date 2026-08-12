import { ImageResponse } from "next/og";

/** Apple touch icon — PNG via ImageResponse (App Router does not auto-wire apple-icon.svg). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D1B3A",
        }}
      >
        <svg
          width="128"
          height="128"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="applePinStroke"
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
          {/* Outlined location pin */}
          <path
            d="M32 5.5c-9.665 0-17.5 7.72-17.5 17.25 0 12.1 14.35 27.85 16.7 30.3a1.15 1.15 0 0 0 1.6 0c2.35-2.45 16.7-18.2 16.7-30.3C49.5 13.22 41.665 5.5 32 5.5Z"
            stroke="url(#applePinStroke)"
            strokeWidth="3.25"
            strokeLinejoin="round"
          />
          {/* Flat ground ring — no glow */}
          <ellipse
            cx="32"
            cy="56.5"
            rx="11"
            ry="2.4"
            fill="#1565FF"
            opacity="0.85"
          />
          {/* M — white for contrast on navy Apple-icon background */}
          <path
            fill="#FFFFFF"
            d="M22.2 34.8V15.6h3.9l5.9 12.55L37.9 15.6h3.9v19.2h-3.35V22.05L33.4 33.9h-2.8L25.55 22.05V34.8H22.2Z"
          />
          {/* eSIM chip cue (2x2 pads) */}
          <rect
            x="28.6"
            y="36.1"
            width="6.8"
            height="5.4"
            rx="1.15"
            fill="#7CFF00"
          />
          <rect
            x="29.55"
            y="36.85"
            width="2.05"
            height="1.7"
            rx="0.35"
            fill="#0D1B3A"
          />
          <rect
            x="32.4"
            y="36.85"
            width="2.05"
            height="1.7"
            rx="0.35"
            fill="#0D1B3A"
          />
          <rect
            x="29.55"
            y="39.05"
            width="2.05"
            height="1.7"
            rx="0.35"
            fill="#0D1B3A"
          />
          <rect
            x="32.4"
            y="39.05"
            width="2.05"
            height="1.7"
            rx="0.35"
            fill="#0D1B3A"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
