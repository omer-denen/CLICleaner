# CLICleaner

![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/github/license/omer-denen/CLICleaner)
![Version](https://img.shields.io/github/v/tag/omer-denen/CLICleaner?label=version)
![npm](https://img.shields.io/npm/v/clicleaner)

[Türkçe (varsayılan)](README.md) · **English**

A Windows cleaner that finds the **caches, package stores, interpreter
environments and CLI leftovers** filling a developer's disk — based on
evidence, never deleting anything without your approval.

> **Classify by evidence, never by name.**
> Show every decision with its reason. Make deletion a two-step confirmation.

---

## Why?

On a developer machine, the space hogs rarely belong to a single application:
npm/NuGet/conda/uv caches, `.venv` and conda environments, AI agent session
folders, updater leftovers, half-downloaded models. They are invisible in
Windows "Add or remove programs", and deleting them without knowing what they
are is risky.

CLICleaner recognises these folders **without looking at their names**. No
application name (like `opencode` or `claude`) appears in the source; only
markers observed on disk are read:

| Observation | Conclusion |
|---|---|
| `CACHEDIR.TAG` | This folder is a cache (npm, conda, uv, pip standard) |
| `packages/<pkg>/<version>/*.nupkg` | NuGet package store |
| `model.onnx` + `tokenizer.json` | Local AI model store |
| `cuDNN` / `cuBLAS` / `onnxruntime_providers_cuda.dll` | GPU accelerator runtime |
| `pyvenv.cfg`, `conda-meta`, `envs/`, `site-packages` | Compiled interpreter environment |
| `.vhd` / `.vhdx` | Virtual disk — **never deleted automatically** |
| `Device: CPU` in a log + CUDA DLLs | Downloaded but unusable runtime |
| `skills/` + `SKILL.md` or `.skill-lock.json` | Agent workspace — **user value** |
| `extensions/` + `extensions.json` | Editor extension store (old versions are targeted) |
| `app-<version>` + `Update.exe` | Versioned app store (newest version kept) |

When a new tool appears, no rule is needed: the same markers recognise it.

## Highlights

- **Evidence chain:** every decision answers "which observation supports it"
  (`clicleaner explain <cluster>`).
- **Targeted deletion:** never the whole folder — only the safe part
  (e.g. files older than 3 days in `Temp`, only `Cache` in Electron apps).
- **Two-step confirmation:** plan → written approval. Medium/high risk requires
  typing `SIL`; `--yes` cannot bypass it.
- **Live scanning:** while a scan runs, scanned directories and found clusters
  stream to the screen; cancel really stops the server-side work.
- **Unused CLI inventory:** reports installed tools with idle evidence
  (shim access time, state folder, shell history); removal uses the package
  manager's own uninstall command.
- **Local and quiet:** the UI listens only on `127.0.0.1`, generates a random
  token on every start, and sends no telemetry.

## Installation

### Requirements

- **Windows 10/11** (64-bit)
- **Node.js 22.6 or newer** — [nodejs.org](https://nodejs.org)
- No administrator rights needed; the tool only reads user folders.

Verify the version:

```bash
node --version    # must be v22.6.0 or newer
```

### 1) Try without installing

```bash
npx clicleaner ui --web
```

The browser opens automatically. If it does not, use the address printed in the
terminal (it contains a token that changes on every start).

### 2) Install globally

```bash
npm install -g clicleaner
clicleaner ui --web
```

### 3) Run from source

```bash
git clone https://github.com/omer-denen/CLICleaner.git
cd CLICleaner
npm install
node bin/clicleaner.mjs ui --web
```

### First run — web UI

1. Press **Inspect**. While the scan runs, the left column lists the directories
   being scanned and the right column shows clusters as they are found.
2. When the scan finishes a **"Scan complete"** dialog appears; press **OK** to
   see the list.
3. Review clusters in the tabs: `Recommended` / `Verify` / `Report` / `Protected`.
   Sort by size, risk, date or name.
4. Tick the ones you want to delete → **Plan and confirm**.
5. Read the plan → tick the acknowledgement (if high risk exists) → type `SIL` →
   **Apply plan**.
6. The default mode is the **Recycle Bin**, so a wrong decision is reversible.
   Permanent deletion is a separate mode and cannot be undone.

The `CLIs` tab shows installed tools, their idle evidence and removal plans
(the inventory is read-only).

### First run — terminal

```bash
clicleaner scan                    # scan and list
clicleaner clean --dry-run         # show the plan only, delete nothing
clicleaner clean                   # two-step confirmation + Recycle Bin
clicleaner inventory --verbose     # installed CLI inventory (read-only)
clicleaner inventory --unused 21   # tools unused for 21+ days
clicleaner explain <cluster>       # show the decision with evidence
clicleaner log --summary           # summary of recent decisions
clicleaner doctor                  # environment check (long paths, recycle, GPU)
```

### Uninstall and data location

```bash
npm uninstall -g clicleaner
```

- Tool data: `%LOCALAPPDATA%\clicleaner` — logs, plan journals, the 24-hour
  scan cache and the backup vault. It is safe to delete; the tool recreates
  what it needs.
- If you only tried `npx`, nothing is installed; the npm download cache can be
  cleared with `npm cache clean`.

### Troubleshooting

| Problem | Fix |
|---|---|
| TUI looks broken / does not start | Ink needs a real terminal (TTY); use Windows Terminal or PowerShell |
| Browser did not open | Paste the `http://127.0.0.1:<port>/?token=...` address from the terminal |
| "Invalid token" | The server generates a new token on every start; close the old tab and use the new address |
| Long path errors | The tool uses the `\\?\` prefix; verify with `clicleaner doctor` |
| Non-Windows system | Only Windows is supported for now |
| Antivirus warning | The tool can delete files; try `clean --dry-run` and decide for yourself |

## Usage

### Environments (`--env`)

| Environment | Scope |
|---|---|
| `dotfolders` | `.*` folders in the home directory |
| `localappdata` | Local application data |
| `roamingappdata` | Roaming application data |
| `pkgcache` | npm / NuGet / conda / uv caches |
| `agent` | AI agent sessions and workspaces |
| `runtime` | Compiled interpreter environments |
| `temp` | Temporary files |
| `vdisk` | WSL / Docker / VM disks (report only) |

### Profiles

| Profile | Behaviour |
|---|---|
| `lean` | Safe caches only |
| `audit` | Report everything, delete nothing |
| `full` | All categories, confirm by risk level |

## Safety model

Decisions fall into three levels:

- **Recommended** — reproducible caches; selected by default.
- **Verify** — review the content before deleting; written `SIL` approval.
- **Report** — virtual disks, VPN settings, SDK installs; **never deleted
  automatically**.

Additional gates:

- Final guard `guard.ts`: a **parent** of a protected path (home directory,
  `%LOCALAPPDATA%`, Program Files, the running `node.exe`) can never be a target.
- In the web UI the client sends **no paths**; it only selects cluster keys.
  Deletion first creates a plan (10 min TTL), then requires written approval.
- Deletions go to the **Recycle Bin** by default.

## Architecture

```
bin/clicleaner.mjs        entry point (tsx loader)
src/
  core/
    types.ts              data model (Cluster, Part, DeleteTarget, Verdict)
    walker.ts             parallel filesystem walker (long-path aware)
    classifier.ts         evidence collector (file kinds, dir layout, log signals)
    analyze.ts            evidence → archetype → verdict + delete targets
    merge.ts              app-based clustering and risk merging
    discover.ts           root discovery, environment profiles, protected paths
    cli-inventory.ts      installed CLIs + idle evidence (read-only)
  actions/
    guard.ts              target safety gate
    delete.ts             Recycle Bin / permanent deletion, journal
    cli-backup.ts         backup vault (state folders)
    cli-remove.ts         package manager's own uninstall
  web/
    server.ts             local HTTP + SSE API (token, Host/Origin gate)
  commands/               scan · clean · inventory · explain · rules · doctor · undo · log · status · tui
web/                      React browser UI (Vite)
```

### Long path support

`npm-cache\_cacache` contains hundreds of paths beyond MAX_PATH; skipping them
would misreport a 15 GB cache. All filesystem calls use the `\\?\` prefix.

## Development

```bash
npm install
npm run typecheck          # root + web type check
npm run build:web          # build the web UI
node bin/clicleaner.mjs scan
```

## Versioning

CLICleaner follows [Semantic Versioning](https://semver.org/):

| Change | Version |
|---|---|
| New feature | MINOR (`0.1.0 → 0.2.0`) |
| Bug fix | PATCH (`0.2.0 → 0.2.1`) |
| Breaking change | MAJOR (`1.0.0`) |

Every release is tagged `vX.Y.Z`; the human-readable summary lives in
[CHANGELOG.md](CHANGELOG.md).

```bash
npm run release:patch   # bug fix
npm run release:minor   # new feature
npm run release:major   # breaking change
git push --follow-tags
```

## License

MIT — see [LICENSE](LICENSE).

CLICleaner never sends data anywhere; the UI runs only on your machine.
The deletion decision always belongs to you.
