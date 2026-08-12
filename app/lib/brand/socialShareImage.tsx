import { ImageResponse } from "next/og";

export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const SOCIAL_IMAGE_CONTENT_TYPE = "image/png";
export const SOCIAL_IMAGE_ALT = "MAP eSIM – Stay connected. Anywhere.";

/** Shared Open Graph / Twitter share card (ImageResponse, no external assets). */
export function createSocialShareImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0D1B3A",
          padding: "64px 72px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Soft geometric accents (no glow) */}
        <div
          style={{
            position: "absolute",
            right: "-80px",
            top: "-40px",
            width: "520px",
            height: "520px",
            borderRadius: "9999px",
            border: "2px solid rgba(124, 255, 0, 0.14)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "40px",
            top: "80px",
            width: "360px",
            height: "360px",
            borderRadius: "9999px",
            border: "2px solid rgba(21, 101, 255, 0.24)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "140px",
            top: "180px",
            width: "200px",
            height: "200px",
            borderRadius: "9999px",
            border: "2px solid rgba(124, 255, 0, 0.18)",
            display: "flex",
          }}
        />

        {/* Brand row — final mark + MAP eSIM wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
          <svg
            width="72"
            height="72"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id="socialPinStroke"
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
              stroke="url(#socialPinStroke)"
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
            {/* White M for contrast on navy share background */}
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
          <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
            <span
              style={{
                color: "#FFFFFF",
                fontSize: 44,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              MAP
            </span>
            <span
              style={{
                color: "#7CFF00",
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                paddingBottom: 2,
              }}
            >
              eSIM
            </span>
          </div>
        </div>

        {/* Existing supporting copy (matches SOCIAL_IMAGE_ALT) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: 820 }}>
          <div
            style={{
              width: 64,
              height: 4,
              background: "#7CFF00",
              borderRadius: 9999,
              display: "flex",
            }}
          />
          <div
            style={{
              color: "#FFFFFF",
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.1,
              display: "flex",
            }}
          >
            Stay connected. Anywhere.
          </div>
          <div
            style={{
              color: "#9DB2C7",
              fontSize: 28,
              fontWeight: 500,
              lineHeight: 1.35,
              display: "flex",
            }}
          >
            Travel eSIM plans for 220+ countries
          </div>
        </div>

        {/* Footer accent */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#8AA0B5",
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          <span>mapesim.com</span>
          <span style={{ color: "#7CFF00" }}>Global eSIM Connectivity</span>
        </div>
      </div>
    ),
    { ...SOCIAL_IMAGE_SIZE }
  );
}
