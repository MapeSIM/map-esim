import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Smartphone,
} from "lucide-react";
import Breadcrumbs from "@/app/components/seo/Breadcrumbs";
import { BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  buildInstallGuideContent,
  type InstallGuidePlatform,
} from "@/app/lib/install/installGuideContent";

export function InstallGuidePage({
  platform,
}: {
  platform: InstallGuidePlatform;
}) {
  const content = buildInstallGuideContent(platform);
  const mailto = `mailto:${BRAND_SUPPORT_EMAIL}`;

  return (
    <main className="min-h-screen overflow-x-clip bg-[var(--page-bg)] text-[var(--heading)]">
      <section className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/70">
        <div className="mx-auto max-w-[900px] px-4 py-10 sm:px-6 sm:py-14">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Support", href: "/support" },
              { label: content.title },
            ]}
          />
          <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10">
            <Smartphone
              className="h-6 w-6 text-[var(--accent-strong)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
            {content.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            {content.intro}
          </p>
          <p className="mt-4">
            <Link
              href={content.otherGuide.href}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              {content.otherGuide.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </section>

      <section
        className="border-b border-[var(--border)]"
        aria-labelledby="install-checklist-heading"
      >
        <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 sm:py-16">
          <h2
            id="install-checklist-heading"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {content.checklistTitle}
          </h2>
          <ul className="mt-6 space-y-3">
            {content.checklist.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
              >
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-strong)]"
                  aria-hidden="true"
                />
                <span className="text-sm leading-relaxed text-[var(--text)]">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/50"
        aria-labelledby="install-steps-heading"
      >
        <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 sm:py-16">
          <h2
            id="install-steps-heading"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {content.stepsTitle}
          </h2>
          <ol className="mt-8 grid gap-4">
            {content.steps.map((step, index) => (
              <li
                key={step.title}
                className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
              >
                <p className="text-sm font-semibold text-[var(--text-soft)]">
                  Step {index + 1}
                </p>
                <h3 className="mt-2 text-lg font-bold text-[var(--heading)]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="border-b border-[var(--border)]"
        aria-labelledby="install-issues-heading"
      >
        <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 sm:py-16">
          <h2
            id="install-issues-heading"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {content.issuesTitle}
          </h2>
          <div className="mt-8 space-y-3">
            {content.issues.map((issue) => (
              <details
                key={issue.question}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 open:border-[var(--border-hover)]"
              >
                <summary className="cursor-pointer list-none text-base font-semibold text-[var(--heading)] marker:content-none">
                  <span className="flex items-center justify-between gap-4">
                    {issue.question}
                    <span className="text-[var(--accent-strong)] transition group-open:rotate-45">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                  {issue.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 sm:py-16"
        aria-labelledby="install-support-heading"
      >
        <div className="rounded-[28px] border border-[var(--accent-strong)]/25 bg-[var(--surface)] p-6 sm:p-8">
          <CircleHelp
            className="h-8 w-8 text-[var(--accent-strong)]"
            aria-hidden="true"
          />
          <h2
            id="install-support-heading"
            className="mt-4 text-2xl font-bold tracking-tight"
          >
            {content.supportTitle}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
            {content.supportBody}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/support"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-5 text-sm font-bold text-[var(--accent-ink)]"
            >
              Support Center
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-5 text-sm font-semibold"
            >
              Contact
            </Link>
            <Link
              href="/account/orders"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-5 text-sm font-semibold"
            >
              My eSIMs
            </Link>
            <a
              href={mailto}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-5 text-sm font-semibold"
            >
              Email support
            </a>
          </div>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Also see{" "}
            <Link
              href="/device-compatibility"
              className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              device compatibility
            </Link>
            {" · "}
            <Link
              href="/how-it-works"
              className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              how MAP eSIM works
            </Link>
            {" · "}
            <Link
              href={content.otherGuide.href}
              className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              {content.otherGuide.label}
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
