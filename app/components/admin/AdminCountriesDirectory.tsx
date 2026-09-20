"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { AdminDestinationOption } from "@/app/lib/esim/adminPackageAssignmentRead";

type Props = {
  destinations: AdminDestinationOption[];
};

/**
 * Admin-only destination directory for package Copy Link browsing.
 */
export default function AdminCountriesDirectory({ destinations }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((d) => {
      const hay = [
        d.name,
        d.code,
        d.slug ?? "",
        ...(d.searchAliases ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [destinations, query]);

  return (
    <div className="space-y-4">
      <label className="block max-w-md space-y-2">
        <span className="text-sm font-semibold text-[var(--heading)]">
          Search destinations
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Country, region, or code"
          className="w-full rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        />
      </label>

      <p className="text-xs text-[var(--text-soft)]">
        Showing {filtered.length} of {destinations.length}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--text-muted)]">
          No destinations match that search.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => (
            <li key={d.code}>
              <Link
                href={`/admin/countries/${encodeURIComponent(d.code)}`}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 outline-none transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                {d.flag ? (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <Image
                      src={d.flag}
                      alt=""
                      width={28}
                      height={20}
                      className="h-5 w-auto object-cover"
                      unoptimized
                    />
                  </span>
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text-soft)]">
                    {d.code.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--heading)]">
                    {d.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-[var(--text-soft)]">
                    {d.code}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
