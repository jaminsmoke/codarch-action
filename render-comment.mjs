import fs from "node:fs";

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("uso: render-comment.mjs <report.json>");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const summary = report.summary ?? {};
const rules = report.rules ?? {};
const status = process.env.CODARCH_STATUS ?? "0";
const runUrl = process.env.CODARCH_RUN_URL ?? "";
const artifact = process.env.CODARCH_ARTIFACT ?? "codarch";

const introducedViolations = rules.violations?.introduced ?? [];
const cycles = report.cycles?.introduced ?? [];
const hotspots = report.hotspots ?? [];
const blocked = status === "2";
const errored = status === "1";
const changes =
  (summary.addedFiles ?? 0) +
  (summary.removedFiles ?? 0) +
  (summary.changedFiles ?? 0) +
  (summary.addedEdges ?? 0) +
  (summary.removedEdges ?? 0) +
  cycles.length +
  hotspots.length +
  introducedViolations.length;

const lines = [];
lines.push("<!-- codarch-report -->");
lines.push("## CodArch · arquitectura del PR");
lines.push("");

if (blocked) {
  lines.push("**❌ La política de arquitectura ha fallado.**");
} else if (errored) {
  lines.push("**⚠️ CodArch no pudo completar el análisis.**");
} else if (changes > 0) {
  lines.push("**⚠️ Hay cambios de arquitectura, sin bloqueo.**");
} else {
  lines.push("**✅ Sin cambios relevantes de arquitectura.**");
}
lines.push("");

lines.push("| | |");
lines.push("|---|---|");
lines.push(
  `| Ficheros | +${summary.addedFiles ?? 0} · −${summary.removedFiles ?? 0} · ~${summary.changedFiles ?? 0} |`
);
lines.push(
  `| Aristas | +${summary.addedEdges ?? 0} · −${summary.removedEdges ?? 0} |`
);
lines.push(`| Ciclos nuevos | ${cycles.length} |`);
lines.push(
  `| Hotspots | ${hotspots.length}${
    report.hotspotMetric ? ` (\`${escapeInline(report.hotspotMetric)}\`)` : ""
  } |`
);
if (rules.configured) {
  lines.push(
    `| Reglas | ${rules.summary?.introduced ?? 0} nuevas · ${
      rules.summary?.existing ?? 0
    } existentes |`
  );
}
lines.push("");

if (cycles.length > 0) {
  lines.push("### Ciclos nuevos");
  for (const cycle of cycles.slice(0, 5)) {
    lines.push(
      `- ${cycle.nodes
        .map((node) => `\`${escapeInline(node.path)}\``)
        .join(" → ")}`
    );
  }
  if (cycles.length > 5) lines.push(`- … y ${cycles.length - 5} más`);
  lines.push("");
}

if (hotspots.length > 0) {
  lines.push("### Hotspots");
  for (const hotspot of hotspots.slice(0, 5)) {
    lines.push(
      `- \`${escapeInline(hotspot.path)}\`: \`${escapeInline(
        hotspot.metric
      )}\` ${hotspot.base} → ${hotspot.head} (${signed(hotspot.delta)})`
    );
  }
  if (hotspots.length > 5) lines.push(`- … y ${hotspots.length - 5} más`);
  lines.push("");
}

if (introducedViolations.length > 0) {
  lines.push("### Violaciones nuevas");
  for (const violation of introducedViolations.slice(0, 5)) {
    const icon =
      violation.severity === "error"
        ? "❌"
        : violation.severity === "warn"
          ? "⚠️"
          : "ℹ️";
    lines.push(
      `- ${icon} \`${escapeInline(violation.rule)}\`: ${escapeText(
        violation.message
      )}`
    );
  }
  if (introducedViolations.length > 5) {
    lines.push(`- … y ${introducedViolations.length - 5} más`);
  }
  lines.push("");
}

if (
  cycles.length === 0 &&
  hotspots.length === 0 &&
  introducedViolations.length === 0
) {
  lines.push("Sin ciclos, hotspots ni violaciones nuevas.");
  lines.push("");
}

const footer = [];
if (runUrl) footer.push(`[Ver ejecución](${runUrl})`);
footer.push(`Artefacto: \`${escapeInline(artifact)}\``);
if (report.base?.checksum || report.head?.checksum) {
  footer.push(
    `Base \`${escapeInline(report.base?.checksum ?? "")}\` → Head \`${escapeInline(
      report.head?.checksum ?? ""
    )}\``
  );
}
lines.push(`<sub>${footer.join(" · ")}</sub>`);

process.stdout.write(`${lines.join("\n")}\n`);

function signed(value) {
  if (!value) return "0";
  return value > 0 ? `+${value}` : String(value);
}

function escapeInline(value) {
  return String(value ?? "").replaceAll("`", "'");
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("`", "'")
    .replaceAll("\n", " ")
    .trim();
}
