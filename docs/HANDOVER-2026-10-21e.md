# Devir belgesi — 21.10.2026 · 2.2.0 arayüz (M2: Projeler)

> **Konum:** `C:\Users\Code\source\repos\residue-cleaner`
> **Durum:** M2 tamam; çalışma ağacı bu belgeyle birlikte commit edildi.
> **Sürüm:** npm'de yayınlanan **2.1.0**; 2.2.0 geliştirmede
> (`CHANGELOG` → `[Unreleased]`, `package.json` hâlâ 2.1.0).
> **Test:** `npm test` **84/84**, typecheck (src + web) temiz,
> `build:web` **95.05 KB gzip** JS + 3.36 KB gzip CSS.
>
> Önceki belge: `docs/HANDOVER-2026-10-21d.md` (M0 + M1).

---

## 1. Oturumun talebi

Kullanıcı: **"kaldığımız yerden devam edelim."** `AGENTS.md` sıradaki iş:
**T44 / D4 — M2: Projeler ekranı** (`/api/projects/discover` + analiz;
report-only, tarif, git güvenliği).

Bağlayıcı kurallar (önceki oturumlardan):

1. Tarayıcı **yalnızca istek** gönderir; karar, filtre, sıralama, sayım ve
   onay ifadesi **Karar Motoru**'ndan gelir.
2. Proje kaynağı **asla hedef değildir**; yalnız yeniden üretilebilir
   klasörler (artifact) raporlanır.
3. Silme/plan yürütme kullanıcı onayı olmadan yapılmaz; M2 kapsamı
   **salt okunur**.

---

## 2. Motor ve sözleşme

### 2.1 Yeni motor sınıfları — `src/core/project-view.ts` (saf TS)

| Sınıf | Sorumluluk |
|---|---|
| `ProjectList` | Arama (ad/yol/işaret/lockfile), sekme filtresi (`all`/`artifacts`/`git`/`agent`), sıralama (`recent`/`name`), sekme sayımları, özet (`total`, `visible`, `withArtifacts`, `git`, `agentWorkspace`, `lockfile`). |
| `ProjectAnalysis` | `ProjectArtifact` → `ProjectArtifactView` (boyut, gerçekçi boyut, lockfile + hash, kurulum/doğrulama komutu, riskler); `ProjectPlan` → `ProjectPlanView` (plana giren/engellenen/uyarılar); özet toplamları. |

- Node builtin importu **yok**; `contract.ts` ve `project-deps.ts` yalnız
  **tip** olarak import edilir. Kabuk sınırı testi geçer.
- Arayüz bu sınıfların ürettiği kimlik + sayıları gösterir; kendi
  filtresini/sıralamasını/toplamını üretmez.

### 2.2 Keşif ve servis

- `core/project-discovery.ts`:
  - `describeProject(dir)` — tek klasörün proje kimliği (marker, git, ajan
    alanı, artifact adları, lockfile, son etkinlik).
  - `suggestProjectRoots()` — çalışma dizini + ev dizini; yalnız var olan
    dizinler, en fazla 5.
- `ProjectService`:
  - Kök doğrulama: mutlak yol, var olan dizin, en fazla 5, tekrarsız.
  - **60 sn keşif önbelleği**; `refresh=1` ile atlanır (kullanıcı "Tara").
  - `discover()` artık `ProjectList` görünümü döndürür.
  - `analyze()` görünüm döndürür; var olmayan yol **404**.
  - `plan()` 15 dk TTL'li tarif planı; `restore()` yalnız kurulum çalıştırır.
  - `restore()` onayı artık `ApprovalRules.matches('projectRestore', ...)`.

### 2.3 Onay dili

`ApprovalKind` listesine **`projectRestore` = `KUR`** eklendi. Servisteki
sabit `PROJECT_RESTORE_PHRASE` artık `ApprovalRules.phrase('projectRestore')`
üzerinden gelir. Arayüzde bu ifade **henüz kullanılmıyor** (M4/M5).

### 2.4 Sözleşme (`src/core/contract.ts`)

Yeni tipler:

- `ProjectTab`, `ProjectSort`, `ProjectListSummaryView`,
  `ProjectListResponse` (keşif + `counts` + `summary` + `generatedAt`)
- `ProjectRootsResponse`
- `ProjectArtifactView`, `ProjectPlannedArtifactView`,
  `ProjectBlockedArtifactView`, `ProjectPlanView`, `ProjectSummaryView`
- `ProjectAnalysisResponse`, `ProjectPlanResponse`, `ProjectRestoreResponse`

---

## 3. API

