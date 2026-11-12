import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cli = resolve("node_modules/supabase/bin/supabase");
const command = process.platform === "win32" ? `${cli}.exe` : cli;
const result = spawnSync(command, ["gen", "types", "typescript", "--local", "--schema", "public"], { encoding: "utf8" });
if (result.error || result.status !== 0 || !result.stdout.trim()) {
  console.error(result.error?.message ?? result.stderr ?? "Pembuatan tipe database gagal.");
  process.exit(1);
}
writeFileSync("packages/supabase/src/database.types.ts", result.stdout, "utf8");
