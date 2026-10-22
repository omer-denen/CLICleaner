# HANDOVER — 22.10.2026 (b) · sıralı fix oturumu

**Sürüm:** `0.3.0-alpha.0` (npm'e yayınlanmadı)
**Dal:** `main` · **Çalışma ağacı:** temiz (commit'ler aşağıda)
**Kaynak belge:** `docs/residue-cleaner-analiz-ve-promptlar.md` (kullanıcı)
**Plan + doğrulama:** `docs/ANALYSIS-FIX-PLAN-2026-10-22.md`

---

## 1. Bu oturumda ne yapıldı

Kullanıcı talebi: *"sıralı fix işlemleri için oturumu başlat"* + *"proje içine
eklediğim residue-cleaner-analiz-ve-promptlar.md dosyasını oku, buna göre
fix'leri güncelle"*. Analiz belgesindeki sıra uygulandı: **P1 → P3 → P2 → P4**.
P1, P3, P2 tamamlandı; **P4 açık**.

| Faz | Görev | Commit | Test |
|---|---|---|---|
| P1 — yanlış silme riski | T70 | `40c9b89` | +19 |
| P3 — keşif ve koruma | T71 | `231a5f5` | +16 |
| P2 — ölçüm doğruluğu | T72 | bu commit | +9 |

**Toplam:** `npm test` **123 → 167**; `npm run typecheck` temiz.

---

## 2. P1 — yanlış silme riski (T70)

| Bulgu | Düzeltme |
|---|---|
| C1 log satırı tek başına `runtime-pool` | Log dalı kaldırıldı; yapısal kanıt zorunlu (`envs`, `runtimed`, `pyvenv.cfg`, `site-packages`) |
| C2 her `onnxruntime*.dll` = `cuda-runtime` | `ORT_DLL_RE` yalnız `cuda` / `tensorrt` / `trt` sağlayıcıları |
| C3 `models` adı model-store kanıtı | `MODEL_MARKERS`'tan çıktı; `probeModelDir` içerik arar (2 seviye, sınırlı) |
| C4/E9 sohbet dizinleri kanıtsız hedef | `probeChatDir` → `chat-dir:<ad>`; `buildSensitiveTargets` yalnız kanıtlı dizin |
| C5 `Device: CPU` GPU kanıtını veto ediyor | `logGpuVerdict()`: olumlu GPU sinyali vetoyu kaldırır |
| C6 512 KB üstü log atlanıyor, küçükte ilk 400 satır | Dosya sonundan 64 KB / son 400 satır (`readFileTail`) |
| E1 bozuk `extensions.json` → tüm uzantılar artık | `readExtensionManifest` → `{list, ok}`; bozuksa yalnız `.obsolete` |
| E2 model-store proje/ajan korumasından önce | `!probe.projectManifest && !agentWorkspace` |
| E3 iç içe alt parça | `dropNestedSubParts()` (dış olan kalır) |

## 3. P3 — keşif ve koruma (T71)

| Bulgu | Düzeltme |
|---|---|
| D1 `--env temp` tüm LocalAppData | `temp`/`vdisk` dar keşif; `temp` yalnız `%TEMP%` |
| D2 `lean` + `exclude: ['Temp']` çelişkisi | `Temp` dislaması kaldırıldı (yorumla belgelendi) |
| D3 vdisk keşfedilmiyordu | `findVirtualDiskDirs()`: `Packages\*\LocalState` + `wsl\*` içinde `.vhd/.vhdx`; `virtual-disk` → hedef yok |
| D5 `audit` vaadi kodda yok | `Profile.readOnly` + `ClassifyOptions.readOnly`; motor hedefi sıfırlar |
| D6 `isOwnDataPath` normalize etmiyordu | `normalizeForCompare`: eğik çizgi, `\\?\`, `..`, `realpath` (junction/8.3), küçük harf, sınır |
| D7 ters yön koruma yok | `filterProtectedTargets()` + `classifyPath` hedef süzgeci |
| D8 kimlik klasörleri aday | `PROTECTED_DOT` + `isProtectedUserPath()`; keşif + `classifyPath` + `guard.ts` |
| D9 keşif hataları sessiz | `listDirs → {names, denied, missing, links}`; `DiscoveryResult.warnings/skipped`; `stats.denied` gerçekten artıyor |
| D10 roaming koruması | Eklendi |
| D11 ölü yardımcılar | `exists`, `sortTargets`, `ownerlessName` kaldırıldı |
| D12 veri dizini adı | Doğrulandı, değişiklik yok |
| **D4** | **Bilinçli kapsam dışı**: `pkgcache/agent/runtime` hâlâ aynı aday kümesini genişletir; ayrımı sınıflandırma yapar. Profil bazlı dar keşif tasarım işidir. |

## 4. P2 — ölçüm doğruluğu (T72)

| Bulgu | Düzeltme |
|---|---|
| W1 "en büyük N" değil "ilk N" | Liste doluyken en küçük kayıt çıkarılır |
| W2 `ino` Number'a yuvarlanıyor | `stat(..., { bigint: true })`. **Ölçüm:** 2052 dizin, 518'inde hassasiyet kaybı, 1 gerçek çakışma |
| W3 ilerleme dosya başına | 100 ms zaman kısıtı + tur sonu zorunlu bildirim |
| W4 hardlink çift sayım | `nlink > 1` + `dev:ino`; tekrar bayt `hardlinkedBytes` |
| W5 ENOENT dışı hatalar `gone` | `reason: 'error'` + `code` |
| W6 klasör içi sıralı stat | 32'lik gruplarla sınırlı paralel `stat` |
| E4 tahmin ≠ hedef | `temp` 3 gün / `runtime` 90 gün kırılımı; `os-user-data`/`unknown` → 0; `reclaimableBytes = hedef toplamı` |
| E8 aynı dizin çok kez | `MeasureCache` (yol → tek promise) |

**Gerçek doğrulama:** repo `node_modules` → 7615 dosya / 82.226.567 bayt,
PowerShell `Length` toplamıyla birebir aynı, 139 ms.

---

## 5. Açık iş — P4 (T73)

`docs/residue-cleaner-analiz-ve-promptlar.md` Prompt 4. **Önce kodda doğrula.**
Beklenen maddeler (doğrulama durumu: yapılmadı):

- **C7** `probeLogs`: `catch` içindeki ikinci `readdir` try dışında; yedek dalda
  `logs\` öneki yanlış; `LOG_DIR_RE` `daemon.log`'u `logs` dizini sanıyor.
- **C8** ölü kanıt yolları: `pyvenv.cfg` dizin dalında (`n === 'pyvenv.cfg'`),
  `'venv'` fileKind hiç üretilmiyor, `PYENV_MARKERS` içindeki `Scripts`
  büyük harfli (dizin adı küçük harfle karşılaştırılıyor).
- **C9** `sdkInstall` tek dizinle yetiniyor; `hasSdkMarker` kullanılmıyor.
- **C10** `deepProbe` dizin sırası belirsiz; erken çıkış dedupe edilmemiş
  `fileKinds`'e bakıyor.
- **C11** kaynakta ürün adı/özel kalıp (`Azure AI Foundry`) ve yorumlarda
  uygulama adları.
- **E6** `findDirsNamed`/`findDirsContaining` sınırda sessiz duruyor;
  `compareVersions` ön sürüm ekleri; `detectAppVersionOrphans` en yüksek
  sürümü "güncel" sayıyor.
- **E7** `isTempPath` / `rootScope` `startsWith` (sınır yok: `Temp2`,
  `C:\Users\Omer2`).
- **E10** ölü kod: `editor-workspace` hiç üretilmiyor, 3b/7 tekrarı,
  `GPU_STATE` global, `C:\Windows\System32` sabit yolu.
- **E11** `LOG_MARKERS.means` metnine bağlı regex'ler.

**Sıra:** C7–C10 → E6/E7 → E10 → E11. Tek prompt = tek commit;
her düzeltme için test; sonra `npm run typecheck` + `npm test`.

---

## 6. Bilinen riskler / notlar

- **Yayın yok.** Sürüm `0.3.0-alpha.0`; npm/tag yok. Kullanıcı kararı.
- **Kasa:** 6 küme / 5.5 GB kasada (önceki oturum), geri alınabilir.
- **`state.json` + `AGENTS.md` + `SESSION_LOG.md` gitignore'da** (yerel takip).
- **Test tuzağı:** fixture kökü `%TEMP%` altında olursa `isTempPath` her yolu
  `temp-scratch` yapar. Sınıflandırma testleri depo içindeki `scratch/`
  kullanır; `tests/walker-measurement.test.ts` bilinçli olarak `%TEMP%`
  kullanır (temp hedefi testi).
- **PowerShell ile dosya yazma:** K13 kuralı; düzenlemeler `edit`/`write` ile.
- **K15:** `ui --web` yeniden başlatmadan önce eski süreci kapat. Bu oturumda
  sunucu başlatılmadı; arayüz değişmedi.

---

## 7. Hızlı dosya haritası

| Dosya | İş |
|---|---|
| `docs/ANALYSIS-FIX-PLAN-2026-10-22.md` | Faz sırası, doğrulama tablosu, kabul testleri, faz sonuçları |
| `docs/residue-cleaner-analiz-ve-promptlar.md` | Kaynak analiz (kullanıcı) |
| `src/core/classifier.ts` | `ORT_DLL_RE`, `probeModelDir`, `probeChatDir`, log sonu okuma |
| `src/core/analyze.ts` | Archetype sırası, `logGpuVerdict`, `dropNestedSubParts`, `MeasureCache`, `readOnly`, hedef süzgeci |
| `src/core/walker.ts` | bigint inode, top-N, hardlink, hata sınıfı, 32'lik paralel stat, yaş kırılımı |
| `src/core/discover.ts` | Normalize kasa koruması, kimlik klasörleri, dar temp/vdisk keşfi, `warnings`/`skipped` |
| `src/commands/scan.ts` | `readOnly`, keşif `skipped`/`warnings`, uyarı günlüğü |
| `src/actions/guard.ts` | Kimlik klasörü reddi |
| `tests/classification-guards.test.ts` | P1 (19 test) |
| `tests/discovery-guards.test.ts` | P3 (16 test) |
| `tests/walker-measurement.test.ts` | P2 (9 test) |

---

## 8. Doğrulama komutları

```powershell
cd C:\Users\Code\source\repos\residue-cleaner
npm run typecheck          # src + web
npm test                   # 167/167
npm run build:web          # arayüz değişmedi; gerekmez (yayın öncesi çalışır)
```