| Uç | Davranış |
|---|---|
| `GET /api/projects/roots` | Önerilen kökler + `maxDepth` + `maxProjects` (salt okunur). |
| `GET /api/projects/discover` | `roots` (çoklu), `maxDepth`, `maxProjects`, `text`, `tab`, `sort`, `refresh`. Kesif + **motor filtresi/sayımı** döner. |
| `GET /api/projects?path=` | Tek proje analizi: artifact + lockfile hash + tarif + plan engelleri. Salt okunur. |
| `POST /api/projects/plan` | (Mevcut) 15 dk TTL'li tarif planı; arayüzde kullanılmıyor. |
| `POST /api/projects/restore` | (Mevcut) `KUR` yazılı onayıyla tarifi çalıştırır; arayüzde yok. |

Güvenlik: istemci yalnız **okunacak** kök/proje yolu gönderir; bu yollar
silme hedefi üretmez. Silme planı hâlâ yalnız `/api/plan` + kasa akışıdır.

---

## 4. Arayüz — `web/src/screens/Projects.tsx`

- **Kök düzenleyici:** satır başına klasör; "Projeleri bul" 60 sn
  önbelleğini atlar. Önerilen kökler `/api/projects/roots`'tan gelir.
- **Motor özeti:** toplam, bağımlılığı olan, Git, ajan alanı; `truncated`
  ve okunamayan yol sayısı.
- **Liste:** arama, sekmeler (Tümü / Bağımlılıklı / Git / Ajan alanı),
  sıralama (son etkinlik / ad); satırda ad, yol, işaretler, lockfile,
  artifact rozetleri, son etkinlik.
- **Rapor paneli:**
  - "Proje kaynağı hiçbir zaman hedef değildir" bandı.
  - 6 kutu özet (artifact, toplam, gerçekçi, yeniden üretilebilir, tracked,
    risk).
  - Tarif planı (plana giren, engellenen, toplam, gerçekçi) + uyarılar +
    engel gerekçeleri.
  - Her artifact: yol, ekosistem, paket yöneticisi, boyut / gerçekçi boyut,
    yaş, lockfile + kısa hash, kurulum ve doğrulama komutu, riskler,
    `tracked` / `patches` / `localDeps` rozetleri.
- **SALT OKUNUR:** hiçbir düğme silme, taşıma, plan yürütme veya tarif
  çalıştırma çağrısı yapmaz.
- TR/EN tam; `styles.css`'e proje listesi/detay stilleri eklendi
  (1240 px altında tek sütun, 820 px altında dar satır).

---

## 5. Doğrulama

```powershell
npm run typecheck     # src + web temiz
npm test              # 84/84
npm run build:web     # 315.60 KB JS / 95.05 KB gzip; 15.08 KB CSS
```

### 5.1 API smoke (gerçek sunucu, `:4411`)

- `GET /api/projects/roots` → 200; `residue-cleaner` + `C:\Users\Code`.
- `discover` (`repos`, maxDepth 2) → **7 ms**, 3 proje, 3 Git, 1 artifact.
- `tab=git&text=residue` → 1 proje.
- `analyze` (`residue-cleaner`) → **565 ms**, 1 artifact (82.2 MB),
  lockfile hash `20b33783ba64…`, `npm ci`; `regenerable=false`
  ("son 3 günde kullanılmış") → plan engelli.
- Cerez: `GET /` → `residue_token` HttpOnly; aynı çerezle API 200.

### 5.2 Gerçek tarayıcı (Edge headless + CDP, 1600×1000)

- 4 proje (3 gerçek + sentetik `legacy-shop`), özet **4 / 2 / 3 / 0**.
- Arama "legacy" → 1 satır.
- Detay: `npm ci`, `npm ls --depth=0`, hash `1bc9ff890885…`,
  "lockfile git tarafından izlenmiyor" riski, plan 1 / engel 0.
- Git sekmesi → 3 satır; TR/EN geçişi çalışıyor; **konsol hatası yok**.
- Ekran görüntüleri: `scratch/m2-projects-desktop.png`,
  `scratch/m2-projects-list.png`, `scratch/m2-project-detail.png`.
- Sentetik proje: `%TEMP%\opencode\m2-fixtures\legacy-shop` (30 gün eski
  mtime). **Gerçek silme/taşıma yapılmadı.**

### 5.3 Testler eklenenler

- `tests/project-view.test.ts` — 7 test: sekme sayımı/filtre, arama
  kapsamı, sıralama + özet, bozuk sekme/sıralama, artifact tarifi/hash,
  plan + özet toplamları.
- `tests/approval.test.ts` — `projectRestore` (`KUR`) testi.
- `tests/api.test.ts` — `/api/projects/roots`, filtre/sayım/özet,
  bilinmeyen proje 404.

