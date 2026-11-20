#!/usr/bin/env bun
/**
 * Fetches Discord's detectable applications list and reduces it to the
 * fields we actually need, writing the result to several JSON files.
 *
 * detectable.json          minified, apps with executables (default consumer entry point)
 * pretty-detectable.json   pretty-printed, same apps (human-readable)
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

// A degraded upstream response must never overwrite the committed dataset.
const MIN_APPS = 20_000;
const MIN_OUTPUT_APPS = 10_000;

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

type SourceApp = {
  id: string;
  name: string;
  icon_hash?: string;
  cover_image_hash?: string;
  executables?: Array<{ name: string; os: string; is_launcher?: boolean }>;
};

const fetchApps = async (): Promise<SourceApp[]> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(SOURCE_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error("response is not an array");
      }

      return data as SourceApp[];
    } catch (error) {
      lastError = error;
      console.warn(`fetch attempt ${attempt} failed: ${error}`);
    }
  }

  throw new Error(`Failed to fetch detectable list: ${lastError}`);
};

const apps = await fetchApps();

const invalid = apps.filter((app) => typeof app?.id !== "string" || typeof app?.name !== "string");
if (apps.length < MIN_APPS || invalid.length > 0) {
  throw new Error(`Refusing to write: ${apps.length} apps, ${invalid.length} missing id or name`);
}

const reduce = (app: SourceApp, os?: string): App | null => {
  const executables = (app.executables ?? [])
    .filter((exe) => os === undefined || exe.os === os)
    .map((exe) => ({
      name: exe.name,
      os: exe.os,
      is_launcher: exe.is_launcher ?? false,
    }))
    .sort(byExecutable);

  // Apps without a matching executable can never be resolved from one, so
  // they are dropped (this removes ~60% of the upstream list).
  if (executables.length === 0) return null;

  return {
    id: app.id,
    name: app.name,
    icon_hash: app.icon_hash ?? null,
    cover_hash: app.cover_image_hash ?? null,
    executables,
  };
};

// Discord's API returns executables in an unstable order. Sorting them with a
// plain codepoint comparison makes the output byte-identical across machines
// when nothing upstream changed, so the daily job only commits real changes.
const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

const byExecutable = (a: Executable, b: Executable) =>
  cmp(a.name, b.name) || cmp(a.os, b.os) || Number(a.is_launcher) - Number(b.is_launcher);

const byName = (a: App, b: App) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || cmp(a.id, b.id);

const all = apps.map((app) => reduce(app)).filter((a): a is App => a !== null).sort(byName);
const win32 = apps.map((app) => reduce(app, "win32")).filter((a): a is App => a !== null).sort(byName);
const darwin = apps.map((app) => reduce(app, "darwin")).filter((a): a is App => a !== null).sort(byName);

if (all.length < MIN_OUTPUT_APPS) {
  throw new Error(`Refusing to write: only ${all.length} apps have executables`);
}

// Self-check: a broken filter must never reach the committed files.
const check = (data: App[], os?: string) => {
  for (const app of data) {
    if (app.executables.length === 0) throw new Error(`${app.name}: no executables`);
    if (os && app.executables.some((exe) => exe.os !== os)) {
      throw new Error(`${app.name}: executable outside ${os}`);
    }
  }
};

check(all);
check(win32, "win32");
check(darwin, "darwin");

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
