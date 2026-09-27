/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { call, expect, scenario, test } from "./rc-app";

/**
 * Saves, reads and deletes a dummy AI key through the real OS keyring. The
 * key is never sent anywhere: saving performs no provider request. The RC
 * identity must write to its scoped service, never the production `linkgo`
 * service.
 */

const RC_SERVICE = "linkgo:com.linkgo.app.rctest";
const PROVIDER = "openai";

type AuthStatus = {
  accounts: { provider_key: string }[];
};

function credentialTargets(): string[] {
  const output = execFileSync("cmdkey", ["/list"], { encoding: "latin1" });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().includes("linkgo"));
}

test.skip(scenario() !== "fresh", "keyring check runs on the fresh profile");

test("dummy AI key round-trips through the scoped OS keyring", async ({
  app,
}) => {
  const productionBefore = credentialTargets().filter(
    (line) => line.endsWith(".linkgo") || line.endsWith("=linkgo"),
  );

  const saved = await call<AuthStatus>(app, "linkgo_auth_api_key", {
    input: {
      providerKey: PROVIDER,
      apiKey: "sk-rc-dummy-not-a-real-key",
      accountLabel: "RC dummy",
    },
  });
  expect(
    saved.accounts.some((account) => account.provider_key === PROVIDER),
  ).toBe(true);
  expect(
    credentialTargets().some((line) =>
      line.includes(`${PROVIDER}.${RC_SERVICE}`),
    ),
  ).toBe(true);

  const status = await call<AuthStatus>(app, "linkgo_auth_status");
  expect(
    status.accounts.some((account) => account.provider_key === PROVIDER),
  ).toBe(true);
  expect(JSON.stringify(status)).not.toContain("sk-rc-dummy");

  const cleared = await call<AuthStatus>(app, "linkgo_auth_logout", {
    input: { providerKey: PROVIDER },
  });
  expect(
    cleared.accounts.some((account) => account.provider_key === PROVIDER),
  ).toBe(false);
  expect(credentialTargets().some((line) => line.includes(RC_SERVICE))).toBe(
    false,
  );
  // The production service is untouched.
  expect(
    credentialTargets().filter(
      (line) => line.endsWith(".linkgo") || line.endsWith("=linkgo"),
    ),
  ).toEqual(productionBefore);
});
