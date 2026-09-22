/**
 * One-shot local preview writer for the redesigned "Your eSIM is Ready" email.
 * Not part of CI — run with: npx tsx scripts/write-esim-ready-email-preview.ts
 */
import { mkdirSync, writeFileSync } from "fs";
import { generateEsimQrDataUrl, resolveInstallQrValue } from "../app/lib/email/qr";
import { EMAIL_LOGO_PUBLIC_PATH } from "../app/lib/email/logo";
import {
  getSampleOrderEmailPayload,
  renderOrderEmailHtml,
} from "../app/lib/email/template";

async function main() {
  const sample = getSampleOrderEmailPayload({ withOfficialIphoneLink: true });
  const installValue = resolveInstallQrValue(sample);
  const qrDataUrl = installValue
    ? await generateEsimQrDataUrl(installValue)
    : null;

  const previewHtml = renderOrderEmailHtml(sample, {
    qrImageSrc: qrDataUrl || sample.qrImageUrl,
    hasQrAttachment: Boolean(qrDataUrl),
    logoImageSrc: EMAIL_LOGO_PUBLIC_PATH,
  });

  const productionShapeHtml = renderOrderEmailHtml(sample, {
    qrImageSrc: sample.qrImageUrl,
    hasQrAttachment: true,
  });

  mkdirSync("tmp", { recursive: true });
  writeFileSync("tmp/esim-ready-email-preview.html", previewHtml, "utf8");
  writeFileSync(
    "tmp/esim-ready-email-production-shape.html",
    productionShapeHtml,
    "utf8"
  );

  const ok =
    !productionShapeHtml.includes("cid:") &&
    !productionShapeHtml.includes("data:image") &&
    Boolean(sample.qrImageUrl?.includes("/api/vesim/install/qr"));

  console.log(
    JSON.stringify({
      preview_ok: ok,
      preview: "tmp/esim-ready-email-preview.html",
      production_shape: "tmp/esim-ready-email-production-shape.html",
      qrImageUrl: sample.qrImageUrl,
    })
  );

  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
