# dgdb — Discord Game Database

A daily-updated, reduced version of [Discord's detectable applications list](https://discord.com/api/v9/applications/detectable), containing only what you need to map an **executable → game name + artwork**.

The generated dataset is committed to this repo as [`detectable.json`](./detectable.json) and refreshed every day at 00:00 UTC by [.github/workflows/update-detectable.yml](./.github/workflows/update-detectable.yml).

## Fetch endpoints

| File | Size | Use case |
| --- | --- | --- |
| `detectable.json` | ~2.4 MB | **Default.** Apps with at least one executable, minified |
| `pretty-detectable.json` | ~3.3 MB | Same apps, pretty-printed (diffing / humans) |
| `detectable-win32.json` | ~2.4 MB | Windows-only apps, `executables` filtered to `win32` |
| `detectable-darwin.json` | ~15 KB | macOS-only apps, `executables` filtered to `darwin` |

Apps with no executables are left out: there is no executable to match them with, so they cannot be resolved from a running process. If you need name and artwork for an arbitrary Discord application ID (for example from rich presence), you need the [upstream list](https://discord.com/api/v9/applications/detectable) instead.

### Primary (CDN)

```text
https://cdn.jsdelivr.net/gh/teyd/dgdb@main/detectable.json
```

[jsDelivr](https://www.jsdelivr.com/) serves the files from this repo with long cache TTLs and automatic gzip/brotli — use this in apps. To get immutable data for a specific version, pin a commit SHA instead of `main`:

```text
https://cdn.jsdelivr.net/gh/teyd/dgdb@<commit-sha>/detectable.json
```

### Fallback (GitHub raw)

```text
https://raw.githubusercontent.com/teyd/dgdb/main/detectable.json
```

Also cached (~5-minute TTL), no auth needed. Fine as a fallback, but jsDelivr is better suited for frequent fetching.

## Schema

`detectable.json` is a JSON array, sorted by `name`:

```json
[
  {
    "id": "356875221078245376",
    "name": "Overwatch",
    "icon_hash": "a60bb76ba4d4acafbd4cb9aad6e61739",
    "cover_hash": "843a3b07639f068fdacf40b9c3808c46",
    "executables": [
      { "name": "overwatch.exe", "os": "win32", "is_launcher": false }
    ]
  }
]
```

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Discord application ID (snowflake) |
| `name` | `string` | Display name |
| `icon_hash` | `string \| null` | Hash for the app icon (square) |
| `cover_hash` | `string \| null` | Hash for the cover / hero image (wide) |
| `executables` | `array` | Always non-empty. Sorted by `name` (then `os`, `is_launcher`) so unchanged data yields stable diffs |
| `executables[].name` | `string` | Lowercase. May include a path prefix like `_retail_/wow.exe` |
| `executables[].os` | `string` | `win32`, `darwin` or `linux` |
| `executables[].is_launcher` | `boolean` | `true` if it's a launcher executable |

The JSON is minified. `pretty-detectable.json` contains identical data, pretty-printed.
The per-OS files only contain apps that have at least one executable on that OS, with
`executables` filtered to that OS — icons/covers are unchanged.

## Image URLs

Discord's CDN serves both icons **and covers** from the `app-icons` endpoint — just swap in the hash and (for covers) use the hash from `cover_hash`:

### Icon (square)

```text
https://cdn.discordapp.com/app-icons/{id}/{icon_hash}.png
```

Example:

```text
https://cdn.discordapp.com/app-icons/356875221078245376/a60bb76ba4d4acafbd4cb9aad6e61739.png
```

### Cover (wide)

```text
https://cdn.discordapp.com/app-icons/{id}/{cover_hash}.png
```

Example:

```text
https://cdn.discordapp.com/app-icons/356875221078245376/843a3b07639f068fdacf40b9c3808c46.png
```

> Note: unlike store-page assets, these game covers are **not** served from `app-assets/{id}/{hash}.png` — that returns 404. Always use `app-icons`.

### Size and format options

Both endpoints accept an extension and a `size` query parameter:

- Extensions: `.png`, `.jpg` / `.jpeg`, `.webp`
- `size`: any power of two between `16` and `4096` (e.g. `?size=256`). Without it you get the original size.
- GIF/animated assets have hashes starting with `a_` and can be requested with the `.gif` extension.

```text
https://cdn.discordapp.com/app-icons/{id}/{hash}.webp?size=512
```

### Helper snippet

```ts
const iconUrl = (id: string, hash: string, size = 256) =>
  `https://cdn.discordapp.com/app-icons/${id}/${hash}.png?size=${size}`;

// Icon and cover use the same endpoint:
// iconUrl(app.id, app.icon_hash)
// iconUrl(app.id, app.cover_hash)
```

## Matching executables

Executable names are lowercase and can contain path segments (e.g. `_retail_/wow.exe`). Compare on the **file name only** (the part after the last `/`) and treat `is_launcher: true` entries as lower priority, since launchers usually aren't the game itself:

```ts
type App = (typeof apps)[number];

const byExecutable = new Map<string, { app: App; isLauncher: boolean }>();

for (const app of apps) {
  for (const exe of app.executables) {
    const file = exe.name.split("/").pop()!;
    const hit = byExecutable.get(file);
    // Prefer a non-launcher match; ties keep the first app in name order
    if (!hit || (hit.isLauncher && !exe.is_launcher)) {
      byExecutable.set(file, { app, isLauncher: exe.is_launcher });
    }
  }
}

const hit = byExecutable.get("overwatch.exe");
// -> { app: { name: "Overwatch", id: "356875221078245376", ... }, isLauncher: false }
```

Executable names are not unique: 565 file names are used by more than one app, and generic names are very ambiguous — `game.exe` alone maps to 195 apps, `nw.exe` and `hl2.exe` to 35 each. The lookup above picks one app deterministically, but for those names you need another signal (install path, process command line, or asking the user).

## Updating the data

The GitHub Action runs daily and opens no PR — it commits straight to `main` when the upstream data changed. All output files are regenerated on every run. To update manually:

```sh
bun run scripts/build.ts
```

Requirements: [Bun](https://bun.sh). No dependencies.
