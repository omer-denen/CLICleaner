import type {
  ProjectAnalysisResponse,
  ProjectArtifactView,
  ProjectCandidateView,
  ProjectListSummaryView,
  ProjectPlanView,
  ProjectSort,
  ProjectSummaryView,
  ProjectTab,
} from './contract.ts';
import type { ProjectArtifact, ProjectPlan } from './project-deps.ts';

/**
 * PROJE GORUNUMU — karar motorunun saf katmani.
 *
 * Iki sorumluluk ayri siniflarda:
 *   - `ProjectList`     : kesif sonucunun filtresi, siralamasi, sayimlari.
 *   - `ProjectAnalysis` : artifact/plan gorunumu ve ozet sayilar.
 *
 * Tarayici yalnizca bu siniflarin urettigi kimlik + sayilari gosterir.
 * Bu dosyada node builtin importu YOKTUR.
 */

export interface ProjectListQuery {
  text?: string;
  tab?: ProjectTab;
  sort?: ProjectSort;
}

export interface ProjectListView {
  projects: ProjectCandidateView[];
  counts: Record<ProjectTab, number>;
  summary: ProjectListSummaryView;
  text: string;
  tab: ProjectTab;
  sort: ProjectSort;
}

const TABS: readonly ProjectTab[] = ['all', 'artifacts', 'git', 'agent'];

function asTab(value: string | undefined): ProjectTab {
  return TABS.includes(value as ProjectTab) ? (value as ProjectTab) : 'all';
}

function asSort(value: string | undefined): ProjectSort {
  return value === 'name' ? 'name' : 'recent';
}

function inTab(project: ProjectCandidateView, tab: ProjectTab): boolean {
  switch (tab) {
    case 'artifacts':
      return project.artifacts.length > 0;
    case 'git':
      return project.git;
    case 'agent':
      return project.agentWorkspace;
    case 'all':
      return true;
  }
}

function haystack(project: ProjectCandidateView): string {
  return [
    project.name,
    project.root,
    project.markers.join(' '),
    project.lockfile ?? '',
    project.artifacts.join(' '),
  ]
    .join('\n')
    .toLowerCase();
}

function compareProjects(
  a: ProjectCandidateView,
  b: ProjectCandidateView,
  sort: ProjectSort,
): number {
  if (sort === 'name') return a.name.localeCompare(b.name, 'tr');
  return (
    (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0) || a.name.localeCompare(b.name, 'tr')
  );
}

export class ProjectList {
  private readonly projects: readonly ProjectCandidateView[];

  constructor(projects: readonly ProjectCandidateView[]) {
    this.projects = projects;
  }

  /** Sekme sayimlari: her sekmede kac proje gorunur. */
  counts(): Record<ProjectTab, number> {
    const counts: Record<ProjectTab, number> = { all: 0, artifacts: 0, git: 0, agent: 0 };
    for (const project of this.projects) {
      for (const tab of TABS) {
        if (inTab(project, tab)) counts[tab]++;
      }
    }
    return counts;
  }

  /** Toplamlar filtre ONCESI tum kesif sonucundan gelir. */
  summary(visible: number): ProjectListSummaryView {
    return {
      total: this.projects.length,
      visible,
      withArtifacts: this.projects.filter((p) => p.artifacts.length > 0).length,
      git: this.projects.filter((p) => p.git).length,
      agentWorkspace: this.projects.filter((p) => p.agentWorkspace).length,
      lockfile: this.projects.filter((p) => p.lockfile !== null).length,
    };
  }

  view(query: ProjectListQuery = {}): ProjectListView {
    const tab = asTab(query.tab);
    const sort = asSort(query.sort);
    const text = (query.text ?? '').trim();
    const needle = text.toLowerCase();
    const filtered = this.projects.filter(
      (project) =>
        inTab(project, tab) && (needle.length === 0 || haystack(project).includes(needle)),
    );
    const projects = [...filtered].sort((a, b) => compareProjects(a, b, sort));
    return {
      projects,
      counts: this.counts(),
      summary: this.summary(projects.length),
      text,
      tab,
      sort,
    };
  }
}

export interface ProjectAnalysisInput {
  root: string;
  name: string;
  markers: string[];
  git: boolean;
  agentWorkspace: boolean;
  artifacts: ProjectArtifact[];
  plan: ProjectPlan;
}

export class ProjectAnalysis {
  static artifact(artifact: ProjectArtifact): ProjectArtifactView {
    return {
      artifactPath: artifact.artifactPath,
      artifactName: artifact.artifactName,
      ecosystem: artifact.ecosystem,
      packageManager: artifact.packageManager,
      manifest: artifact.manifest,
      lockfile: artifact.lockfile,
      lockfileHash: artifact.lockfileHash,
      monorepo: artifact.monorepo,
      patches: artifact.patches,
      localDeps: artifact.localDeps,
      lockfileTracked: artifact.lockfileTracked,
      artifactTracked: artifact.artifactTracked,
      runtimeInstalled: artifact.runtimeInstalled,
      runtime: artifact.runtime,
      recentlyActive: artifact.recentlyActive,
      idleDays: artifact.idleDays,
      bytes: artifact.bytes,
      realisticBytes: artifact.realisticBytes,
      regenerable: artifact.regenerable,
      risks: [...artifact.risks],
      installCommand: artifact.recipe.installCommand,
      verifyCommand: artifact.recipe.verifyCommand,
    };
  }

  static plan(plan: ProjectPlan): ProjectPlanView {
    return {
      mode: plan.mode,
      planned: plan.projects.map((p) => ({
        artifactPath: p.artifactPath,
        bytes: p.bytes,
        realisticBytes: p.realisticBytes,
        regenerable: p.regenerable,
      })),
      blocked: plan.blocked.map((b) => ({
        artifactPath: b.artifactPath,
        reason: b.reason,
      })),
      warnings: [...plan.warnings],
      totalBytes: plan.totalBytes,
      realisticBytes: plan.realisticBytes,
    };
  }

  static summary(artifacts: readonly ProjectArtifactView[]): ProjectSummaryView {
    let totalBytes = 0;
    let realisticBytes = 0;
    let regenerable = 0;
    let tracked = 0;
    let risks = 0;
    for (const artifact of artifacts) {
      totalBytes += artifact.bytes;
      realisticBytes += artifact.realisticBytes;
      if (artifact.regenerable) regenerable++;
      if (artifact.artifactTracked) tracked++;
      risks += artifact.risks.length;
    }
    return {
      artifacts: artifacts.length,
      regenerable,
      tracked,
      risks,
      totalBytes,
      realisticBytes,
    };
  }

  static view(input: ProjectAnalysisInput): ProjectAnalysisResponse {
    const artifacts = input.artifacts.map((artifact) => ProjectAnalysis.artifact(artifact));
    return {
      root: input.root,
      name: input.name,
      markers: [...input.markers],
      git: input.git,
      agentWorkspace: input.agentWorkspace,
      artifacts,
      plan: ProjectAnalysis.plan(input.plan),
      summary: ProjectAnalysis.summary(artifacts),
    };
  }
}
