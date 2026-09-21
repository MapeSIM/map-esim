/**
 * Offline QA: server-friendly FAQ accordion (native details/summary).
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

  assert.doesNotMatch(accordion, /["']use client["']/);
  assert.doesNotMatch(accordion, /useState/);
  assert.match(accordion, /defaultOpenFirst = true/);
  assert.match(accordion, /<details/);
  assert.match(accordion, /<summary/);
  assert.match(accordion, /name=\{groupName\}/);
  assert.match(accordion, /openByDefault/);
  console.log("PASS accordion_contract");

  assert.match(home, /FaqAccordion/);
  assert.match(home, /items=\{faqs\}/);
  assert.match(how, /FaqAccordion/);
  assert.match(how, /items=\{faqs\}/);
  assert.match(countrySeo, /FaqAccordion/);
  assert.match(countrySeo, /items=\{content\.faqs\}/);
  assert.match(countrySeo, /faqPage\(/);
  console.log("PASS surfaces_wired");

  console.log("ALL_QA_PASSED=faq-accordion");
}

main();
