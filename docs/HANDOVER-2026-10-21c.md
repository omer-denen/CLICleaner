# Devir belgesi — 21.10.2026 · Motor genişletmesi (2.1.0 geliştirme)

> **Konum notu:** Proje artık `C:\Users\Code\source\repos\residue-cleaner`
> altında. `C:\Users\Code\source\repos\CLICleaner` boş ve kilitli kaldı;
> içinde proje yok. Komutlar `residue ...` olarak okunmalıdır.
>
> **Durum:** Değişiklikler çalışma ağacında, **commit edilmedi**.
> Sürüm `package.json` içinde hâlâ `2.0.1`; değişiklikler `CHANGELOG.md`
> altında **Unreleased** olarak duruyor.

## 1. Bu oturumun talebi

Kullanıcı, "Residue Cleaner: Motor ve Modül Raporu"ndaki motorları mevcut
yapının üzerine eklememizi/olgunlaştırmamızı istedi. Açık kısıt:

> "Direk projeyi paylaştığım yapı ile değiştirme. Geliştir."

Yani mimari korunacak; eksik motorlar aynı titizlikle eklenecek; mevcut
davranışlar (kasa, iki aşamalı onay, terminal/API) bozulmayacak.

## 2. Özet

- 9 yeni çekirdek modül, 4 yeni servis, 1 yeni store, 6 yeni CLI komutu.
- Yeni API uçları: `/api/env*`, `/api/projects*`, `/api/graph*`,
  `/api/schedules*`, `/api/recover`.
- 56 testlik `node:test` altyapısı eklendi (`npm test`).
- Mevcut güvenlik/veri bütünlüğü hataları düzeltildi.
- Kullanıcının onayladığı eski ad temizliği yapıldı.

## 3. Yeni motorlar

### 3.1 Kanıt ağacı — `src/core/evidence-tree.ts`
- `Tool → Candidate → Claim → Evidence → Observation` zinciri.
- Gözlemler `source+key+value` ile tekilleşir, `obsId` alır.
- Duruşlar: `supports | protects | unknown`; ağırlık 0..1.
- `classifyPath()` sonucunda `Cluster.evidenceTree` doldurulur.
- Tek zayıf sinyal (ör. yalnız mtime) `unknown` sayılır.

### 3.2 Bağımlılık grafı — `src/core/dependency-graph.ts`
- Düğümler: tool, package, shim, path-entry, env-var, project,
  state-dir, shortcut, runtime, process, config.
- Kenarlar: exec, package, project-ref, env, runtime, shortcut, link,
  config; güç: hard/soft/weak; durum: intact/broken/shadowed/drifted/
  missing-chain/cyclic/unknown.
- Roller: isolated/leaf/shared/hub; seviyeler: low→critical.
- Tarjan SCC ile döngü, kopuklukları kök nedene göre gruplama.
- `whatIf()` toplu seçimde aynı kurulum grubunu muaf tutar; dışarıdan
  gelen sert+aktif bağımlılık varsa öğeyi engeller.
- `buildInventoryGraph()` CLI envanteri + PATH gölgelerinden graf kurar.
- `CliRemovalService.plan()` artık grafiği kullanır; engellenenler
  `CliPlanResponse.blocked` içinde döner.

### 3.3 Ortam değişkeni motoru — `src/core/env-engine.ts`
- HKCU/HKLM ayrı okunur; `REG_EXPAND_SZ` korunur.
- PATH: eksik dizin, tekrar, User/Machine çakışması, gölgelenen komut.
- Yetim `*_HOME` / `*_ROOT` / `*_PATH` değişkenleri.
- Hassas isimler (`*_TOKEN`, `*_KEY`, `*_SECRET`…) maskelenir; API
  görünümünde ham değer dönmez (`redactEnvironmentAnalysis`).
- Akış: plan → yedek (`%LOCALAPPDATA%\residue\env-backups`) → `reg add`
  → geri okuyup doğrula → `WM_SETTINGCHANGE`.
- `setx` kullanılmaz (1024 karakter kesmesi).
- HKLM değişikliği yönetici hakkı ister; yoksa yalnız öneri kalır.
- Yazılı onay: `TEMIZLE`.
- CLI: `residue env`, `residue env --clean`, `residue env --clean --apply`.
- API: `GET /api/env`, `POST /api/env/plan`, `POST /api/env/apply`.

