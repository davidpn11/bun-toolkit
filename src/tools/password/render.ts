import type { BtkContext } from "../../context.ts";
import { formatDuration } from "../../output/format.ts";
import { icons } from "../../output/palette.ts";
import type { Output } from "../../output/reporter.ts";
import type { Inspection } from "./inspect.ts";
import type { HashReport, VerifyReport } from "./tool.ts";

export function renderHash(report: HashReport, out: Output, ctx: BtkContext): void {
  for (const hash of report.hashes) out.text(out.style.accent(hash));
  if (report.hashes.length > 1) {
    ctx.reporter.log.success(`${report.hashes.length} passwords · ${formatDuration(report.durationMs)}`);
  }
}

export function renderVerify(report: VerifyReport, out: Output): void {
  const s = out.style;
  if (!report.match) {
    out.text(`${s.error(icons.error)} The password does not match ${s.muted(`(${report.algorithm})`)}`);
    return;
  }
  out.text(`${s.success(icons.success)} The password matches ${s.muted(`(${report.algorithm})`)}`);
  if (report.weaker.length > 0) {
    out.text(
      s.warning(`${icons.warning} The hash is weaker than your settings: ${report.weaker.join("; ")}`),
    );
    out.text(s.muted(`${icons.arrow} Rehash it the next time this password is used`));
  }
}

export function renderInspect(inspection: Inspection, out: Output): void {
  const s = out.style;
  const pairs: Record<string, unknown> =
    inspection.algorithm === "bcrypt"
      ? { algorithm: "bcrypt", cost: inspection.cost }
      : {
          algorithm: inspection.algorithm,
          version: inspection.version,
          memory: `${inspection.memoryCost} KiB`,
          passes: inspection.timeCost,
          parallelism: inspection.parallelism,
        };
  out.keyValue(pairs);
  out.text();
  if (inspection.weaker.length === 0) {
    out.text(`${s.success(icons.success)} As strong as your settings or stronger`);
    return;
  }
  for (const reason of inspection.weaker) out.text(`${s.warning(icons.warning)} ${reason}`);
  out.text(s.muted(`${icons.arrow} Rehash it the next time the password is used`));
}
