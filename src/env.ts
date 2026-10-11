export type OutputMode = "human" | "ci" | "json";

export type EnvironmentInput = {
  argv: readonly string[];
  env: Record<string, string | undefined>;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  stderrIsTTY: boolean;
};

export type Environment = {
  mode: OutputMode;
  color: boolean;
  interactive: boolean;
  verbose: boolean;
  isCI: boolean;
  isAgent: boolean;
  reason: string;
};

export type OutputPreferences = {
  json?: boolean | undefined;
  color?: boolean | undefined;
  verbose?: boolean | undefined;
};

function truthy(value: string | undefined): boolean {
  return value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  const end = argv.indexOf("--");
  const scan = end === -1 ? argv : argv.slice(0, end);
  return scan.includes(flag);
}

export function detectEnvironment(input: EnvironmentInput, prefs: OutputPreferences = {}): Environment {
  const { argv, env } = input;
  const isCI = truthy(env.CI);
  const isAgent = truthy(env.AGENT);
  const verbose = hasFlag(argv, "--verbose") || truthy(env.BTK_VERBOSE) || prefs.verbose === true;

  const base = { isCI, isAgent, verbose };

  if (hasFlag(argv, "--json"))
    return { ...base, mode: "json", color: false, interactive: false, reason: "--json flag" };
  if (env.BTK_OUTPUT === "json")
    return { ...base, mode: "json", color: false, interactive: false, reason: "BTK_OUTPUT=json" };
  if (isAgent) return { ...base, mode: "json", color: false, interactive: false, reason: "AGENT=true" };
  if (prefs.json === true)
    return { ...base, mode: "json", color: false, interactive: false, reason: "config output.json" };

  const plain = (reason: string): Environment => ({
    ...base,
    mode: "ci",
    color: false,
    interactive: false,
    reason,
  });

  if (isCI) return plain("CI=true");
  if (hasFlag(argv, "--no-color")) return plain("--no-color flag");
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return plain("NO_COLOR is set");
  if (env.TERM === "dumb") return plain("TERM=dumb");
  if (prefs.color === false) return plain("config output.color = false");
  if (!input.stderrIsTTY) return plain("stderr is not a terminal");

  return {
    ...base,
    mode: "human",
    color: true,
    interactive: input.stdinIsTTY && input.stdoutIsTTY,
    reason: "interactive terminal",
  };
}
