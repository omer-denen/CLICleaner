import {
  analyzeProject,
  planProjectCleanup,
  restoreProjects,
  type ProjectArtifact,
  type ProjectCleanupMode,
} from '../core/project-deps.ts';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

/**
 * `residue project [dir]` — proje ici yeniden uretilebilir klasorler.
 *
 * Varsayilan SALT OKUNUR: analiz + tarif. `--restore` yalnizca
 * regenerable olanlari lockfile modunda yeniden kurar.
 */
export async function runProject(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const modeArg = valueOf(args, '--mode') ?? 'recipe';
  const mode: ProjectCleanupMode =
    modeArg === 'vault' || modeArg === 'cache-only' ? modeArg : 'recipe';
  const dir = args.find((a) => !a.startsWith('-') && a !== modeArg) ?? process.cwd();

  const artifacts = await analyzeProject(dir);
  const plan = planProjectCleanup(artifacts, mode);

  if (json) {
    console.log(
      JSON.stringify(
        {
          root: artifacts[0]?.projectRoot ?? dir,
          artifacts,
          plan,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n  ${C.bold}Residue — proje bagimliliklari${C.reset}\n`);
  if (artifacts.length === 0) {
    console.log(`  ${C.gray}Yeniden uretilebilir klasor bulunamadi: ${dir}${C.reset}\n`);
    return;
  }

  for (const a of artifacts) {
    const tag = a.regenerable ? `${C.green}yeniden kurulabilir${C.reset}` : `${C.yellow}riskli${C.reset}`;
    console.log(`  ${C.cyan}${a.artifactPath}${C.reset}`);
    console.log(
      `    ${a.ecosystem} · ${formatBytes(a.bytes)}` +
        (a.ecosystem === 'pnpm' ? ` (gercekci kazanc ~${formatBytes(a.realisticBytes)})` : '') +
        ` · ${tag}`,
    );
    if (a.lockfile) console.log(`    ${C.dim}lockfile: ${a.lockfile}${C.reset}`);
    if (a.recipe.installCommand) console.log(`    ${C.dim}kurulum : ${a.recipe.installCommand}${C.reset}`);
    for (const r of a.risks) console.log(`    ${C.yellow}!${C.reset} ${r}`);
    console.log('');
  }

  console.log(
    `  ${plan.projects.length} planlanabilir · ${formatBytes(plan.totalBytes)} ` +
      `(gercekci: ${formatBytes(plan.realisticBytes)})`,
  );
  if (plan.blocked.length > 0) {
    console.log(`  ${C.yellow}${plan.blocked.length} oge riskli/kanitsiz; plana alinmadi.${C.reset}`);
  }
  for (const w of plan.warnings) console.log(`  ${C.yellow}!${C.reset} ${w}`);

  if (args.includes('--restore')) {
    const recipes = plan.projects.map((p) => p.recipe);
    if (recipes.length === 0) {
      console.log('\n  Geri kurulacak uygun artifact yok.\n');
      return;
    }
    console.log(`\n  ${C.bold}Geri kurulum (${recipes.length})${C.reset}\n`);
    const results = await restoreProjects(recipes, {
      onLine: (_root, line) => process.stdout.write(`    ${line}\n`),
    });
    let ok = 0;
    for (const r of results) {
      if (r.ok) ok++;
      else console.log(`  ${C.red}!${C.reset} ${r.projectRoot}: ${r.error ?? 'basarisiz'}`);
    }
    console.log(`\n  ${ok}/${results.length} basarili\n`);
  }
}

function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function formatBytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}
