import type {
  DashboardDetailId,
  DashboardDetailRow,
  DashboardDetailView,
  DashboardTarget,
} from './contract.ts';
import type { CommandShadow, EnvFinding, EnvFindingKind } from './env-engine.ts';

/**
 * KART DETAYLARI — "altindaki liste"nin satirlari.
 *
 * Genel Bakis'taki risk kartlari birer INDEKStir; detayi ayni sayfada
 * asagidaki listede gorunur. Bu modul her kart icin detay satirlarini
 * uretir: hangi kart secilirse secilsin, o kartin satirlari hazirdir.
 *
 * Satirlar MOTORUN metnidir (kullanici verisi + gerekce). Arayuz yalnizca
 * basar; hangi kartin secildigini bilir, satirlari hesaplamaz.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */

export interface DashboardDetailItem {
  id: string;
  label: string;
  value: string;
  tone?: 'default' | 'warn' | 'danger';
}

export interface DashboardDetailsInput {
  /** Ortam bulgulari (env analizi yoksa null). */
  envFindings: EnvFinding[] | null;
  /** Golgede kalan komutlar (env analizi yoksa null). */
  commandShadows: CommandShadow[] | null;
  /** Bozuk kurulumlu araclar (envanter yoksa null). */
  brokenTools: DashboardDetailItem[] | null;
  /** Kopuk bagimlilik kenarlari (graf yoksa null). */
  brokenEdges: DashboardDetailItem[] | null;
  /** Yarim kalan islemler. */
  interrupted: DashboardDetailItem[];
  /** Suresi dolmus kasa ogeleri. */
  expiredVault: DashboardDetailItem[];
  /** Kacirilan ve zamani gelen planlar. */
  schedules: DashboardDetailItem[];
}

export class DashboardDetails {
  private readonly input: DashboardDetailsInput;

  constructor(input: DashboardDetailsInput) {
    this.input = input;
  }

  /**
   * Yol bulgulari: sol = yol, sag = gerekce.
   * (`variable` alani her zaman "Path" oldugu icin kullanilamaz.)
   */
  private static pathRows(findings: EnvFinding[]): DashboardDetailRow[] {
    return findings.map((f) => ({
      label: f.value,
      value: f.reason,
      tone: f.severity === 'warning' ? ('warn' as const) : ('default' as const),
    }));
  }

  /** Yetim degiskenler: sol = degisken adi, sag = gerekce. */
  private static varRows(findings: EnvFinding[]): DashboardDetailRow[] {
    return findings.map((f) => ({
      label: f.variable,
      value: f.reason,
      tone: f.severity === 'warning' ? ('warn' as const) : ('default' as const),
    }));
  }

  /** Golgede kalan komutlar: sol = komut adi, sag = kim gizliyor. */
  private static commandRows(shadows: CommandShadow[]): DashboardDetailRow[] {
    return shadows.map((s) => ({
      label: s.command,
      value: `${s.winner} → ${s.shadowed.join(', ')}`,
      tone: 'warn' as const,
    }));
  }

  private static items(rows: DashboardDetailItem[]): DashboardDetailRow[] {
    return rows.map((r) => ({ label: r.label, value: r.value, tone: r.tone ?? 'default' }));
  }

  private static view(
    id: DashboardDetailId,
    rows: DashboardDetailRow[],
    target: DashboardTarget | null,
  ): DashboardDetailView {
    return { id, rows, target };
  }

  /** Tum kart detaylari. Sira sabit: kart sirasiyla eslesir. */
  views(): DashboardDetailView[] {
    const out: DashboardDetailView[] = [];
    const env = this.input.envFindings;

    out.push(DashboardDetails.view('scan', [], 'disk'));

    const of = (kinds: EnvFindingKind[]): EnvFinding[] =>
      (env ?? []).filter((f) => kinds.includes(f.kind));

    out.push(
      DashboardDetails.view(
        'paths',
        DashboardDetails.pathRows(of(['missing-path', 'duplicate-path'])),
        'env',
      ),
    );
    out.push(
      DashboardDetails.view('vars', DashboardDetails.varRows(of(['orphan-variable'])), 'env'),
    );
    const shadows = this.input.commandShadows;
    out.push(
      DashboardDetails.view(
        'commands',
        shadows ? DashboardDetails.commandRows(shadows) : [],
        'env',
      ),
    );

    if (this.input.brokenTools) {
      out.push(
        DashboardDetails.view('installs', DashboardDetails.items(this.input.brokenTools), 'tools'),
      );
    }

    if (this.input.brokenEdges) {
      out.push(
        DashboardDetails.view('deps', DashboardDetails.items(this.input.brokenEdges), 'graph'),
      );
    }

    out.push(
      DashboardDetails.view('recover', DashboardDetails.items(this.input.interrupted), null),
    );
    out.push(
      DashboardDetails.view('vault', DashboardDetails.items(this.input.expiredVault), 'vault'),
    );
    out.push(
      DashboardDetails.view('schedules', DashboardDetails.items(this.input.schedules), 'schedules'),
    );

    return out;
  }
}
