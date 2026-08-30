/**
 * Hard gate for temporary wallet finalize UAT harness.
 * Never allow MAP eSIM Production (mapesim.com) / live VeSIM.
 * Allows dedicated temp UAT project deployments (Preview or non-mapesim hosts).
 */
import "server-only";

export const PREVIEW_WALLET_FINALIZE_UAT_BRANCH =
  "fix/wallet-esim-local-finalization";

export const PREVIEW_WALLET_FINALIZE_UAT_PROVIDER_PREFIX = "TEST-WLF";
export const PREVIEW_WALLET_FINALIZE_UAT_EMAIL_MARKER = "uat-wlf.invalid";
export const PREVIEW_WALLET_FINALIZE_UAT_IDEMPOTENCY_PREFIX = "test_wlf_";

function gitCommitRef(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_REF?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF?.trim() ||
    ""
  );
}

function looksLikeProductionAppHost(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return false;
  return (
    v.includes("mapesim.com") &&
    !v.includes("vercel.app") &&
    !v.includes("localhost")
  );
}

function isMapEsimProductionDeployment(): boolean {
  return (
    looksLikeProductionAppHost(process.env.AUTH_URL) ||
    looksLikeProductionAppHost(process.env.APP_BASE_URL) ||
    looksLikeProductionAppHost(process.env.VERCEL_URL) ||
    looksLikeProductionAppHost(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  );
}

/**
 * Throws unless UAT is explicitly enabled on a non-Production MAP eSIM host.
 */
export function assertPreviewWalletFinalizeUatGate(): void {
  if (process.env.PREVIEW_WALLET_FINALIZE_UAT?.trim() !== "1") {
    throw new Error("WALLET_FINALIZE_UAT_REFUSED: flag_disabled");
  }

  if (isMapEsimProductionDeployment()) {
    throw new Error("WALLET_FINALIZE_UAT_REFUSED: production_app_host");
  }

  // Dedicated UAT project may deploy as "production" of that temp project.
  // Still refuse MAP eSIM Production environment on mapesim.com.
  if (
    process.env.VERCEL_ENV === "production" &&
    isMapEsimProductionDeployment()
  ) {
    throw new Error("WALLET_FINALIZE_UAT_REFUSED: mapesim_production");
  }

  const ref = gitCommitRef();
  if (ref && ref !== PREVIEW_WALLET_FINALIZE_UAT_BRANCH) {
    throw new Error("WALLET_FINALIZE_UAT_REFUSED: wrong_git_ref");
  }

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("WALLET_FINALIZE_UAT_REFUSED: missing_database_url");
  }

  // Never allow accidental Production VeSIM usage from this harness path.
  if (process.env.VESIM_ENVIRONMENT?.trim().toLowerCase() === "live") {
    throw new Error("WALLET_FINALIZE_UAT_REFUSED: vesim_live");
  }
}

/** UI helper: whether controls should render on this deployment. */
export function isPreviewWalletFinalizeUatUiEnabled(): boolean {
  try {
    assertPreviewWalletFinalizeUatGate();
    return true;
  } catch {
    return false;
  }
}
