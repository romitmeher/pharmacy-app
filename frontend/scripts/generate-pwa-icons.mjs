// Rasterize the existing BrandMark geometry; no external image service or new dependency.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const directory = new URL("../public/icons/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, size, maskable] of [
  ["icon-192",192,false], ["icon-512",512,false],
  ["maskable-192",192,true], ["maskable-512",512,true], ["apple-touch-icon",180,false],
]) {
  const scale = maskable ? 8 : 10;
  const offset = (512 - 32 * scale) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#153e32"/><g transform="translate(${offset} ${offset}) scale(${scale})"><path d="M11 2h10v9h9v10h-9v9H11v-9H2V11h9V2Z" fill="#d8ef91"/><path d="m12 20 8-8" stroke="#153e32" stroke-width="2"/></g></svg>`;
  await sharp(Buffer.from(svg)).resize(size,size).png().toFile(fileURLToPath(new URL(`${name}.png`,directory)));
}
await writeFile(new URL("favicon.svg",directory), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#153e32"/><path d="M12 5h8v7h7v8h-7v7h-8v-7H5v-8h7Z" fill="#d8ef91"/><path d="m12 20 8-8" stroke="#153e32" stroke-width="2"/></svg>');
