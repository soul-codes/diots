import { readFileSync } from "fs";
import { code } from "kbts";
import { resolve } from "path";
import { packageDirectorySync } from "pkg-dir";

export const pkgRoot = packageDirectorySync()!;
export const pkg = (
  JSON.parse(
    readFileSync(resolve(pkgRoot || process.cwd(), "package.json"), "utf-8")
  ) as { name: string }
).name;

export const pkgRef = code(pkg);
