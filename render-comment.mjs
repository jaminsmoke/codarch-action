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
const migration = report.migration ?? null;
const symbols = report.symbols ?? null;
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
  introducedViolations.length +
  (symbols?.summary?.changed ?? 0) +
  (symbols?.summary?.added ?? 0) +
  (symbols?.summary?.removed ?? 0);

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
if (symbols) {
  lines.push(
    `| Símbolos | +${symbols.summary?.added ?? 0} · −${
      symbols.summary?.removed ?? 0
    } · ~${symbols.summary?.changed ?? 0} |`
  );
}
if (migration) {
  lines.push(
    `| Migración | deuda ${migration.debt?.head ?? 0} (${
      signed(migration.debt?.delta ?? 0)
    }) · ${migration.crossings?.head ?? 0} cruces FFI |`
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
    // De dónde sale la regla (ADR 0029): el equipo, un perfil o un addon.
    const origin = ruleOrigin(violation.source);
    lines.push(
      `- ${icon} \`${escapeInline(violation.rule)}\`${origin}: ${escapeText(
        violation.message
      )}`
    );
  }
  if (introducedViolations.length > 5) {
    lines.push(`- … y ${introducedViolations.length - 5} más`);
  }
  lines.push("");
}

if (symbols && symbols.files?.length > 0) {
  lines.push("### Símbolos");
  for (const file of symbols.files.slice(0, 5)) {
    const changed = file.symbols.filter((symbol) => symbol.status === "changed");
    for (const symbol of changed.slice(0, 3)) {
      const delta = symbol.complexityDelta;
      lines.push(
        `- \`${escapeInline(file.path)}\` · \`${escapeInline(symbol.name)}\`: complejidad ${
          delta === null || delta === undefined ? "sin medir" : signed(delta)
        }`
      );
    }
    const added = file.symbols.filter((symbol) => symbol.status === "added");
    const removed = file.symbols.filter((symbol) => symbol.status === "removed");
    if (added.length > 0) {
      lines.push(
        `- \`${escapeInline(file.path)}\`: ${added.length} nuevo(s) · ${added
          .slice(0, 3)
          .map((symbol) => `\`${escapeInline(symbol.name)}\``)
          .join(", ")}`
      );
    }
    if (removed.length > 0) {
      lines.push(
        `- \`${escapeInline(file.path)}\`: ${removed.length} eliminado(s) · ${removed
          .slice(0, 3)
          .map((symbol) => `\`${escapeInline(symbol.name)}\``)
          .join(", ")}`
      );
    }
  }
  lines.push("");
}

if (migration) {
  const increased = migration.files?.increased ?? [];
  const decreased = migration.files?.decreased ?? [];
  if (increased.length > 0 || decreased.length > 0) {
    lines.push("### Migración");
    for (const file of increased.slice(0, 5)) {
      lines.push(
        `- \`${escapeInline(file.path)}\`: deuda ${file.base ?? 0} → ${
          file.head ?? 0
        } (${signed(file.delta ?? 0)})`
      );
    }
    for (const file of decreased.slice(0, 5)) {
      lines.push(
        `- \`${escapeInline(file.path)}\`: deuda ${file.base ?? 0} → ${
          file.head ?? 0
        } (${signed(file.delta ?? 0)})`
      );
    }
    const shown = Math.min(5, increased.length) + Math.min(5, decreased.length);
    const total = increased.length + decreased.length;
    if (total > shown) lines.push(`- … y ${total - shown} más`);
    lines.push("");
  }
}

if (
  cycles.length === 0 &&
  hotspots.length === 0 &&
  introducedViolations.length === 0 &&
  (migration?.files?.increased?.length ?? 0) === 0 &&
  (migration?.files?.decreased?.length ?? 0) === 0 &&
  (symbols?.files?.length ?? 0) === 0
) {
  lines.push("Sin ciclos, hotspots, violaciones ni cambios de símbolos nuevos.");
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

/**
 * De dónde sale una regla, en corto: el equipo no se anota (es lo normal),
 * un perfil del catálogo se dice y un addon se nombra (ADR 0029).
 */
function ruleOrigin(source) {
  if (!source || source === "config") return "";
  if (source === "profile") return " (del perfil)";
  if (String(source).startsWith("addon:")) {
    return ` (addon \`${escapeInline(String(source).slice("addon:".length))}\`)`;
  }
  return "";
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
