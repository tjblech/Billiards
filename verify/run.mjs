// Regression suite runner. Bundles each entry with Vite (already a dependency,
// so there is nothing extra to install) and runs it under a jsdom DOM.
import { build } from "vite";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const suites = [
  ["verify/engine.ts", "Tournament engine"],
  ["verify/sweep.ts", "Bracket sweep"],
  ["verify/smoke.tsx", "UI smoke test"],
];

let failed = false;
for (const [entry, label] of suites) {
  console.log(`\n[1m── ${label} ──[0m`);
  await build({
    configFile: false,
    logLevel: "error",
    // React only exposes `act` from its development build.
    mode: "development",
    build: {
      ssr: entry,
      outDir: "verify/.out",
      emptyOutDir: true,
      minify: false,
      target: "node20",
      rollupOptions: { output: { entryFileNames: "suite.mjs" } },
    },
  });
  try {
    execFileSync(process.execPath, ["verify/.out/suite.mjs"], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development" },
    });
  } catch {
    failed = true;
  }
}
rmSync("verify/.out", { recursive: true, force: true });
console.log(failed ? "\n[31mSUITE FAILED[0m" : "\n[32mALL SUITES PASSED[0m");
process.exit(failed ? 1 : 0);
