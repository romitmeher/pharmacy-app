// Deterministic release ID covers code and public assets, including offline UI.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../",import.meta.url));
const hash = createHash("sha256");
async function include(directory) {
  for (const entry of (await readdir(path.join(root,directory), { withFileTypes:true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const name = path.posix.join(directory,entry.name);
    if (name === "public/sw.js") continue;
    if (entry.isDirectory()) await include(name);
    else { hash.update(name); hash.update(await readFile(path.join(root,name))); }
  }
}
for (const directory of ["src", "public", "pwa"]) await include(directory);
for (const file of ["package.json", "package-lock.json", "next.config.ts"]) hash.update(await readFile(path.join(root,file)));
const version = hash.digest("hex").slice(0,20);
const template = await readFile(path.join(root,"pwa/sw-template.js"),"utf8");
await writeFile(path.join(root,"public/sw.js"),template.replace("__PWA_VERSION__",version));
console.log(`PWA worker: ${version}`);
