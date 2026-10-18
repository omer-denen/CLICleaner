# CLICleaner

![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/github/license/omer-denen/CLICleaner)
![Version](https://img.shields.io/github/v/tag/omer-denen/CLICleaner?label=version)
![npm](https://img.shields.io/npm/v/clicleaner)

[Türkçe (varsayılan)](README.md) · **English**

**Finds the files that fill your Windows disk but never appear in "Add or
remove programs" — shows you the evidence, and deletes nothing without your
approval.**

Caches, package stores, interpreter environments, model weights, updater
leftovers, unused CLIs… They all take space, and it is hard to know which ones
are safe to remove. CLICleaner decides by **markers observed on disk**, not by
guessing from folder names.

> **Nothing is deleted without your approval.** The first scan only lists.

---

## Start in 30 seconds

1. Install **Node.js 22.6 or newer** → [nodejs.org](https://nodejs.org) (LTS).
2. Open **PowerShell**: Start → type `PowerShell` → open.
3. Type this and press Enter:

   ```powershell
   npx clicleaner
   ```

4. The browser opens automatically. If it does not, paste the
   `http://localhost:<port>` address printed in the terminal.
5. Press **Inspect**. While the scan runs, the left column shows the directories
   being scanned and the right column shows what is found.
6. When it finishes press **OK**, then review the list.
7. Tick what you want to delete → **Plan and confirm** → read the plan → type
   `SIL` → **Apply plan**.

The default mode is the **Recycle Bin**, so a wrong decision is reversible
(`clicleaner undo --restore`).

### Never used a terminal before?

- Run `node --version`; if it is below `v22.6.0`, install the LTS from nodejs.org.
- `npx clicleaner` downloads the package on first run; it takes a few seconds.
- A scan may take a few minutes on large folders. The **Cancel scan** button is
  always available.
- Press `Ctrl+C` in the terminal to stop.
- You do not have to delete anything; you can just look and close it.

---

## If you use AI coding tools

> **New to AI tools** — installing your first agent or model? This section is
> for you. You can be a senior developer and still be new to AI tooling; that
> is exactly the point.

AI coding tools download a lot in the background: model weights, CUDA/cuDNN
runtimes, Python environments, package caches, agent sessions and skills. They
never appear in "Add or remove programs", and it is hard to tell what can be
regenerated and what is **your data**.

CLICleaner makes that distinction from evidence, not guesses:

| What is on the AI side? | What CLICleaner does |
|---|---|
| Agent sessions, skills, memory | **Keeps them.** User value; never produces a delete target. |
| Model weights (ONNX/GGUF) | **Keeps them.** Only unusable GPU variants/leftovers are targeted; CPU models stay. |
| CUDA / cuDNN / ORT runtime | A candidate only if a log says "CPU" and the runtime is unused; otherwise untouched. |
| Python / conda environments | **Reports** old or idle ones; environments tied to a project are kept. |
| Package caches (npm, uv, NuGet) | Safe candidate because they can be downloaded again. |
| Unused CLI tools | Produces a removal **plan**; never removes anything on its own. |

### Plain-language glossary

| Term | What it means |
|---|---|
| **Cache** | Files that can be downloaded again; deleting them recreates them. |
| **Model** | The big file that is the AI's "brain"; re-downloading can be gigabytes. |
| **Runtime** | The library that runs the model; CPU and GPU versions exist. |
| **Environment (venv/conda)** | An isolated install of a project's Python packages. |
| **Agent session / skill** | Chat history and learned skills — **your data**. |
| **Shim** | A small shortcut file that launches a command. |

> Rule: **agent data, skills and models are never deleted automatically.** Only
> reproducible caches and parts proven unusable become candidates.

---

## What it finds — and what it leaves alone

**Finds (shows as candidates):**

| Category | Examples |
|---|---|
| Package caches | npm, NuGet, conda, uv |
| Interpreter environments | `.venv`, conda `envs/` |
| Model stores | ONNX / GGUF weights |
| GPU runtime leftovers | unused CUDA DLLs |
| Updater leftovers | `app-<version>`, updater folders |
| CLI / agent leftovers | old versions, unused tools |

**Leaves alone:**

| Untouched | Why |
|---|---|
| Documents, photos, projects | never scanned |
| Application settings | only `Cache` / `GPUCache` are targeted |
| Agent sessions and skills | user value |
| Virtual disks (`.vhd` / `.vhdx`) | report only |
| SDK installations | report only |

---

## Why it is safe

- **Evidence:** every decision says why it was made (`CACHEDIR.TAG`, `.nupkg`,
  `model.onnx`, a log line…).
- **Two steps:** a plan first, then a written `SIL` approval. `--yes` cannot
  bypass it for medium/high risk.
- **Recycle Bin:** default mode; undo a mistake.
- **Targeted deletion:** not the whole folder — only the safe part (e.g. files
  older than 3 days in `Temp`).
- **Local:** the UI listens only on `127.0.0.1`; no telemetry, nothing leaves
  your machine.
- **Open source:** MIT licensed; read the code, build it yourself.

---

## What you will see on first launch

1. **Scan screen:** the directories being scanned on the left with their status
   (`✓` found, `●` scanning, `○` pending), findings streaming on the right.
2. **List:** `All` / `Recommended` / `Verify` / `Report` / `Protected` tabs;
   sort by size, risk, date or name.
3. **Plan:** each target, its size and the exact command. Confirm by typing
   `SIL`.
4. **CLIs tab:** installed tools, idle evidence and a removal plan (the
   inventory is read-only; it never removes anything on its own).

---

## FAQ

**I only want to look, not delete.**
Inspect; nothing is deleted. In the terminal, `clicleaner clean --dry-run`
shows the plan only.

**Will it delete my AI agent's chats, skills or model?**
No. Agent sessions and skills count as user data and never become delete
targets. Models are kept; only GPU leftovers proven unusable become candidates.

**I deleted something by mistake.**
Restore from the Recycle Bin: `clicleaner undo --restore`.

**Why is the scan slow?**
It measures the largest folders on disk. You can stop it at any time with
**Cancel scan**.

**Node is missing / too old.**
Install the LTS from [nodejs.org](https://nodejs.org); verify with
`node --version`.

**Does it work outside Windows?**
Windows only for now.

**My antivirus warned me.**
The tool can delete files. Run `clicleaner clean --dry-run` first; it deletes
nothing.

**Is my data sent anywhere?**
No. Everything runs locally.

**How do I uninstall it?**
`npm uninstall -g clicleaner`. If you only used `npx`, nothing is installed.

---

## Installation (detailed)

### Requirements

- **Windows 10/11** (64-bit)
- **Node.js 22.6 or newer** — [nodejs.org](https://nodejs.org)
- No administrator rights needed.

```bash
node --version    # must be v22.6.0 or newer
```

### 1) Try without installing

```bash
npx clicleaner
```

### 2) Install globally

```bash
npm install -g clicleaner
clicleaner
```

### 3) Run from source

```bash
git clone https://github.com/omer-denen/CLICleaner.git
cd CLICleaner
npm install
node bin/clicleaner.mjs
```

### Uninstall and data location

```bash
npm uninstall -g clicleaner
```

- Tool data: `%LOCALAPPDATA%\clicleaner` — logs, plan journals, the 24-hour scan
  cache and the backup vault. Safe to delete.
- If you only tried `npx`, nothing is installed; the npm download cache can be
  cleared with `npm cache clean`.

### Troubleshooting

| Problem | Fix |
|---|---|
| Browser did not open | Paste the `http://localhost:<port>` address from the terminal |
| "Invalid token" | A new token is generated on every start; close the old tab and use the new address |
| TUI looks broken | Ink needs a real terminal (TTY); use Windows Terminal or PowerShell |
| Long path errors | The tool uses the `\\?\` prefix; verify with `clicleaner doctor` |
| Non-Windows system | Only Windows is supported for now |
| An old tab is still open | A new token is generated on every start; use the new address |

---

## Usage

```bash
clicleaner                         # open the browser UI (recommended)
clicleaner ui --tui                # terminal UI (optional)
clicleaner scan                    # scan and list in the terminal
clicleaner clean --dry-run         # show the plan only, delete nothing
clicleaner clean                   # two-step confirmation + Recycle Bin
clicleaner clean --purge           # permanent deletion (written approval)
clicleaner inventory --verbose     # installed CLI inventory (read-only)
clicleaner inventory --unused 21   # tools unused for 21+ days
clicleaner explain <cluster>       # show the decision with evidence
clicleaner log --summary           # summary of recent decisions
clicleaner doctor                  # environment check
clicleaner undo --restore          # restore from the Recycle Bin
```

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

---

## Safety model (detailed)

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
    discover.ts           directory discovery, environment profiles, protected paths
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
