# CLICleaner

![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/github/license/omer-denen/CLICleaner)
![Version](https://img.shields.io/github/v/tag/omer-denen/CLICleaner?label=version)
![npm](https://img.shields.io/npm/v/clicleaner)

[Türkçe (varsayılan)](README.md) · **English**

**Finds the files that fill your Windows disk but never appear in "Add or
remove programs" — shows you the evidence, and deletes nothing without your
approval.**

Caches, model files, Python environments, updater leftovers, unused CLIs…
It is hard to know which ones are safe to remove. CLICleaner decides from
markers observed on disk, not from guesses.

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
- Press `Ctrl+C` in the terminal to stop. You do not have to delete anything.

---

## If you use AI coding tools

> **New to AI tools** — installing your first agent or model? This section is
> for you. You can be a senior developer and still be new to AI tooling.

AI coding tools download a lot in the background: model files, GPU libraries,
Python environments, package caches, agent sessions and skills. They never
appear in "Add or remove programs", and it is hard to tell what can be
regenerated and what is **your data**.

| What is on the AI side? | What CLICleaner does |
|---|---|
| Agent sessions, skills, memory | **Keeps them.** User value; never produces a delete target. |
| Model files | **Keeps them.** Only unusable GPU leftovers become candidates; CPU models stay. |
| GPU libraries | A candidate only when proven unused; otherwise untouched. |
| Python / conda environments | **Reports** old or idle ones; project-bound environments are kept. |
| Package caches | Safe candidate because they can be downloaded again. |
| Unused CLI tools | Produces a removal **plan**; never removes anything on its own. |

### Plain-language glossary

| Term | What it means |
|---|---|
| **Cache** | Files that can be downloaded again; deleting them recreates them. |
| **Model** | The big file that is the AI's "brain"; re-downloading can be gigabytes. |
| **Environment** | An isolated install of a project's Python packages. |
| **Agent session / skill** | Chat history and learned skills — **your data**. |

> Rule: **agent data, skills and models are never deleted automatically.** Only
> reproducible caches and parts proven unusable become candidates.

---

## What it finds — and what it leaves alone

**Finds (shows as candidates):**

| Category | Examples |
|---|---|
| Package caches | npm, NuGet, conda, uv |
| Interpreter environments | `.venv`, conda environments |
| Model stores | ONNX / GGUF files |
| GPU leftovers | unused CUDA libraries |
| Updater leftovers | updater folders, old versions |
| CLI / agent leftovers | unused tools |

**Leaves alone:**

| Untouched | Why |
|---|---|
| Documents, photos, projects | never scanned |
| Application settings | only cache folders are targeted |
| Agent sessions and skills | user value |
| Virtual disks | report only |
| SDK installations | report only |

---

## Why it is safe

- **Evidence:** every decision says why it was made.
- **Two steps:** a plan first, then a written `SIL` approval. `--yes` cannot
  bypass it.
- **Recycle Bin:** default mode; undo a mistake.
- **Targeted deletion:** not the whole folder — only the safe part.
- **Local and open:** the UI runs only on this machine; no telemetry, MIT
  licensed.

---

## FAQ

**I only want to look, not delete.**
Inspect; nothing is deleted. In the terminal, `clicleaner clean --dry-run`
shows the plan only.

**Will it delete my AI agent's chats, skills or model?**
No. Agent sessions and skills count as user data. Models are kept; only GPU
leftovers proven unusable become candidates.

**I deleted something by mistake.**
Restore from the Recycle Bin: `clicleaner undo --restore`.

**Can I disable a standalone tool without deleting it?**
Yes. Quarantine it: use the **Quarantine** button in the browser UI or
`clicleaner quarantine <ad>` in the terminal. The shim moves to the vault
(the command leaves PATH), your data stays in place, and the restore steps
are written to the vault.

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

## Installation

**Requirements:** Windows 10/11 and Node.js 22.6+ ([nodejs.org](https://nodejs.org)).
No administrator rights needed.

```bash
npx clicleaner              # try without installing
npm install -g clicleaner   # install globally
clicleaner                  # open the browser UI
```

Run from source:

```bash
git clone https://github.com/omer-denen/CLICleaner.git
cd CLICleaner
npm install
npm start
```

**Uninstall:** `npm uninstall -g clicleaner`.
Tool data lives under `%LOCALAPPDATA%\clicleaner` (logs, scan cache, backup
vault); it is safe to delete.

| Problem | Fix |
|---|---|
| Browser did not open | Paste the `http://localhost:<port>` address from the terminal |
| "Invalid token" | A new token is generated on every start; close the old tab |
| Terminal UI looks broken | Use a real terminal (PowerShell / Windows Terminal) |
| Non-Windows system | Only Windows is supported for now |

---

## Usage

```bash
clicleaner                     # browser UI (recommended)
clicleaner scan                # scan and list in the terminal
clicleaner clean --dry-run     # show the plan only, delete nothing
clicleaner clean               # two-step confirmation + Recycle Bin
clicleaner undo --restore      # restore from the Recycle Bin
clicleaner repair --dry-run    # show broken / partial installations
clicleaner repair              # repair (ONAR confirmation; live output)
clicleaner quarantine <ad>     # move a standalone tool to the vault (KARANTINA confirmation)
clicleaner ui --tui            # terminal UI (optional)
```

For more: `clicleaner help`

---

## License

MIT — see [LICENSE](LICENSE).

CLICleaner never sends data anywhere; the UI runs only on your machine.
The deletion decision always belongs to you.
