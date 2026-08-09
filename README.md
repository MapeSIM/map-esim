# MAP eSIM

Next.js App Router storefront for MAP eSIM travel connectivity.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` and fill server-only secrets. Never commit real credentials.

## VeSIM environment safety

Provider orders require an explicit, matching environment configuration:

| Variable | Behavior |
|---|---|
| `VESIM_ENVIRONMENT=staging` | Only confirmed staging broker hosts (`www.vesim.xyz`, `vesim.xyz`) |
| `VESIM_ENVIRONMENT=live` or `production` | Only confirmed live broker host (`www.vesim.world`) |
| Missing or any other value | **Fail closed** — provider auth and orders are blocked |
| Mode / `VESIM_BASE_URL` mismatch | **Fail closed** — no automatic fallback to live |

Confirmed staging broker base URL: `https://www.vesim.xyz`.

Confirmed live/production broker base URL: `https://www.vesim.world` (official VeSIM production docs). Do not treat activation-link domains (for example hosts used only for eSIM install URLs) as the live API host.

`VESIM_ENVIRONMENT` is **server-only**. Never use `NEXT_PUBLIC_*` for this value. Production never defaults automatically to live.

## Production safety — guest VeSIM checkout

Public guest checkout (`POST /api/vesim/checkout` and `/checkout`) can create **real** VeSIM provider credit orders when enabled.

| Variable | Behavior |
|---|---|
| `ENABLE_GUEST_VESIM_CHECKOUT=true` | Guest checkout allowed only when intentionally enabled for controlled verification |
| Missing, `false`, or any other value | **Disabled** — API returns HTTP 503; UI hides purchase |

**Keep `ENABLE_GUEST_VESIM_CHECKOUT=false` in production** until public commerce hardening is complete:

1. Payment integration is live and approved
2. Durable (multi-instance) checkout idempotency exists
3. Proper rate limiting protects the public checkout endpoint

This flag is **server-only**. Do not use a `NEXT_PUBLIC_*` variable to authorize provider orders. Client requests cannot override the gate.

Authenticated wallet purchase and admin package-assignment flows do **not** use this flag; they use separate server paths. They still require a valid `VESIM_ENVIRONMENT` + matching `VESIM_BASE_URL`.

## ICCID storage (server-only)

Orders store ICCIDs encrypted at rest. Set `ICCID_ENCRYPTION_KEY` to a 32-byte secret (64-char hex or base64). Without a valid key, order flows still succeed but ICCID capture is skipped (fail closed for crypto).

| Field | Purpose |
|---|---|
| `iccidEncrypted` | AES-256-GCM ciphertext (random IV) |
| `iccidHash` | Deterministic HMAC for duplicate detection |
| `iccidLast4` | Last four digits for masked admin display |

Never put this key in `NEXT_PUBLIC_*` variables. Never log plaintext ICCIDs.

Optional backfill (dry-run by default; requires `--apply` to write). Do not run against production casually:

```bash
npx tsx scripts/backfill-order-iccids.ts
npx tsx scripts/backfill-order-iccids.ts --apply
```

## Useful scripts

```bash
npm run build
npm run start
npm run db:migrate          # prisma migrate deploy (production)
npm run admin:seed          # one-time admin bootstrap
npm run qa:guest-checkout-gate
npm run qa:vesim-environment
npm run qa:iccid-persistence
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
