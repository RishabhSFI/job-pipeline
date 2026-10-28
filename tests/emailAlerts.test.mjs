import { test } from "node:test";
import assert from "node:assert/strict";
import { readAlerts, alertsConfig } from "../lib/fetchers/emailAlerts.js";

test("without Gmail credentials the fetcher returns nothing and says why", async () => {
  const none = await readAlerts({});
  assert.deepEqual(none.jobs, []);
  assert.match(none.reason, /Gmail is not set up/);

  const placeholder = await readAlerts({ SMTP_EMAIL: "you@example.com", SMTP_APP_PASSWORD: "your-app-password" });
  assert.deepEqual(placeholder.jobs, []);
  assert.match(placeholder.reason, /Gmail is not set up/);
});

test("READ_JOB_ALERTS=false turns the source off even with credentials", async () => {
  const r = await readAlerts({ SMTP_EMAIL: "a@gmail.com", SMTP_APP_PASSWORD: "abcd efgh ijkl mnop", READ_JOB_ALERTS: "false" });
  assert.deepEqual(r.jobs, []);
  assert.match(r.reason, /READ_JOB_ALERTS/);
});

test("settings default to on with a 14 day lookback", () => {
  const c = alertsConfig({ SMTP_EMAIL: "a@gmail.com", SMTP_APP_PASSWORD: "abcd efgh ijkl mnop" });
  assert.equal(c.hasCredentials, true);
  assert.equal(c.enabled, true);
  assert.equal(c.lookbackDays, 14);
  assert.equal(c.pass, "abcdefghijklmnop");
  assert.equal(alertsConfig({ ALERTS_LOOKBACK_DAYS: "30" }).lookbackDays, 30);
});
