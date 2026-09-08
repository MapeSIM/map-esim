/**
 * Offline QA: exclusive FAQ accordion UX (display only).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(existsSync(join(root, "app/components/faq/FaqAccordion.tsx")));
  const accordion = read("app/components/faq/FaqAccordion.tsx");
  const home = read("app/page.tsx");
  const how = read("app/how-it-works/page.tsx");
  const countrySeo = read("app/components/countries/CountrySeoContent.tsx");

  assert.match(accordion, /"use client"/);
  assert.match(accordion, /defaultOpenFirst = true/);
  assert.match(accordion, /useState<number \| null>/);
  assert.match(accordion, /defaultOpenFirst && items\.length > 0 \? 0 : null/);
  assert.match(accordion, /current === index \? null : index/);
  assert.match(accordion, /aria-expanded=\{open\}/);
  assert.match(accordion, /aria-controls=\{panelId\}/);
  console.log("PASS accordion_contract");

  assert.match(home, /FaqAccordion/);
  assert.match(home, /items=\{faqs\}/);
  assert.match(how, /FaqAccordion/);
  assert.match(how, /items=\{faqs\}/);
  assert.match(countrySeo, /FaqAccordion/);
  assert.match(countrySeo, /items=\{content\.faqs\}/);
  assert.match(countrySeo, /faqPage\(/);
  assert.doesNotMatch(home, /<details/);
  assert.doesNotMatch(how, /<details/);
  assert.doesNotMatch(countrySeo, /<details/);
  console.log("PASS surfaces_wired");

  console.log("ALL_QA_PASSED=faq-accordion");
}

main();
