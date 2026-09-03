# dgdb — Discord Game Database

A daily-updated, reduced version of [Discord's detectable applications list](https://discord.com/api/v9/applications/detectable), containing only what you need to map an **executable → game name + artwork**.

The generated dataset is committed to this repo as [`detectable.json`](./detectable.json) and refreshed every day at 00:00 UTC by [.github/workflows/update-detectable.yml](./.github/workflows/update-detectable.yml).

## Fetching the data

```text
https://raw.githubusercontent.com/teyd/dgdb/main/detectable.json
```

No auth, no rate limit beyond GitHub's standard raw CDN limits (which are generous). You can also pin to a commit SHA instead of `main` if you want stable data between runs.

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
| `executables` | `array` | Empty for apps Discord doesn't auto-detect |
| `executables[].name` | `string` | Lowercase. May include a path prefix like `_retail_/wow.exe` |
| `executables[].os` | `string` | `win32` or `darwin` |
| `executables[].is_launcher` | `boolean` | `true` if it's a launcher executable |

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

Executable names are lowercase and can contain path segments (e.g. `_retail_/wow.exe`). For a robust lookup, compare on the **file name only** (the part after the last `/`), and treat `is_launcher: true` entries as lower priority since launchers usually aren't the game itself:

```ts
const byExecutable = new Map<string, App>();

for (const app of apps) {
  for (const exe of app.executables) {
    const file = exe.name.split("/").pop()!;
    const existing = byExecutable.get(file);
    // Prefer non-launcher matches; first one wins
    if (!existing || (existing.executables.find((e) => e.name.endsWith(file))?.is_launcher && !exe.is_launcher)) {
      byExecutable.set(file, app);
    }
  }
}

const app = byExecutable.get("overwatch.exe");
// -> { name: "Overwatch", id: "356875221078245376", ... }
```

## Updating the data

The GitHub Action runs daily and opens no PR — it commits straight to `main` when the upstream data changed. To update manually:

```sh
bun run scripts/build.ts
```

Requirements: [Bun](https://bun.sh). No dependencies.
