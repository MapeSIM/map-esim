const CHECKOUT_TRUST_HIGHLIGHTS = [
  {
    key: "instant-delivery",
    text: "⚡ Instant Delivery: QR code sent to email & WhatsApp in < 2 mins",
  },
  {
    key: "secure-checkout",
    text: "🔒 100% Secure Checkout via Simpaisa / Easypaisa / JazzCash",
  },
  {
    key: "universal-connectivity",
    text: "📶 Universal Connectivity: Works seamlessly on all unlocked eSIM-compatible devices",
  },
] as const;

/** Compact checkout trust strip — conversion highlights under the Pay CTA. */
export function CheckoutTrustPanel() {
  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 sm:px-5"
      aria-labelledby="checkout-trust-heading"
    >
      <h2
        id="checkout-trust-heading"
        className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
      >
        Why travelers choose MAP eSIM
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-2.5">
        {CHECKOUT_TRUST_HIGHLIGHTS.map((item) => (
          <li
            key={item.key}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
          >
            <p className="text-xs font-semibold leading-snug text-[var(--heading)] sm:text-sm">
              {item.text}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
