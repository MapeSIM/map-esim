/**
 * Partner API documentation content (Markdown + Postman assets).
 * Safe to import from server routes and docs UI.
 */

import { CANCEL_REASON_CODES } from "@/app/lib/partnerApiAuth";

export function buildPartnerApiMarkdownGuide(baseUrlHint = "https://YOUR_HOST"): string {
  const cancelRows = CANCEL_REASON_CODES.map((c) => `| \`${c}\` |`).join("\n");
  return `# MAP eSIM Partner Public API

Base URL: \`${baseUrlHint}/api/v1/partner\`

Authenticate every request with:

\`\`\`http
Authorization: Bearer map_live_...
\`\`\`

Same-origin hint: use \`/api/v1/partner/...\` on this host with your Bearer token.

## Authentication

- Keys are minted in **Partner Account → API Keys**.
- Tokens are shown once. MAP stores only a SHA-256 hash.
- Disabled partners receive \`403\`. Invalid/missing tokens receive \`401\`.
- Rate limit: ~120 requests / minute / API key → \`429\`.

## Purchase flow

1. \`GET /offers\` or \`GET /offers/{offerId}\` — pick a SKU (partner USD price).
2. \`POST /checkout/quote\` — confirm unit/total + wallet sufficiency.
3. \`POST /checkout/credit\` with \`Idempotency-Key\` — debit Partner wallet and fulfill eSIM.
4. \`GET /orders/{id}\` — retrieve ICCID, LPA, QR URL.
5. Optional: \`POST /orders/{id}/cancel\` when unused.

## Endpoints

### GET /destinations
List active destinations with minimum partner USD price.

### GET /offers
Query: \`page\`, \`limit\` (max 500), \`country\`, \`region\`, \`search\`, \`fullCatalog=1\`.

### GET /offers/{offerId}
Single offer with partner USD price. Optional \`?country=\`.

### POST /checkout/quote
Body: \`{ "offerId": "...", "quantity": 1 }\`

### POST /checkout/credit
Headers: \`Idempotency-Key: ...\` (or body \`idempotencyKey\`).
Body: \`{ "offerId": "...", "quantity": 1 }\`
Returns order ID, ICCID, LPA, QR URL, remaining balance.

### GET /orders
Paginated Partner orders.

### GET /orders/{id}
Order detail with ICCID / QR / LPA when available.

### GET /esims/{iccid}/usage
Live usage for an ICCID owned by the authenticated Partner.

### POST /orders/{id}/cancel
Body: \`{ "reason": "OTHERS", "notes": "optional" }\`
Only unused / not-activated Partner-balance orders.

### GET /wallet
Current USD balance + recent ledger transactions.

## Offer fields (Partner-safe)

- \`offerId\`, \`name\`, \`dataLabel\`, \`validityLabel\`
- \`destinationCode\`, \`destinationLabel\`, \`region\`
- \`partnerPriceUsd\`, \`partnerPriceCents\`, \`partnerPriceLabel\`, \`currency\`
- Never includes supplier names, provider cost, or discount internals.

## Cancel reason codes

| Code |
|------|
${cancelRows}

## Errors & limits

| Status | Meaning |
|--------|---------|
| 400 | Validation, insufficient wallet credit, ineligible cancellation |
| 401 | Missing/invalid Bearer token |
| 403 | Partner disabled / not allowed |
| 429 | Rate limited |

## Downloads

- \`PARTNER_API.md\` — this guide
- \`mapesim-partner-api.postman_collection.json\` — Postman v2.1 collection
- \`mapesim-partner.postman_environment.json\` — environment template
`;
}