### 3.4 Proje bağımlılık motoru — `src/core/project-deps.ts`
- Ekosistem: npm/pnpm/yarn/bun, Python (pip/uv/poetry/pipenv), .NET, Rust.
- Monorepo: `workspaces`, `pnpm-workspace.yaml`, turbo/nx/lerna.
- Yeniden üretilebilirlik: lockfile varlığı + SHA-256, git izleme,
  patch, yerel/özel bağımlılık, runtime kurulu mu, yakın kullanım,
  çalışan süreç.
- Tarif: ekosistem, artifact yolları, lockfile hash, runtime sürümü,
  kurulum/doğrulama komutu; kimlik bilgisi saklanmaz.
- Komutlar: `npm ci`, `pnpm install --frozen-lockfile`,
  `yarn install --immutable`, `bun install --frozen-lockfile`,
  `uv sync --frozen`, `poetry install --no-root`, `dotnet restore`,
  `cargo fetch`.
- pnpm hardlink etkisi için gerçekçi kazanç ~%10.
- `restoreProjects()` sınırlı eşzamanlılıkla kurar ve doğrular.
- CLI: `residue project [dir] [--restore]`.
- API: `GET /api/projects?path=`, `POST /api/projects/plan`,
  `POST /api/projects/restore` (onay: `KUR`).

### 3.5 Plan/zamanlama motoru — `src/core/plan-engine.ts`
- Kural sabit liste değil **seçici** saklar: kategori, max risk, idle gün,
  anahtar listesi, maksimum öğe.
- Günlük/haftalık/tek sefer; `nextRunAt`, `dueNow`, `missedRuns`.
- Planlı işlem **yalnız kasaya taşır**; `purge` ve env otomatik yok.
- `src/store/schedules.ts`: atomik `schedules.json`, 200 çalışma geçmişi,
  `plan-run.lock`.
- `src/services/schedule-service.ts`: list/oluştur/sil/önizle/çalıştır,
  kaçırılan çalışma önerisi (`catchUp`).
- CLI: `residue schedule [list|add|remove|preview|run|history|catchup]`.
- API: `/api/schedules*`.

### 3.6 Yardımcı çekirdekler
- `src/core/semver.ts` — prerelease dahil sıralama, `^ ~ >= <= > < = * x`
  aralıkları, `||`, `maxSatisfying`.
- `src/core/owner-status.ts` — active / orphaned / shared / unknown.
- `src/core/app-error.ts` — `transient | permission | conflict | missing |
  no-space | integrity | cancelled | validation | fatal`; `toBody()`,
  `shouldRetry()`.
- `src/core/operation-journal.ts` — JSONL, `pending → in-progress →
  done/failed/skipped`; `interruptedOperations()`,
  `markInterruptedOperations()`.
- `src/util/audit.ts` — `%LOCALAPPDATA%\residue\audit.log` (JSONL).

## 4. Mevcut motorlarda yapılan sertleştirme

### Kasa — `src/actions/vault.ts`
- Yeni öğeler: `<batch>/items/<id>/payload` + `meta.json`.
- Manifest atomik (`tmp + rename`); `index.json` ve manifestlerden
  yeniden oluşturma (`rebuildVaultIndex`, `loadVaultIndex`).
- Kararlı `id`: eski `batch:index` kimliği kayıyordu; artık `entry.id`.
  Eski manifestlerde `storedPath`'ten deterministik türetilir.
- Çakışma politikası: `rename` (varsayılan), `overwrite` (mevcut hedef
  `.replaced-*` olarak yedeklenir), `cancel`.
- Geri yükleme sonrası dosya sayısı/boyut doğrulaması.
- `purgeVaultItems(ids)` yalnız seçili öğeleri siler; yol kabul etmez.
- `purgeVault()` artık yalnız `b-*` ve geçerli manifestli partileri siler;
  CLI yedek/karantina klasörlerini korur.
- `expiredVaultEntries()` / `purgeExpiredVault()`.
- CLI: `residue vault [list|expired|restore|purge|index]`.

