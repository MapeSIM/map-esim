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
          background: "#020817",
        }}
      >
        <svg
          width="128"
          height="128"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="#0D1B3A"
            stroke="#1565FF"
            strokeWidth="1.25"
            d="M32 4C20.954 4 12 12.954 12 24c0 14.5 16.8 32.4 18.95 34.7a1.5 1.5 0 0 0 2.1 0C35.2 56.4 52 38.5 52 24 52 12.954 43.046 4 32 4Z"
          />
          <circle cx="32" cy="23" r="11.5" fill="#1565FF" />
          <circle cx="32" cy="28.5" r="2.25" fill="#7CFF00" />
          <path
            stroke="#7CFF00"
            strokeWidth="2.75"
            strokeLinecap="round"
            d="M26.2 24.2a8.2 8.2 0 0 1 11.6 0"
          />
          <path
            stroke="#7CFF00"
            strokeWidth="2.75"
            strokeLinecap="round"
            d="M23.2 20.4a12.8 12.8 0 0 1 17.6 0"
          />
          <path
            stroke="#7CFF00"
            strokeWidth="3.25"
            strokeLinecap="round"
            d="M17.5 38.5c6.5-5.5 14.5-6.2 22.5-2.2 3.2 1.6 6.2 2.2 9.5 1.6"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
