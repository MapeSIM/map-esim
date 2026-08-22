import {
  HOME_COMPARISON_COLUMNS,
  HOME_COMPARISON_EYEBROW,
  HOME_COMPARISON_INTRO,
  HOME_COMPARISON_ROWS,
  HOME_COMPARISON_TITLE,
} from "@/app/lib/home/homeConversionSections";

export function HomeComparisonSection() {
  return (
    <section
      className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/70"
      aria-labelledby="home-comparison-heading"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
          {HOME_COMPARISON_EYEBROW}
        </p>
        <h2
          id="home-comparison-heading"
          className="mt-3 text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl"
        >
          {HOME_COMPARISON_TITLE}
        </h2>
        <p className="mt-3 max-w-3xl text-[var(--text-muted)]">
          {HOME_COMPARISON_INTRO}
        </p>

        <div className="mt-8 overflow-x-auto rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_30px_rgba(0,0,0,0.2)]">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Comparison of MAP eSIM, typical roaming, and airport SIM shops
            </caption>
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                <th
                  scope="col"
                  className="px-4 py-4 font-semibold text-[var(--text-soft)] sm:px-5"
                >
                  Feature
                </th>
                {HOME_COMPARISON_COLUMNS.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="px-4 py-4 font-semibold text-[var(--heading)] sm:px-5"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOME_COMPARISON_ROWS.map((row) => (
                <tr
                  key={row.feature}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <th
                    scope="row"
                    className="px-4 py-4 font-semibold text-[var(--heading)] sm:px-5"
                  >
                    {row.feature}
                  </th>
                  {row.values.map((value, index) => (
                    <td
                      key={`${row.feature}-${HOME_COMPARISON_COLUMNS[index]}`}
                      className={`px-4 py-4 leading-relaxed text-[var(--text-muted)] sm:px-5 ${
                        index === 0 ? "text-[var(--heading)]" : ""
                      }`}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
