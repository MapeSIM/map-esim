/**
 * Offline QA for process-local VeSIM broker auth.
 * Mocks fetch — never calls real VeSIM, never logs secrets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

type FetchCall = {
  url: string;
  init?: RequestInit;
};

async function main() {
  const authSrc = read("app/lib/vesim/brokerAuth.ts");
  const tokenRoute = read("app/api/vesim/token/route.ts");
  const serverSrc = read("app/lib/vesim/server.ts");

  assert.match(authSrc, /import "server-only"/);
  assert.match(authSrc, /\/api\/auth\/broker\/refresh/);
  assert.match(authSrc, /\/api\/auth\/broker\/token/);
  assert.match(authSrc, /authFlight/);
  assert.match(authSrc, /vesimAuthorizedFetch/);
  assert.match(authSrc, /REFRESH_SKEW_MS/);
  assert.match(authSrc, /recoverBrokerAuthAfterFailure/);
  assert.match(authSrc, /response\.status === 401/);
  assert.match(authSrc, /403 is a provider permission|never remint/i);
  assert.match(
    authSrc,
    /if \(response\.status === 401\) \{\s*auth = await recoverBrokerAuthAfterFailure/
  );
  assert.equal(
    /return status === 401 \|\| status === 403/.test(authSrc),
    false
  );
  assert.doesNotMatch(authSrc, /prisma\.|PrismaClient/);
  assert.doesNotMatch(
    authSrc,
    /console\.(log|info|debug|warn|error)\([^)]*(access_token|refresh_token|password|Authorization)/i
  );
  assert.match(tokenRoute, /status:\s*404/);
  assert.match(serverSrc, /export \{ getBrokerToken, vesimAuthorizedFetch \}/);
  assert.doesNotMatch(serverSrc, /function getBrokerToken/);
  console.log("PASS static_broker_auth_surface");

  // Dynamic behaviour with mocked fetch
  process.env.VESIM_ENVIRONMENT = "staging";
  process.env.VESIM_BASE_URL = "https://www.vesim.xyz";
  process.env.VESIM_EMAIL = "qa-broker@example.com";
  process.env.VESIM_PASSWORD = "qa-password-not-real";

  const {
    getBrokerToken,
    vesimAuthorizedFetch,
    __brokerAuthTestReset,
    __brokerAuthTestGetMeta,
    __brokerAuthTestSeed,
  } = await import("../app/lib/vesim/brokerAuth");

  __brokerAuthTestReset();

  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.includes("/api/auth/broker/token")) {
      return new Response(
        JSON.stringify({
          access_token: "access-v1",
          refresh_token: "refresh-v1",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/api/auth/broker/refresh")) {
      return new Response(
        JSON.stringify({
          access_token: "access-v2",
          refresh_token: "refresh-v2-rotated",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    // Cache reuse
    calls.length = 0;
    const t1 = await getBrokerToken();
    const t2 = await getBrokerToken();
    assert.equal(t1.accessToken, "access-v1");
    assert.equal(t2.accessToken, "access-v1");
    const tokenCalls = calls.filter((c) =>
      c.url.includes("/api/auth/broker/token")
    );
    assert.equal(tokenCalls.length, 1);
    console.log("PASS cache_reuse");

    // Single-flight
    __brokerAuthTestReset();
    calls.length = 0;
    let resolveGate!: () => void;
    const gate = new Promise<void>((r) => {
      resolveGate = r;
    });
    let tokenHits = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/api/auth/broker/token")) {
        tokenHits += 1;
        await gate;
        return new Response(
          JSON.stringify({
            access_token: "access-flight",
            refresh_token: "refresh-flight",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const p1 = getBrokerToken();
    const p2 = getBrokerToken();
    resolveGate();
    const [a, b] = await Promise.all([p1, p2]);
    assert.equal(a.accessToken, "access-flight");
    assert.equal(b.accessToken, "access-flight");
    assert.equal(tokenHits, 1);
    console.log("PASS single_flight");

    // Rotated refresh replacement
    __brokerAuthTestReset();
    __brokerAuthTestSeed({
      accessToken: "stale-access",
      refreshToken: "refresh-old",
      expiresAtMs: Date.now() - 1000,
    });
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/api/auth/broker/refresh")) {
        const body = String(init?.body || "");
        assert.match(body, /refresh-old/);
        assert.doesNotMatch(body, /VESIM_PASSWORD|qa-password/);
        return new Response(
          JSON.stringify({
            access_token: "access-after-refresh",
            refresh_token: "refresh-new",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const refreshed = await getBrokerToken();
    assert.equal(refreshed.accessToken, "access-after-refresh");
    const meta = __brokerAuthTestGetMeta();
    assert.equal(meta.hasRefresh, true);
    // Seed again and force expiry to confirm newest refresh is used
    __brokerAuthTestSeed({
      accessToken: "access-after-refresh",
      refreshToken: "refresh-new",
      expiresAtMs: Date.now() - 1000,
    });
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/api/auth/broker/refresh")) {
        const body = String(init?.body || "");
        assert.match(body, /refresh-new/);
        return new Response(
          JSON.stringify({
            access_token: "access-v3",
            refresh_token: "refresh-v3",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    const again = await getBrokerToken();
    assert.equal(again.accessToken, "access-v3");
    console.log("PASS rotated_refresh_replacement");

    // Password fallback when refresh 401
    __brokerAuthTestReset();
    __brokerAuthTestSeed({
      accessToken: "dead",
      refreshToken: "bad-refresh",
      expiresAtMs: Date.now() - 1000,
    });
    let passwordHits = 0;
    let refreshHits = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/broker/refresh")) {
        refreshHits += 1;
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
        });
      }
      if (url.includes("/api/auth/broker/token")) {
        passwordHits += 1;
        return new Response(
          JSON.stringify({
            access_token: "access-password",
            refresh_token: "refresh-password",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    const pwd = await getBrokerToken();
    assert.equal(pwd.accessToken, "access-password");
    assert.equal(refreshHits, 1);
    assert.equal(passwordHits, 1);
    console.log("PASS password_fallback");

    // One auth recovery + one original retry max (no loop)
    __brokerAuthTestReset();
    __brokerAuthTestSeed({
      accessToken: "expired-access",
      refreshToken: "refresh-ok",
      expiresAtMs: Date.now() + 60 * 60 * 1000,
    });
    let protectedHits = 0;
    let refreshAuthHits = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/broker/refresh")) {
        refreshAuthHits += 1;
        return new Response(
          JSON.stringify({
            access_token: "access-recovered",
            refresh_token: "refresh-recovered",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/protected")) {
        protectedHits += 1;
        const auth = new Headers(init?.headers).get("Authorization") || "";
        if (auth.includes("expired-access")) {
          return new Response("{}", { status: 401 });
        }
        if (auth.includes("access-recovered")) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response("{}", { status: 401 });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const res = await vesimAuthorizedFetch("https://www.vesim.xyz/protected");
    assert.equal(res.status, 200);
    assert.equal(protectedHits, 2);
    assert.equal(refreshAuthHits, 1);
    console.log("PASS 401_one_recovery_one_retry_max");

    // 403 => zero refresh/remint and zero retry
    __brokerAuthTestReset();
    __brokerAuthTestSeed({
      accessToken: "valid-access",
      refreshToken: "refresh-should-not-use",
      expiresAtMs: Date.now() + 60 * 60 * 1000,
    });
    let forbiddenHits = 0;
    let refreshOn403 = 0;
    let passwordOn403 = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/broker/refresh")) {
        refreshOn403 += 1;
        throw new Error("refresh must not run on 403");
      }
      if (url.includes("/api/auth/broker/token")) {
        passwordOn403 += 1;
        throw new Error("password remint must not run on 403");
      }
      if (url.includes("/forbidden")) {
        forbiddenHits += 1;
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const forbidden = await vesimAuthorizedFetch(
      "https://www.vesim.xyz/forbidden"
    );
    assert.equal(forbidden.status, 403);
    assert.equal(forbiddenHits, 1);
    assert.equal(refreshOn403, 0);
    assert.equal(passwordOn403, 0);
    console.log("PASS 403_no_recovery_no_retry");

    // No secret logging in source (already checked) + Authorization never console'd
    assert.doesNotMatch(
      authSrc,
      /console\.[a-z]+\([^)]*Authorization/i
    );
    console.log("PASS no_secret_logging");
  } finally {
    globalThis.fetch = originalFetch;
    __brokerAuthTestReset();
  }

  console.log("ALL PASS qa-vesim-broker-auth");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
