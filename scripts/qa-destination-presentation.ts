/**
 * Offline QA: destination catalog presentation (labels + flags).
 * Does not call VeSIM, mutate pricing, merge destinations, or touch payments.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  destinationDisplayName,
  destinationFlagcdnUrl,
  destinationFlagInitials,
  isCodeLikeDestinationName,
  isSafeDestinationFlagEmoji,
  resolveDestinationFlagVisual,
} from "../app/lib/vesim/destinationPresentation";
import {
  destinationPath,
  slugifyDestination,
} from "../app/lib/vesim/destinations";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const presentation = read("app/lib/vesim/destinationPresentation.ts");
  const listing = read("app/components/countries/CountriesListing.tsx");
  const destinations = read("app/lib/vesim/destinations.ts");

  console.log("1) Raw code display normalization");
  assert.equal(
    destinationDisplayName({ code: "SM", name: "SM" }),
    "San Marino"
  );
  assert.equal(
    destinationDisplayName({ code: "PF", name: "PF" }),
    "French Polynesia"
  );
  assert.equal(
    destinationDisplayName({ code: "SX", name: "SX" }),
    "Sint Maarten"
  );
  assert.equal(
    destinationDisplayName({ code: "BT", name: "BT" }),
    "Bhutan"
  );
  assert.equal(
    destinationDisplayName({ code: "LY", name: "LY" }),
    "Libya"
  );
  assert.equal(
    destinationDisplayName({ code: "TL", name: "TL" }),
    "Timor-Leste"
  );
  assert.equal(isCodeLikeDestinationName("SM", "SM"), true);
  assert.equal(isCodeLikeDestinationName("San Marino", "SM"), false);
  // Named destinations keep provider name when not code-like.
  assert.equal(
    destinationDisplayName({ code: "PK", name: "Pakistan" }),
    "Pakistan"
  );
  console.log("   ok");

  console.log("2) Variant labels without merge");
  assert.equal(
    destinationDisplayName({ code: "PR", name: "Puerto Rico" }),
    "Puerto Rico"
  );
  assert.equal(
    destinationDisplayName({ code: "USPR", name: "Puerto Rico" }),
    "Puerto Rico (US)"
  );
  const prPath = destinationPath({
    code: "PR",
    name: "Puerto Rico",
    slug: "puerto-rico",
    kind: "country",
  });
  const usprPath = destinationPath({
    code: "USPR",
    name: "Puerto Rico",
    slug: "puerto-rico",
    kind: "country",
  });
  // Presentation must not rewrite destinationPath / slug identity.
  assert.equal(prPath, "/countries/puerto-rico");
  assert.equal(usprPath, "/countries/puerto-rico");
  assert.equal(slugifyDestination("Puerto Rico"), "puerto-rico");
  assert.doesNotMatch(presentation, /mergeDestinations|dedupeDestinations/);
  assert.doesNotMatch(listing, /filter\(\s*\(.*unique.*code/i);
  console.log("   ok");

  console.log("3) Flag fallback — no broken flagcdn / wrong national flag");
  assert.equal(destinationFlagcdnUrl("IC"), null);
  assert.equal(destinationFlagcdnUrl("AN"), null);
  assert.equal(destinationFlagcdnUrl("SM"), "https://flagcdn.com/w80/sm.png");
  assert.equal(destinationFlagcdnUrl("PK"), "https://flagcdn.com/w80/pk.png");
  assert.equal(destinationFlagcdnUrl("USPR"), null);
  assert.equal(isSafeDestinationFlagEmoji("AN", "🇳🇱"), false);
  assert.equal(isSafeDestinationFlagEmoji("IC", "🇮🇨"), true);
  assert.deepEqual(
    resolveDestinationFlagVisual({
      code: "AN",
      name: "Netherlands Antilles",
      flag: "🇳🇱",
      kind: "country",
    }),
    { type: "initials", initials: "AN" }
  );
  assert.deepEqual(
    resolveDestinationFlagVisual({
      code: "IC",
      name: "Canary Islands",
      flag: "🇮🇨",
      kind: "country",
    }),
    { type: "emoji", emoji: "🇮🇨" }
  );
  assert.equal(destinationFlagInitials("USPR"), "USPR");
  assert.match(listing, /resolveDestinationFlagVisual|DestinationFlagBadge/);
  assert.match(listing, /onError/);
  console.log("   ok");

  console.log("4) Provider identifiers unchanged in catalog normalize layer");
  assert.doesNotMatch(destinations, /DESTINATION_CODE_DISPLAY_NAMES/);
  assert.doesNotMatch(destinations, /destinationDisplayName/);
  assert.match(listing, /destinationDisplayName/);
  assert.match(listing, /code:\s*destination\.code/);
  console.log("   ok");

  console.log("PASS destination_presentation_qa");
}

main();
