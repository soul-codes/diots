import { code, em, kb, link } from "kbts";
import { preferredFilename, render, save } from "kbts/markdown";
import rimraf from "rimraf";
import { install } from "source-map-support";

import { pkg, pkgRef } from "./pkgRef.js";

install();
const pwd = process.cwd();

rimraf.sync("./docs");

const kbtsRef = link("https://www.npmjs.com/package/kbts", "kbts");
const iotsRef = link("https://www.npmjs.com/package/io-ts", "io-ts");

const readme = kb(`${pkg} - documentation-preserving decoders`)`
  ${pkgRef} (for "${em("d")}ocumented ${code("io-ts")}" ) augments
  ${iotsRef} decoders. It provides a parallel set of decoder factory functions
  (such as ${code("string")}, ${code("struct")}, etc), with the main difference
  that ${pkgRef} decoders also preserve structural metadata that can be inspected
  through the ${code("meta")} property. Additionally, the decoders can be
  documented with the documentation tagger ${code("doc")}, which lets you write
  documentation using ${kbtsRef}, "kbts").

  The ${pkgRef} decoders are compatible with/can substitute for native
  ${iotsRef} decoders, and the latter can be lifted into the ${pkgRef} realm
  using the ${code("atomic")} function.

  It provides the ${code("docgen")} module, which inspects decoder's structural
  metadata fields and generate kbts documentation.
`;

process.chdir(pwd);
save(
  await render([preferredFilename("README.md")(readme)], {
    paths: [[readme, "."]],
  })
);
