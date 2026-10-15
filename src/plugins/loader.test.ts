import { describe, expect, test } from "bun:test";
import { BtkError } from "../errors.ts";
import { createHooks } from "./loader.ts";
import type { BtkPlugin } from "./types.ts";

const theme = (name: string) => ({ name });

function plugin(name: string, setup: BtkPlugin["setup"]): BtkPlugin {
  return { name, setup };
}

describe("createHooks", () => {
  test("setup runs once, on the first hook call", () => {
    let calls = 0;
    const hooks = createHooks(
      [
        plugin("a", () => {
          calls++;
        }),
      ],
      { warn: () => {} },
    );
    expect(calls).toBe(0);
    hooks.collect("md:theme", undefined);
    hooks.last("md:html:template", { title: "", body: "", css: "", liveReload: "", nav: "" });
    expect(calls).toBe(1);
  });

  test("collect returns every handler's result in plugin order, with the plugin name", () => {
    const hooks = createHooks(
      [
        plugin("a", (h) => h.on("md:theme", () => theme("one"))),
        plugin("b", (h) => {
          h.on("md:theme", () => [theme("two"), theme("three")]);
          h.on("md:html:template", () => "ignored");
        }),
      ],
      { warn: () => {} },
    );
    expect(hooks.collect("md:theme", undefined)).toEqual([
      { plugin: "a", value: theme("one") },
      { plugin: "b", value: [theme("two"), theme("three")] },
    ]);
  });

  test("last returns the last handler's result, or undefined without one", () => {
    const input = { title: "T", body: "B", css: "", liveReload: "", nav: "" };
    const hooks = createHooks(
      [
        plugin("a", (h) => h.on("md:html:template", () => "first")),
        plugin("b", (h) => h.on("md:html:template", ({ title, body }) => `${title}:${body}`)),
      ],
      { warn: () => {} },
    );
    expect(hooks.last("md:html:template", input)).toEqual({ plugin: "b", value: "T:B" });
    expect(createHooks([], { warn: () => {} }).last("md:html:template", input)).toBeUndefined();
  });

  test("a failing setup or handler names the plugin", () => {
    const broken = createHooks(
      [
        plugin("bad", () => {
          throw new Error("boom");
        }),
      ],
      { warn: () => {} },
    );
    expect(() => broken.collect("md:theme", undefined)).toThrow(BtkError);
    expect(() => broken.collect("md:theme", undefined)).toThrow('Plugin "bad" failed in setup(): boom');

    const throwing = createHooks(
      [
        plugin("worse", (h) =>
          h.on("md:theme", () => {
            throw new Error("nope");
          }),
        ),
      ],
      { warn: () => {} },
    );
    expect(() => throwing.collect("md:theme", undefined)).toThrow(
      'Plugin "worse" failed in its "md:theme" hook: nope',
    );
  });

  test("a plugin listed twice warns", () => {
    const warnings: string[] = [];
    const twice = plugin("dup", () => {});
    createHooks([twice, twice], { warn: (m) => warnings.push(m) }).collect("md:theme", undefined);
    expect(warnings).toEqual(['Plugin "dup" is listed twice; both copies run']);
  });
});
