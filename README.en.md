# CLICleaner

![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/github/license/omer-denen/CLICleaner)
![Version](https://img.shields.io/github/v/tag/omer-denen/CLICleaner?label=version)
![npm](https://img.shields.io/npm/v/clicleaner)

[Türkçe (varsayılan)](README.md) · **English**

**A CLI cleaner that shows its evidence.** AI coding tools and developer
tooling leave CLI caches, model stores, virtual environments, sessions and
updater leftovers behind — none of them show up in the Windows "Add or remove
programs" list. CLICleaner recognises these folders
**by the evidence inside them, not by their names**: it tells you what each
folder is, what exactly deletion would cost, and why it decided that way.

> **This is not a Windows disk cleaner.** It is not a general disk cleanup,
> registry/PATH repair, "PC tune-up" or free-up-space tool. Its scope is only
> the developer and AI leftovers that Windows never lists. **Nothing is
> deleted without your approval;** the first scan only lists.

---

## Scope and limits

| It does not | Why |
|---|---|
| Touch the registry, PATH or uninstall entries | It is not general Windows maintenance; it focuses on developer and AI leftovers |
| Delete your documents, photos or projects "to free space" | Those folders are never decisions |
| Delete a folder just because of its name | Without evidence it says "unidentified" and **reports only** |
| Delete models, agent sessions or skills | That is your data; they never become delete targets |
| Delete its own data (logs, backup vault) | The tool never targets its own data directory |

It answers one question with evidence: **"What is this folder, and what happens if I delete it?"**

---

## Start in 30 seconds

1. Install **Node.js 22.6 or newer** → [nodejs.org](https://nodejs.org) (LTS).
2. Open **PowerShell**: Start → type `PowerShell` → open.
3. Type this and press Enter:

   ```powershell
   npx clicleaner
   ```

4. The browser opens automatically in your **system default browser**. If
   nothing opens, paste the `http://localhost:<port>` address printed in the
   terminal. Force Edge with `clicleaner ui --browser edge` or the
   `CLICLEANER_BROWSER` environment variable.
5. Press **Inspect**. While the scan runs, the left column shows the directories
   being scanned and the right column shows what is found.
6. When it finishes press **OK**, then review the list.
7. Tick what you want to delete → **Plan and confirm** → read the plan → type
   `SIL` → **Apply plan**.

The default mode moves items into the tool's own **vault**, so a wrong
decision is reversible (`clicleaner undo --restore` or the **Vault** tab in
the web UI).

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
| Files tracked by Git | version-controlled files are never deleted |
| Virtual disks | report only |
| SDK installations | report only |
| The tool's own data directory | journals and the backup vault live there |

---

## Project scan: leftovers inside your own project

To look at `node_modules`, `.venv` or `dist` inside a project, you choose the
folder to scan:

```bash
clicleaner scan --root C:\projects\myapp
```

In the browser UI: **Scan a project** → choose the folder → scan.

In this mode:

- Results are **report-only**: no delete target is ever produced.
- The `.git` folder is not scanned, and files **tracked** by Git can never be
  targeted. Only untracked or `.gitignore`d paths are considered.
- A project scan does not touch your 24-hour system scan cache.

---

## Why it is safe

- **Evidence:** every decision says why it was made; when evidence is missing
  the tool says "unidentified" and only reports.
- **Two steps:** a plan first, then a written `SIL` approval. `--yes` cannot
  bypass it.
- **Vault:** default mode; deleted items move to the tool's vault and can be restored.
- **Targeted deletion:** not the whole folder — only the safe part.
- **Git awareness:** tracked files can never be targeted; project scans are
  report-only.
- **Last line of defence:** if the delete layer is asked to remove an ancestor of
  a protected path, or the tool's own data directory, it refuses.
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

**Will it delete `node_modules` inside my project?**
A project scan (`--root`) never produces delete targets; it only reports. Files
tracked by Git are protected in every mode anyway.

**I deleted something by mistake.**
Restore from the vault: `clicleaner undo --restore` or the **Vault** tab in the web UI.

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
vault). **The tool never lists or deletes this directory in its own scans**;
because the backup vault lives there, do not delete it by hand either.

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
clicleaner scan --root .       # report project-internal leftovers only
clicleaner clean --dry-run     # show the plan only, delete nothing
clicleaner clean               # two-step confirmation + vault (reversible)
clicleaner undo --restore      # restore from the vault
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
