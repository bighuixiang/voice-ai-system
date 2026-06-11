#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const targetDir = join(root, "ui", "src", "components", "novel");

const hexColorPattern = /#[0-9a-fA-F]{3,8}\b/g;
const lightBackgroundPattern =
  /\bbackground(?:-color)?\s*:\s*(?:white|snow|ivory|floralwhite|ghostwhite|whitesmoke)\b/i;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    return stats.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

const failures = [];
const files = walk(targetDir).filter((file) => file.endsWith(".vue"));

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const styleBlockPattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match;

  while ((match = styleBlockPattern.exec(source)) !== null) {
    const styleStartLine = lineNumberAt(source, match.index);
    const lines = match[1].split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) {
        return;
      }

      const hexColors = [...line.matchAll(hexColorPattern)].map((item) => item[0]);
      if (hexColors.length > 0) {
        failures.push({
          file,
          line: styleStartLine + index + 1,
          reason: `hardcoded hex color ${[...new Set(hexColors)].join(", ")}`,
        });
      }

      if (lightBackgroundPattern.test(line)) {
        failures.push({
          file,
          line: styleStartLine + index + 1,
          reason: "hardcoded light background; use theme tokens instead",
        });
      }
    });
  }
}

if (failures.length > 0) {
  console.error("Theme token check failed for novel workspace components:");
  for (const failure of failures) {
    console.error(`- ${relative(root, failure.file)}:${failure.line} ${failure.reason}`);
  }
  process.exit(1);
}

console.log(
  `Theme token check passed: ${files.length} novel Vue components use theme tokens in style blocks.`,
);
