import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatRange,
  salaryFromText,
  normalizeLink,
  resolveSalary,
} from "../lib/salary.js";

test("yearly ranges in posting text are read and shortened", () => {
  assert.equal(
    salaryFromText("<p>The base pay range is $135,600 - $169,500 USD.</p>"),
    "$135.6K–$169.5K/yr",
  );
  assert.equal(salaryFromText("Salary: $80K – $95K plus equity"), "$80K–$95K/yr");
  assert.equal(salaryFromText("$120 - 150K depending on level"), "$120K–$150K/yr");
});

test("hourly pay is labelled per hour", () => {
  assert.equal(salaryFromText("Pay: $25 - $32 per hour"), "$25–$32/hr");
  assert.equal(formatRange(25, 25, null), "$25/hr");
});

test("text with no pay range gives nothing", () => {
  assert.equal(salaryFromText("We raised $20M from great investors."), "");
  assert.equal(salaryFromText(""), "");
});

test("the same job link matches with or without a query string", () => {
  assert.equal(
    normalizeLink("https://Jobs.ashbyhq.com/ramp/123/?utm_source=simplify"),
    normalizeLink("https://jobs.ashbyhq.com/ramp/123"),
  );
});

test("pay listed in the posting wins and is labelled", async () => {
  const salary = await resolveSalary(
    { salary: "$90K – $110K", description: "", link: "x" },
    new Map(),
  );
  assert.equal(salary, "$90K–$110K/yr (posting)");
  assert.equal(
    await resolveSalary({ description: "nothing here", link: "x" }, new Map()),
    "Not listed",
  );
});

test("weekly pay and Canadian dollars are labelled", () => {
  assert.equal(salaryFromText("$800 – $1,200 per week"), "$800–$1.2K/wk");
  assert.equal(salaryFromText("CA$54.4K – CA$68K"), "CA$54.4K–CA$68K/yr");
  assert.equal(salaryFromText("$70,000 - $85,000 CAD per year"), "CA$70K–CA$85K/yr");
});

test("a US range followed by a Canadian range stays in US dollars", () => {
  assert.equal(
    salaryFromText("US pay: $104,000 - $130,000. Canada pay: CA$95,000 - CA$120,000."),
    "$104K–$130K/yr",
  );
});
