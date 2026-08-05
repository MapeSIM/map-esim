import type { ReactNode } from "react";
import type { BrandSocialLinkId } from "@/app/lib/brand";
import { BRAND_SOCIAL_LINKS } from "@/app/lib/brand";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M14 8h2.5V4.8c-.4-.05-1.7-.15-3.15-.15-3.12 0-5.25 1.85-5.25 5.25V13H5.5v3.5H8.1V22h3.6v-5.5h2.75L15 13h-3.3V10.2c0-1 .28-1.7 1.8-1.7V8Z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M16.6 5.8A4.9 4.9 0 0 1 14.3 2h-3.1v13.2a2.55 2.55 0 1 1-2.55-2.55c.2 0 .4.02.58.07V9.5a5.7 5.7 0 0 0-.58-.03A5.65 5.65 0 1 0 14.3 15.1V9.6a7.9 7.9 0 0 0 4.5 1.4V8a4.9 4.9 0 0 1-2.2-2.2Z" />
    </svg>
  );
}

const ICONS: Record<
  BrandSocialLinkId,
  (props: { className?: string }) => ReactNode
> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
};

export default function SocialIcons() {
  return (
    <ul className="mt-5 flex flex-wrap items-center gap-2.5">
      {BRAND_SOCIAL_LINKS.map((link) => {
        const Icon = ICONS[link.id];
        return (
          <li key={link.id}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
              className="
                inline-flex h-10 w-10 items-center justify-center rounded-[12px]
                border border-[var(--border-strong)] bg-[var(--surface)]
                text-[var(--heading)] transition
                hover:border-[var(--accent-strong)]/50 hover:text-[var(--accent-strong)]
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[var(--accent-strong)]/60
                focus-visible:ring-offset-2
                focus-visible:ring-offset-[var(--page-bg-soft)]
              "
            >
              <Icon className="h-5 w-5" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
