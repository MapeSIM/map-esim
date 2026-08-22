import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  HOME_POPULAR_DESTINATIONS,
  HOME_POPULAR_SECTION_EYEBROW,
  HOME_POPULAR_SECTION_INTRO,
  HOME_POPULAR_SECTION_TITLE,
} from "@/app/lib/home/homeConversionSections";
import { PAKISTAN_FLAG_PUBLIC_PATH } from "@/app/lib/seo/siteGraph";
import { destinationFlagcdnUrl } from "@/app/lib/vesim/destinationPresentation";

export function HomePopularDestinations() {
  return (
    <section
      className="border-b border-[var(--border)]"
      aria-labelledby="home-popular-heading"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
          {HOME_POPULAR_SECTION_EYEBROW}
        </p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h2
              id="home-popular-heading"
              className="text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl"
            >
              {HOME_POPULAR_SECTION_TITLE}
            </h2>
            <p className="mt-3 text-[var(--text-muted)]">
              {HOME_POPULAR_SECTION_INTRO}
            </p>
          </div>
          <Link
            href="/countries?filter=Popular"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-strong)] transition hover:opacity-90"
          >
            View all popular
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOME_POPULAR_DESTINATIONS.map((destination) => {
            const flagSrc =
              destination.code === "PK"
                ? PAKISTAN_FLAG_PUBLIC_PATH
                : destinationFlagcdnUrl(destination.code);
            return (
              <li key={destination.id}>
                <Link
                  href={`/countries/${destination.id}`}
                  className="
                    group flex h-full items-center gap-3 rounded-[24px] border
                    border-[var(--border)] bg-[var(--surface)] p-4
                    shadow-[0_12px_30px_rgba(0,0,0,0.2)] transition
                    hover:-translate-y-1 hover:border-[var(--border-hover)]
                    sm:p-5
                  "
                >
                  <span className="flex h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)]">
                    {flagSrc ? (
                      <Image
                        src={flagSrc}
                        alt=""
                        width={48}
                        height={48}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--heading)]">
                        {destination.code}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-[var(--heading)]">
                      {destination.name}
                    </span>
                    <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent-strong)]">
                      View plans
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
