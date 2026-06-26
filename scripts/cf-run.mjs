import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node scripts/cf-run.mjs <wrangler args>");
  process.exit(1);
}

const envPath = resolve(projectRoot, ".env");
let envContent;
try {
  envContent = readFileSync(envPath, "utf8");
} catch {
  console.error(`Missing .env at ${envPath}`);
  process.exit(1);
}

// Parse "export VAR=value", "export VAR="value"", or "export VAR='value'" lines
const env = { ...process.env };
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const m = trimmed.match(/^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/i);
  if (!m) continue;
  let val = m[2];
  if ((val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[m[1]] = val;
}

const wranglerBin = resolve(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
if (!existsSync(wranglerBin)) {
  console.error("Local Wrangler not found. Run 'npm install' first.");
  process.exit(1);
}

console.log("Running Wrangler with token auth (non-interactive, local binary)...");

const child = spawn(process.execPath, [wranglerBin, ...args], {
  stdio: "inherit",
  env,
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 1));
