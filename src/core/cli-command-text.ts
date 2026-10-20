import type { CliTool } from './cli-inventory-types.ts';

/**
 * CLI KOMUT METINLERI.
 *
 * Kaldirma sonrasi geri kurulum komutu paket yoneticisine gore degisir.
 * Bu kural tek yerde yasar; hem kasa manifesti (RESTORE.md) hem web
 * arayuzu ayni metni uretir.
 *
 * Bu modul SAF TypeScript'tir: node builtin importu YOKTUR.
 */

export type ReinstallableTool = Pick<CliTool, 'source' | 'packageName' | 'version'>;

export class CliCommandText {
  /**
   * Aracin paket yoneticisiyle yeniden kurulum komutu.
   *
   * `null` = paket yoneticisi yok (standalone); cagiran taraf kendi
   * aciklamasini gosterir.
   */
  static reinstall(tool: ReinstallableTool): string | null {
    const v = tool.version;
    switch (tool.source) {
      case 'npm-global':
        return `npm install -g ${tool.packageName}${v ? `@${v}` : ''}`;
      case 'uv-tool':
        return `uv tool install ${tool.packageName}${v ? `==${v}` : ''}`;
      case 'dotnet-tool':
        return `dotnet tool install --global ${tool.packageName}${v ? ` --version ${v}` : ''}`;
      case 'pip-user':
        return `python -m pip install ${tool.packageName}${v ? `==${v}` : ''}`;
      case 'standalone':
      default:
        return null;
    }
  }
}
