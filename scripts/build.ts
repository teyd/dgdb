#!/usr/bin/env bun
/**
 * Fetches Discord's detectable applications list and reduces it to the
 * fields we actually need, writing the result to detectable.json.
 *
 * Output shape per entry:
 * {
 *   "id": "356875221078245376",
 *   "name": "Overwatch",
 *   "icon_hash": "a60bb76ba4d4acafbd4cb9aad6e61739",
 *   "cover_hash": "843a3b07639f068fdacf40b9c3808c46",
 *   "executables": [{ "name": "overwatch.exe", "os": "win32", "is_launcher": false }]
 * }
 */

const SOURCE_URL = "https://discord.com/api/v9/applications/detectable";
const OUTPUT_PATH = new URL("../detectable.json", import.meta.url);

const res = await fetch(SOURCE_URL, {
  headers: { Accept: "application/json" },
});

if (!res.ok) {
  throw new Error(`Failed to fetch detectable list: ${res.status} ${res.statusText}`);
}

const apps = (await res.json()) as Array<{
  id: string;
  name: string;
  icon_hash?: string;
  cover_image_hash?: string;
  executables?: Array<{ name: string; os: string; is_launcher?: boolean }>;
}>;

const reduced = apps
  .map((app) => ({
    id: app.id,
    name: app.name,
    icon_hash: app.icon_hash ?? null,
    cover_hash: app.cover_image_hash ?? null,
    executables: (app.executables ?? []).map((exe) => ({
      name: exe.name,
      os: exe.os,
      is_launcher: exe.is_launcher ?? false,
    })),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

await Bun.write(OUTPUT_PATH, JSON.stringify(reduced, null, 2) + "\n");

console.log(`Wrote ${reduced.length} applications to ${Bun.file(OUTPUT_PATH).name}`);
