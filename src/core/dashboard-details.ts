import type {
  DashboardDetailId,
  DashboardDetailKind,
  DashboardDetailRow,
  DashboardDetailTextId,
  DashboardDetailView,
  DashboardTarget,
} from './contract.ts';
import type { CommandShadow, EnvFinding, EnvFindingKind } from './env-engine.ts';
import type { Cluster } from './types.ts';

/**
 * KART DETAYLARI — "altindaki liste"nin satirlari.
 *
 * Genel Bakis'taki risk kartlari birer INDEKStir; detayi ayni sayfada
 * asagidaki listede gorunur. Bu modul her kart icin detay satirlarini
 * uretir: hangi kart secilirse secilsin, o kartin satirlari hazirdir.
 *
 * Satirlar kullanici verisini (yol, komut, ad) ve sabit metinler icin
 * **kimlik** tasir; metin TR/EN olarak `web/src/i18n.ts` icinde uretilir.
 * Arayuz yalnizca basar; hangi kartin secildigini bilir, satirlari hesaplamaz.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */

export interface DashboardDetailItem {
  id: string;
  label: string;
  value: string;
  labelId?: DashboardDetailTextId;
  valueId?: DashboardDetailTextId;
  amount?: number;
  valueKind?: 'bytes' | 'count';
  tone?: 'default' | 'warn' | 'danger';
}

export interface DashboardDetailsInput {
  /** Tum kumeler: Korunan / Geri kazanilabilir defterlerinin satirlari. */
  clusters: Cluster[];
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
  /** Kasadaki TUM ogeler (defter detayi). */
  vaultItems: DashboardDetailItem[];
  /** Kurulu CLI araclari; envanter hic taranmadiysa null. */
  cliItems: DashboardDetailItem[] | null;
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
      // Sabit gerekce metni arayuzde cevrilir; `reason` CLI icin korunur.
      valueId: f.kind,
      tone: f.severity === 'warning' ? ('warn' as const) : ('default' as const),
    }));
  }

  /** Yetim degiskenler: sol = degisken adi, sag = gerekce. */
  private static varRows(findings: EnvFinding[]): DashboardDetailRow[] {
    return findings.map((f) => ({
      label: f.variable,
      value: f.reason,
      valueId: f.kind,
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

  /**
   * Korunan defteri: her kümenin geri kazanilamayan kismi.
   * Satir toplami `protected` defteriyle ayni buyuklugu verir.
   */
  private static protectedRows(clusters: Cluster[]): DashboardDetailRow[] {
    return clusters
      .map((c) => ({
        label: c.title,
        amount: Math.max(0, c.totalBytes - c.reclaimableBytes),
      }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .map((r) => ({
        label: r.label,
        value: '',
        valueKind: 'bytes' as const,
        amount: r.amount,
      }));
  }

  /** Geri kazanilabilir defteri: her kümenin hedeflenebilir kismi. */
  private static reclaimableRows(clusters: Cluster[]): DashboardDetailRow[] {
    return clusters
      .filter((c) => c.reclaimableBytes > 0)
      .sort((a, b) => b.reclaimableBytes - a.reclaimableBytes)
      .map((c) => ({
        label: c.title,
        value: '',
        valueKind: 'bytes' as const,
        amount: c.reclaimableBytes,
      }));
  }

  private static items(rows: DashboardDetailItem[]): DashboardDetailRow[] {
    return rows.map((r) => ({
      label: r.label,
      value: r.value,
      labelId: r.labelId,
      valueId: r.valueId,
      amount: r.amount,
      valueKind: r.valueKind,
      tone: r.tone ?? 'default',
    }));
  }

  private static view(
    id: DashboardDetailId,
    kind: DashboardDetailKind,
    rows: DashboardDetailRow[],
    target: DashboardTarget | null,
    noteId?: DashboardDetailTextId,
  ): DashboardDetailView {
    return { id, kind, rows, noteId, target };
  }

  /** Tum kart detaylari. Sira sabit: kart sirasiyla eslesir. */
  views(): DashboardDetailView[] {
    const out: DashboardDetailView[] = [];
    const env = this.input.envFindings;

    out.push(DashboardDetails.view('scan', 'scan', [], 'disk'));

    const of = (kinds: EnvFindingKind[]): EnvFinding[] =>
      (env ?? []).filter((f) => kinds.includes(f.kind));

    out.push(
      DashboardDetails.view(
        'paths',
        'rows',
        DashboardDetails.pathRows(of(['missing-path', 'duplicate-path'])),
        'env',
      ),
    );
    out.push(
      DashboardDetails.view('vars', 'rows', DashboardDetails.varRows(of(['orphan-variable'])), 'env'),
    );
    const shadows = this.input.commandShadows;
    out.push(
      DashboardDetails.view(
        'commands',
        'rows',
        shadows ? DashboardDetails.commandRows(shadows) : [],
        'env',
      ),
    );

    if (this.input.brokenTools) {
      out.push(
        DashboardDetails.view(
          'installs',
          'rows',
          DashboardDetails.items(this.input.brokenTools),
          'tools',
        ),
      );
    }

    if (this.input.brokenEdges) {
      out.push(
        DashboardDetails.view('deps', 'rows', DashboardDetails.items(this.input.brokenEdges), 'graph'),
      );
    }

    out.push(
      DashboardDetails.view(
        'recover',
        'rows',
        DashboardDetails.items(this.input.interrupted),
        null,
      ),
    );
    out.push(
      DashboardDetails.view('vault', 'rows', DashboardDetails.items(this.input.expiredVault), 'vault'),
    );
    out.push(
      DashboardDetails.view(
        'schedules',
        'rows',
        DashboardDetails.items(this.input.schedules),
        'schedules',
      ),
    );

    // --- Defter kartlari: Korunan / Geri kazanilabilir / Kasa / Araclarda --
    out.push(
      DashboardDetails.view(
        'ledger-protected',
        'rows',
        DashboardDetails.protectedRows(this.input.clusters),
        null,
      ),
    );
    out.push(
      DashboardDetails.view(
        'ledger-reclaimable',
        'rows',
        DashboardDetails.reclaimableRows(this.input.clusters),
        null,
      ),
    );
    out.push(
      DashboardDetails.view(
        'ledger-vault',
        'rows',
        DashboardDetails.items(this.input.vaultItems),
        'vault',
      ),
    );
    out.push(
      DashboardDetails.view(
        'ledger-cli',
        'rows',
        this.input.cliItems ? DashboardDetails.items(this.input.cliItems) : [],
        'tools',
        this.input.cliItems ? undefined : 'ledger-cli-empty',
      ),
    );

    return out;
  }
}