### Silme / yürütme — `src/actions/delete.ts`, `delete-service.ts`
- `D:\` sürücü kökü guard açığı kapatıldı.
- Junction/symlink ata zinciri kontrolü: reparse point üzerinden başka
  dizine giden hedef silinmez.
- Hedef yoksa `skipped` (“plan bayat”).
- Başarısız purge artık bayt/removed saymıyor.
- Journal-first: her hedef için `pending` → `in-progress` → sonuç.
- Devre kesici: art arda 5 hata veya %20 hata oranı.
- Yüksek risk onayı ve silme sonucu audit log’a yazılıyor.
- Hata olayı artık `code/retryable/dataSafe` taşıyor.

### Tarama — `walker.ts`, `commands/scan.ts`, `scan-service.ts`
- Erişilemeyen yollar `ScanResult.skipped` ve SSE `skipped` olayına akıyor;
  `denied` / `long-path` sayaçları gerçek.
- Hedef içi canlı ilerleme (`walk` → SSE `progress`).
- `pause` / `resume`: hedef sınırında duraklatma; `/api/scan/:id/pause|resume`.
- Çoklu `--root`; `--root` modunda dışlama listesi uygulanıyor.
- Tarama önbelleği sürümlü zarf + atomik yazım; eski biçim okunuyor.
- Kök inode ziyaret kümesine eklenerek junction döngüsü sertleştirildi.
- `DefaultSelection` artık yalnızca `risk=safe`.
- Kategoriler: protected / duplicate / old-version / orphan / unused /
  ai-debris / ghost-envs / unknown.
- Bulgulara `ownerStatus` ve `defaultSelected` eklendi.

### Sunucu / SSE — `web/server.ts`, `web/http.ts`
- SSE yeniden bağlanmada çalışan tarama aboneliği kopmuyor.
- 15 sn kalp atışı (yorum satırı).
- Ayarlarda `vaultRetentionDays` ve `updateCheck` artık kaydediliyor.
- Hata gövdesi geriye uyumlu `error` + `AppError` alanları.
- Açılışta yarım kalan journal’lar yalnız raporlanıyor; otomatik
  tamamlama yok.
- Metaya yeni uçlar eklendi.

### CLI envanteri — `cli-inventory.ts`
- npm global prefix artık `npm prefix -g` ile çözülüyor; `APPDATA`
  varsayımı yalnız fallback.
- Standalone shim taramasına winget / scoop / chocolatey / volta
  dizinleri eklendi (salt okunur; silme adayı değil).
- Grafik tabanlı kaldırma engeli.

## 5. Testler ve doğrulama

```powershell
cd C:\Users\Code\source\repos\residue-cleaner
npm run typecheck     # temiz
npm test              # 56/56 geçti
```

Test dosyaları (`tests/`):
- `semver.test.ts`, `dependency-graph.test.ts`, `env-engine.test.ts`,
  `project-deps.test.ts`, `plan-engine.test.ts`, `evidence-tree.test.ts`,
  `operation-journal.test.ts`, `scan-cache.test.ts`, `app-error.test.ts`,
  `safety.test.ts`, `vault.test.ts`, `api.test.ts`, `helpers.ts`.

Smoke test edilen komutlar:
`residue env --json`, `residue env --clean --json`,
`residue project . --json`, `residue graph --json`,
`residue schedule add/list`, `residue vault list --json`.

## 6. Eski ad (`clicleaner`) temizliği

Yapıldı:
- `.web-run.log`, `.web-run.err.log` silindi.
- Eski `scratch/scan-now*.json`, `report-real.md`, `web-live-check.mjs`,
  `test-root2.mjs` silindi.
- `docs/WEB-UX-PLAN.md`: `CLICLEANER_DESKTOP` / `CLICLEANER_UPDATE_URL`
  → `RESIDUE_*`.
- `AGENTS.md`: eski tarayıcı ayarı arşiv notuna çevrildi.

Bilinçli olarak kalanlar:
- `src/core/data-dir.ts`, `src/actions/guard.ts`, `src/core/discover.ts`
  içindeki eski veri dizini (`%LOCALAPPDATA%\clicleaner`) koruması.
- Tarihsel `HANDOVER-*`, `CHANGELOG`, `STATE`/`SESSION_LOG` kayıtları.
- Boş `C:\Users\Code\source\repos\CLICleaner` klasörü (kilitli; içerik yok).

## 7. Bilinen çelişkiler / açık işler

1. **`clean --purge` hâlâ doğrudan yol siliyor.** “Kalıcı silme yalnız
   kasadan” ilkesiyle çelişiyor. Geriye uyumluluk için korundu; öneri:
   3.0’da yalnız `vaultItemId` kabul eden moda geçmek.
2. **Web arayüzü yok.** 2.0.0’da kaldırıldı; yeni motorlar yalnız CLI/API.
   T44 kapsamında React/Vite yeniden yapılmalı.
3. **Kasa yerleşimi** rapordaki global `vault/items/<id>` değil;
   `vault/<batch>/items/<id>/payload` uzantısı. Eski partiler uyumlu.
4. **Proje motoru** “recipe + sil” ve “vault” modlarını planlıyor; artifact’ı
   fiilen taşımıyor/silmiyor. Üst ilke gereği doğrudan kalıcı silme eklenmedi.
5. **Plan motoru** yalnız kasa taşıma kuralını çalıştırıyor; konsolidasyon
   ve env-düzenleme eylemleri henüz bağlı değil.
6. **Worker thread ve yol+mtime boyut önbelleği yok.** Async sınırlı
   eşzamanlılık + 24 saatlik tam sonuç önbelleği var.
7. **Model ağırlıkları** varsayılan olarak korunuyor; “ayarlardan aç”
   anahtarı henüz yok.
8. **Yüksek risk override UI’ı** yok; silme tarafında audit var, CLI
   kaldırma tarafında “ad yaz + onay kutusu + override” akışı yok.
9. **winget/scoop/choco/pipx** disk taramasında silme adayı değil; CLI
   envanterinde salt okunur.
10. **Arayüz sözleşmesi** yeni tipler `contract.ts` sonunda type-only
    re-export edildi; T44’te kullanılmalı.

## 8. Sonraki oturum için önerilen başlangıç

1. Önce mevcut durumu doğrula:
   ```powershell
   cd C:\Users\Code\source\repos\residue-cleaner
   git status --short
   npm run typecheck
   npm test
   ```
2. Öncelik: **T44 web arayüzü** — yeni API’leri (`/api/env`, `/api/graph`,
   `/api/projects`, `/api/schedules`) bağla; sanal liste + SSE.
3. Ardından `purge` yol modunu kaldır; kasa öğe kimliği zorunlu olsun.
4. Disk kümelerini ve proje artifact’larını bağımlılık grafına bağla.
5. Yol+mtime boyut önbelleği + worker thread.
6. Yüksek risk override + denetim kaydı UI’ı.
7. Plan motoruna konsolidasyon ve env-düzenleme eylemleri.

Ayrıntılı eşleme: `docs/ENGINE-ROADMAP.md`.

## 9. Önemli dosyalar

| Konu | Dosya |
|---|---|
| Yeni motorlar | `src/core/evidence-tree.ts`, `dependency-graph.ts`, `env-engine.ts`, `project-deps.ts`, `plan-engine.ts`, `semver.ts`, `owner-status.ts`, `app-error.ts`, `operation-journal.ts` |
| Yeni servisler | `src/services/env-service.ts`, `project-service.ts`, `graph-service.ts`, `schedule-service.ts` |
| Yeni store | `src/store/schedules.ts` |
| Yeni komutlar | `src/commands/env.ts`, `project.ts`, `graph.ts`, `schedule.ts`, `vault.ts`, `recover.ts` |
| Kasa | `src/actions/vault.ts` |
| Silme | `src/actions/delete.ts`, `src/services/delete-service.ts` |
| Tarama | `src/commands/scan.ts`, `src/services/scan-service.ts`, `src/core/walker.ts` |
| API | `src/web/server.ts`, `src/web/http.ts`, `src/core/contract.ts` |
| Test | `tests/*.test.ts` |
| Yol haritası | `docs/ENGINE-ROADMAP.md` |
