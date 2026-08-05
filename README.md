# MAP eSIM

Next.js App Router storefront for MAP eSIM travel connectivity.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` and fill server-only secrets. Never commit real credentials.

## Production safety — guest VeSIM checkout

Public guest checkout (`POST /api/vesim/checkout` and `/checkout`) can create **real** VeSIM provider credit orders when enabled.

| Variable | Behavior |
|---|---|
| `ENABLE_GUEST_VESIM_CHECKOUT=true` | Guest checkout allowed (local/staging only when intentionally testing) |
| Missing, `false`, or any other value | **Disabled** — API returns HTTP 503; UI hides purchase |

**Keep `ENABLE_GUEST_VESIM_CHECKOUT=false` in production** until:

1. Payment integration is live and approved
2. Durable (multi-instance) checkout idempotency exists
3. Proper rate limiting protects the public checkout endpoint

This flag is **server-only**. Do not use a `NEXT_PUBLIC_*` variable to authorize provider orders. Client requests cannot override the gate.

Authenticated wallet purchase and admin package-assignment flows do **not** use this flag; they use separate server paths.

## Useful scripts

```bash
npm run build
npm run start
npm run db:migrate          # prisma migrate deploy (production)
npm run admin:seed          # one-time admin bootstrap
npm run qa:guest-checkout-gate
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