export function buildPartnerPostmanCollection(baseUrl = "{{base_url}}"): Record<string, unknown> {
  const auth = {
    type: "bearer",
    bearer: [{ key: "token", value: "{{api_key}}", type: "string" }],
  };
  const jsonHeader = { key: "Content-Type", value: "application/json" };
  const items = [
    {
      name: "Destinations",
      request: {
        method: "GET",
        header: [],
        url: `${baseUrl}/api/v1/partner/destinations`,
        auth,
      },
    },
    {
      name: "Offers list",
      request: {
        method: "GET",
        header: [],
        url: `${baseUrl}/api/v1/partner/offers?page=1&limit=50`,
        auth,
      },
    },
    {
      name: "Offer by ID",
      request: {
        method: "GET",
        header: [],
        url: `${baseUrl}/api/v1/partner/offers/{{offer_id}}`,
        auth,
      },
    },
    {
      name: "Checkout quote",
      request: {
        method: "POST",
        header: [jsonHeader],
        body: {
          mode: "raw",
          raw: '{\n  "offerId": "{{offer_id}}",\n  "quantity": 1\n}',
        },
        url: `${baseUrl}/api/v1/partner/checkout/quote`,
        auth,
      },
    },
    {
      name: "Checkout credit",
      request: {
        method: "POST",
        header: [
          jsonHeader,
          { key: "Idempotency-Key", value: "{{idempotency_key}}" },
        ],
        body: {
          mode: "raw",
          raw: '{\n  "offerId": "{{offer_id}}",\n  "quantity": 1\n}',
        },
        url: `${baseUrl}/api/v1/partner/checkout/credit`,
        auth,
      },
    },
    {
      name: "Orders list",
      request: {
        method: "GET",
        header: [],
        url: `${baseUrl}/api/v1/partner/orders?page=1&limit=25`,
        auth,
      },
    },
    {
      name: "Order by ID",
      request: {
        method: "GET",
        header: [],
        url: `${baseUrl}/api/v1/partner/orders/{{order_id}}`,
        auth,
      },
    },
    {
      name: "eSIM usage by ICCID",
      request: {
        method: "GET",
        header: [],
        url: `${baseUrl}/api/v1/partner/esims/{{iccid}}/usage`,
        auth,
      },
    },
    {
      name: "Cancel order",
      request: {
        method: "POST",
        header: [jsonHeader],
        body: {
          mode: "raw",
          raw: '{\n  "reason": "OTHERS",\n  "notes": "unused"\n}',
        },
        url: `${baseUrl}/api/v1/partner/orders/{{order_id}}/cancel`,
        auth,
      },
    },
    {
      name: "Wallet",
      request: {
        method: "GET",
        header: [],
        url: `${baseUrl}/api/v1/partner/wallet`,
        auth,
      },
    },
  ];

  return {
    info: {
      name: "MAP eSIM Partner API",
      description: "Phase 1 Partner Public REST API collection",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: items,
  };
}

export function buildPartnerPostmanEnvironment(): Record<string, unknown> {
  return {
    id: "mapesim-partner-env",
    name: "MAP eSIM Partner",
    values: [
      { key: "base_url", value: "https://YOUR_HOST", enabled: true },
      { key: "api_key", value: "map_live_REPLACE_ME", enabled: true },
      { key: "offer_id", value: "", enabled: true },
      { key: "order_id", value: "", enabled: true },
      { key: "iccid", value: "", enabled: true },
      { key: "idempotency_key", value: "partner-demo-1", enabled: true },
    ],
    _postman_variable_scope: "environment",
  };
}

export const PARTNER_DOCS_TOC = [
  { id: "overview", label: "Overview" },
  { id: "wallet-credit", label: "Wallet credit" },
  { id: "base-url", label: "Base URL" },
  { id: "downloads", label: "Downloads" },
  { id: "authentication", label: "Authentication" },
  { id: "purchase-flow", label: "Purchase flow" },
  { id: "offer-fields", label: "Offer fields" },
  { id: "all-endpoints", label: "All endpoints" },
  { id: "cancel-reason-codes", label: "Cancel reason codes" },
  { id: "errors-limits", label: "Errors & limits" },
] as const;
