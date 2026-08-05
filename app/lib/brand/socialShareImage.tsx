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
          background: "#020817",
          padding: "64px 72px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Connectivity arcs */}
        <div
          style={{
            position: "absolute",
            right: "-80px",
            top: "-40px",
            width: "520px",
            height: "520px",
            borderRadius: "9999px",
            border: "2px solid rgba(124, 255, 0, 0.16)",
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
            border: "2px solid rgba(21, 101, 255, 0.28)",
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
            border: "2px solid rgba(124, 255, 0, 0.22)",
            display: "flex",
          }}
        />

        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
          <svg
            width="72"
            height="72"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill="#0D1B3A"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              d="M32 4C20.954 4 12 12.954 12 24c0 14.5 16.8 32.4 18.95 34.7a1.5 1.5 0 0 0 2.1 0C35.2 56.4 52 38.5 52 24 52 12.954 43.046 4 32 4Z"
            />
            <circle cx="32" cy="23" r="11.5" fill="#1565FF" />
            <circle cx="32" cy="28.5" r="2" fill="#7CFF00" />
            <path
              stroke="#7CFF00"
              strokeWidth="2.25"
              strokeLinecap="round"
              d="M26.2 24.2a8.2 8.2 0 0 1 11.6 0"
            />
            <path
              stroke="#7CFF00"
              strokeWidth="2.25"
              strokeLinecap="round"
              d="M23.2 20.4a12.8 12.8 0 0 1 17.6 0"
            />
            <path
              stroke="#7CFF00"
              strokeWidth="2.75"
              strokeLinecap="round"
              d="M17.5 38.5c6.5-5.5 14.5-6.2 22.5-2.2 3.2 1.6 6.2 2.2 9.5 1.6"
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

        {/* Copy */}
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
