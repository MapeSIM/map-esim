import { requireRole } from "@/app/lib/auth/session";
import {
  isPreviewWalletFinalizeUatUiEnabled,
  PREVIEW_WALLET_FINALIZE_UAT_BRANCH,
} from "@/app/lib/esim/previewWalletFinalizeUatGate";
import { WalletFinalizeUatControls } from "./WalletFinalizeUatControls";

export const dynamic = "force-dynamic";

export default async function PreviewWalletFinalizeUatPage() {
  await requireRole("ADMIN", "/admin/uat/wallet-finalize");

  const vercelEnv = process.env.VERCEL_ENV ?? "(unset)";
  const gitRef =
    process.env.VERCEL_GIT_COMMIT_REF ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ??
    "(unset)";
  const uatFlag = process.env.PREVIEW_WALLET_FINALIZE_UAT === "1";
  const enabled = isPreviewWalletFinalizeUatUiEnabled();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">
          Preview UAT — wallet eSIM local finalization
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Temporary ADMIN harness. Simulates post-provider-success local
          finalization only. Does not call VeSIM, payment gateway, or send
          install emails.
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-2 rounded border bg-zinc-50 p-4 text-sm">
        <div>
          <dt className="font-medium">VERCEL_ENV</dt>
          <dd className="font-mono text-xs">{vercelEnv}</dd>
        </div>
        <div>
          <dt className="font-medium">Git ref</dt>
          <dd className="font-mono text-xs">{gitRef}</dd>
        </div>
        <div>
          <dt className="font-medium">Expected branch</dt>
          <dd className="font-mono text-xs">
            {PREVIEW_WALLET_FINALIZE_UAT_BRANCH}
          </dd>
        </div>
        <div>
          <dt className="font-medium">PREVIEW_WALLET_FINALIZE_UAT</dt>
          <dd className="font-mono text-xs">{uatFlag ? "1" : "off"}</dd>
        </div>
      </dl>

      {enabled ? (
        <WalletFinalizeUatControls />
      ) : (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Harness disabled. Requires{" "}
          <span className="font-mono">PREVIEW_WALLET_FINALIZE_UAT=1</span>,
          non-mapesim.com hosts, branch{" "}
          <span className="font-mono">
            {PREVIEW_WALLET_FINALIZE_UAT_BRANCH}
          </span>{" "}
          when git ref is present, and no live VeSIM env.
        </p>
      )}
    </div>
  );
}
