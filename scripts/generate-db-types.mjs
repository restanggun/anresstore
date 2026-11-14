import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cli = resolve("node_modules/supabase/dist/supabase.js");
const result = spawnSync(process.execPath, [cli, "gen", "types", "typescript", process.argv.includes("--linked") ? "--linked" : "--local", "--schema", "public"], { encoding: "utf8" });
if (result.error || result.status !== 0 || !result.stdout.trim()) {
  console.error(result.error?.message ?? result.stderr ?? "Pembuatan tipe database gagal.");
  process.exit(1);
}
writeFileSync("packages/supabase/src/database.types.ts", result.stdout, "utf8");
