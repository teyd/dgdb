#!/usr/bin/env bun
/**
 * Fetches Discord's detectable applications list and reduces it to the
 * fields we actually need, writing the result to several JSON files.
 *
 * detectable.json          minified, all apps (default consumer entry point)
 * pretty-detectable.json   pretty-printed, all apps (human-readable)
 * detectable-win32.json    minified, apps with win32 executables (win32 only)
 * detectable-darwin.json   minified, apps with darwin executables (darwin only)
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
const OUTPUT_DIR = new URL("../", import.meta.url);

interface Executable {
  name: string;
  os: string;
  is_launcher: boolean;
}

interface App {
  id: string;
  name: string;
  icon_hash: string | null;
  cover_hash: string | null;
  executables: Executable[];
}

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

const reduce = (app: (typeof apps)[number], os?: string): App | null => {
  const executables = (app.executables ?? [])
    .filter((exe) => os === undefined || exe.os === os)
    .map((exe) => ({
      name: exe.name,
      os: exe.os,
      is_launcher: exe.is_launcher ?? false,
    }));

  if (os !== undefined && executables.length === 0) return null;

  return {
    id: app.id,
    name: app.name,
    icon_hash: app.icon_hash ?? null,
    cover_hash: app.cover_image_hash ?? null,
    executables,
  };
};

const byName = (a: App, b: App) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

const all = apps.map((app) => reduce(app)).filter((a): a is App => a !== null).sort(byName);
const win32 = apps.map((app) => reduce(app, "win32")).filter((a): a is App => a !== null).sort(byName);
const darwin = apps.map((app) => reduce(app, "darwin")).filter((a): a is App => a !== null).sort(byName);

const writeJson = (name: string, data: App[], pretty = false) =>
  Bun.write(new URL(name, OUTPUT_DIR), JSON.stringify(data, null, pretty ? 2 : undefined) + "\n");

const outputs: Array<[string, App[]]> = [
  ["detectable.json", all],
  ["pretty-detectable.json", all],
  ["detectable-win32.json", win32],
  ["detectable-darwin.json", darwin],
];

for (const [name, data] of outputs) {
  await writeJson(name, data, name === "pretty-detectable.json");
}

for (const [name, data] of outputs) {
  const size = (Bun.file(new URL(name, OUTPUT_DIR)).size / 1024).toFixed(0);
  console.log(`${name}: ${data.length} apps, ${size} KB`);
}
