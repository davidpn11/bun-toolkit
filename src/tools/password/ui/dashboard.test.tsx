import { afterEach, describe, expect, test } from "bun:test";
import { openDashboard } from "../../../../tests/support/dashboard.tsx";
import { createTempProject, type TempProject } from "../../../../tests/support/tmp.ts";
import { keys } from "../../../../tests/support/tui.tsx";
import { password } from "../tool.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

const setup = () => {
  project = createTempProject();
  project.write(
    "btk.config.ts",
    `export default { tools: { password: { memoryCost: 1024, timeCost: 1 } } };`,
  );
  return project;
};

describe("password dashboard", () => {
  test("hash: the typed password stays hidden and the hash appears", async () => {
    const ui = await openDashboard(password, setup(), "Hash a password");
    await ui.press(keys.enter);
    await ui.until("Password");
    await ui.press("s", "3", "c", "r", "e", "t");
    expect(ui.frame()).toContain("••••••");
    expect(ui.frame()).not.toContain("s3cret");
    await ui.press(keys.enter);
    await ui.until("$argon2id$v=19$m=1024,t=1,p=1$");
    ui.unmount();
  });

  test("check: paste a hash, type the password, see whether it matches", async () => {
    const hash = await Bun.password.hash("s3cret", { algorithm: "argon2id", memoryCost: 1024, timeCost: 1 });
    const ui = await openDashboard(password, setup(), "Check a password");
    await ui.press(keys.down, keys.enter);
    await ui.until("Paste the stored hash");
    await ui.press(hash, keys.enter);
    await ui.press("w", "r", "o", "n", "g", keys.enter);
    await ui.until("does not match");
    await ui.press("s", "3", "c", "r", "e", "t", keys.enter);
    await ui.until("The password matches");
    ui.unmount();
  });

  test("inspect: q is typed into the field instead of quitting", async () => {
    const ui = await openDashboard(password, setup(), "Inspect a hash");
    await ui.press(keys.down, keys.down, keys.enter);
    await ui.press("q", keys.enter);
    await ui.until("not an argon2 or bcrypt hash");
    ui.unmount();
  });
});