---

## 6. Kararlar

1. **M2 salt okunur kaldı.** Proje ekranında plan/restore yürütme yok;
   `projects/plan` ve `projects/restore` uçları hazır ama M4/M5'e bırakıldı.
   Profil A ("emeğini koruyan proje sahibi") için doğru varsayılan: önce
   tarif + hash göster, hiçbir şeyi değiştirme.
2. **Filtre/sıralama/sayım sunucuda.** Arayüz her değişiklikte
   `/api/projects/discover` çağırır; 60 sn önbellek sayesinde yazarken
   disk yeniden taranmaz.
3. **Keşif önbelleği 60 sn.** `refresh=1` yalnız "Projeleri bul" düğmesinde
   ve ilk açılışta gönderilir.
4. **`ProjectAnalysis.plan` = `recipe` modu.** Bu mod yalnız yeniden
   üretilebilir artifact'ları plana alır; riskli olanlar gerekçesiyle
   engellenir. Kasa modu arayüzde sunulmadı (yanıltıcı olurdu; yürütme yok).
5. **Proje adı/marker verisi motordan gelir; çeviri arayüzde.** Motor
   metin üretmez (riskler hariç; onlar kanıt metnidir).

---

## 7. Açık riskler

1. **Analiz süresi:** `analyzeProject` her artifact için `where.exe` ve
   `--version` çalıştırır; büyük monorepo'da birkaç saniye sürebilir.
   Arayüzde yalnız "inceleniyor…" var; ilerleme/iptal yok.
2. **`projects/restore` arayüzde yok.** Uç, yazılı `KUR` ile kurulum
   çalıştırır; gelecekte arayüze bağlanırken net bir "yalnız kurulum,
   silme yok" uyarısı ve ilerleme göstergesi gerekir (şu an SSE yok).
3. **Keşif önbelleği tek girdi.** Son kök kümesi tutulur; başka bir köke
   geçince önceki önbellek düşer. Bu bilinçli (bellek sınırı).
4. **Ajan alanı işareti** yalnız kökte `SKILL.md`, `.skill-lock.json` veya
   `skills/*/SKILL.md` ile belirlenir; derin ajan klasörleri keşifte
   listelenmez (M2 kapsamı).
5. **M3–M5 yok:** Araçlar/PATH/Env/Graf, Planlar/Ayarlar, cila/yayın.
6. **T54** (eski CLICleaner kalıntıları) planlı; uygulanmadı.
7. GitHub Release `v2.1.0` hâlâ elle açılmalı (`gh` CLI yok).

---

## 8. Sıradaki adımlar

1. **M3 — Araçlar + PATH/Env + Graf:** kanal bazlı envanter, graf engeli
   gerekçesi, env planı yedek gösterimi; `contract.ts` tipleri zaten hazır.
2. **M4 — Planlar/Zamanlama + Ayarlar + Güncelleme:** `PLANLA` kuralı,
   yalnız kasaya taşıma.
3. **M5 — Cila + yayın:** klavye-only tur, a11y, headless smoke, `npx`.
4. Sonra T30 → T37 → T41 arayüzü → **T54** (kullanıcı onayıyla).

---

## 9. Dosya haritası (bu oturum)

| Dosya | Değişiklik |
|---|---|
| `src/core/project-view.ts` | **YENİ** — `ProjectList`, `ProjectAnalysis` |
| `src/core/project-discovery.ts` | `describeProject`, `suggestProjectRoots` |
| `src/services/project-service.ts` | Kök doğrulama, 60 sn önbellek, görünümler, 404, `KUR` onayı |
| `src/core/contract.ts` | Proje listesi/analiz/plan/restore tipleri |
| `src/core/approval.ts` | `projectRestore` (`KUR`) |
| `src/web/server.ts` | `/api/projects/roots`, discover filtre parametreleri |
| `web/src/screens/Projects.tsx` | **YENİ** — Projeler ekranı |
| `web/src/App.tsx` | Projeler rotası + tam genişlik |
| `web/src/api.ts` | `projectRoots`, `discoverProjects`, `projectAnalysis` |
| `web/src/i18n.ts` | TR/EN proje metinleri |
| `web/src/styles.css` | Proje listesi/detay stilleri |
| `tests/project-view.test.ts` | **YENİ** — 7 test |
| `tests/approval.test.ts` | `KUR` onay testi |
| `tests/api.test.ts` | Roots/filtre/404 testleri |
| `docs/T44-PLAN.md`, `CHANGELOG.md`, `AGENTS.md`, `state.json` | Durum güncellemesi |
