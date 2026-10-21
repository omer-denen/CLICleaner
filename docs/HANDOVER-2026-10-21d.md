# Devir belgesi — 21.10.2026 · 2.2.0 arayüz (M0 + M1)

> **Konum:** `C:\Users\Code\source\repos\residue-cleaner`
> **Durum:** Çalışma ağacı **temiz**; `main` = `origin/main` = `6c03712`.
> **Sürüm:** npm'de yayınlanan **2.1.0**; 2.2.0 geliştirmede
> (`CHANGELOG` → `[Unreleased]`, `package.json` hâlâ 2.1.0).
> **Test:** `npm test` **77/77**, typecheck (src + web) temiz,
> `build:web` ~**92 KB gzip**. Paket: 110 dosya, 1.2 MB açılmış,
> `dist/web` dahil.
>
> Önceki belge: `docs/HANDOVER-2026-10-21c.md` (2.1 motor genişlemesi).

---

## 1. Bu oturumun talepleri

1. **M1 onayı:** "onaylıyorum" → Disk → Plan → Onay → Kasa dikey dilimi.
2. **Kabuk ilkesi:** "web tarafını sadece request olarak kullan; kararı
   Karar Motoru verir." Web **kabuktur**; tarama, plan, yürütme, geri
   yükleme ve kalıcı silme çekirdekte/sunucuda.
3. **Dil düzeltmesi:** "plan içinde sil, silmeyi ifade ediyor; kasaya
   taşımak için TASI/AKTAR gibi ifadeler kullanman gerekmiyor mu?"
4. **Onay UX'i:** Yazılı onayda hata mesajı yerine düğme **pasif/aktif**
   olsun.
5. **Eski CLICleaner kalıntıları:** hemen değil, **plana al** (T54).

---

## 2. Oturumda yapılanlar

### 2.1 M0 — arayüz temeli (önceki dilim)

- `web/` React 19 + Vite + TypeScript; çıktı `dist/web`.
- `residue ui --web`: statik kabuk + API; `--no-browser`, `--port`.
- `GET /` yanıtında `HttpOnly + SameSite=Strict` token çerezi; URL'de
  token yok. `residue api` başsız kalır.
- `core/dashboard-summary.ts` + `GET /api/dashboard`; ağır tarama yok.
- `core/project-discovery.ts` + `GET /api/projects/discover` (salt okunur).
- Genel Bakış ekranı yalnız `/api/dashboard` tüketir; TR/EN; 3 sütun.

### 2.2 M1 — motor / API

- **`core/disk-view.ts`**: `ClusterQuery` (filtre/sıralama),
  `SelectionScope` (seçim kapsamı), `DefaultSelection` (varsayılan),
  `ScanSummary` (sayım) tek görünümde.
- `GET /api/disk`: `text/kind/category/sort/triaj/selected` →
  `DiskViewResponse`; seçim özeti yalnız **plana alınabilen** kümeleri
  sayar. `counts`, `categories`, `totals`, `defaultSelectedKeys`,
  `selectableKeys`, `plannableKeys`.
- `GET /api/cluster?key=`: kanıt paneli için tek küme ayrıntısı.
- `PlanResponse`: `approvalKind` (`vaultMove` | `delete`) + `phrase`;
  `PlannedClusterView.bytes`.
- `VaultListResponse.purgePhrase`.
- Onay ifadeleri **moda bağlı**:
  - **`TASI`** — kasaya taşıma (`recycle`, geri alınabilir)
  - **`SIL`** — kalıcı silme (`purge`)
  - **`BOŞALT`** — kasa boşaltma
  - (`ONAR`, `KARANTINA` değişmedi.)
- `delete-service` + `confirm.ts` (CLI) moda göre ifade seçer; CLI metni
  "kasaya taşınacak" / "silinecek" olarak ayrılır.
- **Kabuk sınırı testi** (`tests/shell-boundary.test.ts`): `web/src`
  Node builtin'i, servis/aksiyon katmanını veya çekirdek karar sınıflarını
  import edemez. Yalnız `contract.ts` ve saf `approval.ts` paylaşılır.

### 2.3 M1 — arayüz

- **Disk:** `@tanstack/react-virtual` sanal liste; canlı SSE tarama
  (ilerleme, bulunan, duraklat/devam/iptal); env/profile/minAge; kind
  sekmeleri, kategori, sıralama, triaj, arama; seçim çubuğu
  (varsayılan/görünen/temizle/plan); sağda kanıt paneli (hedefler,
  parçalar, işaretler, gerekçe, ön koşullar).
- **Plan/Onay:** risk satırları, plandan çıkarma (yeni plan isteği),
  yazılı `TASI`, yüksek risk işaretleme; yürütme SSE ile canlı; sonuç.
  **Düğme**, `ApprovalRules.matches(plan.approvalKind, input)` ve yüksek
  risk işareti sağlanmadan **pasif**. Sunucu yine doğrular.
- **Kasa:** geri yükleme (`rename` çakışma), seçili öğeleri kalıcı silme
  (`BOŞALT` yazılmadan düğme pasif), saklama günü, çakışma rozeti.
- Genel Bakış 3 sütun; Disk/Plan/Kasa tam genişlik; TR/EN tam.

---

## 3. Gerçek tarayıcı doğrulaması (ego-browser)

- Disk: **108 küme**, **16 sanal satır**; sayımlar 12 önerilen /
  89 doğrulama / 7 rapor; varsayılan **6 seçili / 5.5 GB / 6 hedef**;
  `.nuget` kanıt paneli (10 GB, 5 hedef).
- Plan: 6 küme / 5.5 GB; düşük riskte "ek yazılı onay gerekmiyor".
- Orta riskli plan (`runt-nightly`, 6 GB): **TASI duvarı**.
  - Boş / `SIL` / `tasi` → düğme **pasif**
  - `TASI` → **aktif**
  - Yanlış ifade sunucuya zorla gönderilirse:
    `Onay metni hatali ("TASI" bekleniyordu)`; **hiçbir silme olmadı**.
- Kasa: boş durum; toplam 0 B; saklama 30 gün.
- **Gerçek silme yapılmadı.** Ekran görüntüleri:
  `C:\Users\Code\AppData\Local\Temp\opencode\residue-m1-*.png`.
- Ego task space: **id 1**, page `p1` (`residue web ui test 20261021`).
  Oturum sonunda sayfa **Plan** ekranında; ifade alanında testten kalan
  `yanlis` var, düğme bu yüzden pasif.

---

## 4. Git ve yayın durumu

| Commit | İçerik |
|---|---|
| `1ee2684` | 2.2.0 M0: arayüz temeli |
| `45a7f9f` | M0: TR/EN etiket, sayı biçimi, a11y |
| `c9d1a50` | M1: disk-view + onay ifadeleri (API) |
| `164e7be` | M1: Disk/Plan/Kasa arayüzü |
| `6c03712` | M1: `TASI` / `SIL` ayrımı + düğme bağlama |

- `main` → `origin/main` güncel; çalışma ağacı temiz.
- npm'de yayınlanan sürüm **2.1.0**; 2.2.0 **yayınlanmadı**.
- **GitHub Release `v2.1.0` sayfası hâlâ elle açılmalı** (`gh` yok;
  başlık = tag adı; AGENTS.md 17).

---

## 5. Açık işler / riskler

1. **M2–M5 yok.** Sıradaki: M2 Projeler, M3 Araçlar + PATH/env + Graf,
   M4 Planlar/Ayarlar, M5 cila + 2.2.0 yayını.
2. **Kasa dolu durumu** gerçek veriyle test edilmedi (motor testleri var).
3. **Disk ekranında proje kökü taraması yok** (M2).
4. **Plan TTL (10 dk)** için ekranda geri sayım yok; süre dolunca sunucu
   410 döner.
5. **`clean --purge` yol modu** hâlâ doğrudan yol siliyor (B12; 3.0 önerisi).
6. **T54 — eski CLICleaner kalıntıları** (planlı, uygulanmadı):
   - `C:\Users\Code\source\repos\CLICleaner` boş/kilitli duruyor.
   - `%LOCALAPPDATA%\clicleaner` **yok**.
   - npm `clicleaner@1.0.0` **deprecate** (mesaj doğru).
   - GitHub `omer-denen/CLICleaner` yeni repoya yönleniyor.
   - `src/core/data-dir.ts`, `discover.ts`, `guard.ts`, testlerdeki eski ad
     **koruma amaçlı**; silinmez. Tarihsel `docs/HANDOVER-*` korunur.
7. **`scripts/init-state.ts` bayat şablon:** yalnız 10 görev üretir; çalıştı-
   rılırsa `state.json`'u ezer. `npm run init-state` kullanma.
8. **Sunucu oturumluktur:** şu an 4399'da bir süreç var (pid oturuma
   bağlı). Yeni oturumda yeniden başlat.
9. **Model ağırlıkları / T30 / T37** hâlâ planlı; T41 ekranı T44 kapsamında.

---

## 6. Sonraki oturum — başlangıç

```powershell
cd C:\Users\Code\source\repos\residue-cleaner
git status --short
git log --oneline -3
npm run typecheck
npm test
npm run build:web
node bin/residue.mjs ui --web --port 4399
```

- Arayüz: `http://127.0.0.1:4399/` (çerez otomatik; URL'de token yok).
- Başsız API: `residue api --port 4321` (token çıktıda).
- `residue ui` → Ink terminal arayüzü.

### M2 — Projeler (sıradaki dilim)

**Motor hazır:** `GET /api/projects/discover?roots=...&maxDepth=...` ve
`GET /api/projects?path=...`; `core/project-discovery.ts`,
`core/project-deps.ts`.

**Yapılacak:**

1. **Projeler ekranı** (tam genişlik):
   - Kök yolları: `meta.cwd` varsayılan; kullanıcı ek kök ekleyebilir.
   - Keşif sonucu kartlar: ad, kök, işaretler (git/package.json/…),
     lockfile, artifact adları, son etkinlik, ajan alanı.
   - Karta tıkla → `GET /api/projects?path=` ile analiz (tembel).
2. **Proje detayı:** artifact tablosu (boyut, yeniden üretilebilirlik,
   güven, lockfile hash), tarif (`npm ci` …), git güvenliği, ajan alanı
   (`keep`), "rapor-only" rozeti. **Silme düğmesi yok.**
3. **Test:** keşif/analiz motor testleri zaten var; tarayıcıda gerçek repo
   ile smoke (ör. `C:\Users\Code\source\repos\residue-cleaner`).
4. **Kabul:** source asla hedef değil; tarif + hash görünür; ajan alanı
   "korunuyor"; arayüz hesap yapmıyor.

**Sonra:** M3 (Araçlar + PATH/env + Graf), M4 (Planlar/Ayarlar), M5
(a11y, performans, headless smoke, `prepublishOnly`, 2.2.0).

---

## 7. Önemli dosyalar

| Konu | Dosya |
|---|---|
| Arayüz kabuğu | `web/src/App.tsx`, `web/src/api.ts`, `web/src/i18n.ts`, `web/src/styles.css` |
| Ekranlar | `web/src/screens/Dashboard.tsx`, `Disk.tsx`, `PlanScreen.tsx`, `Vault.tsx` |
| SSE | `web/src/sse.ts` |
| Disk motoru | `src/core/disk-view.ts` |
| Özet / keşif | `src/core/dashboard-summary.ts`, `src/core/project-discovery.ts` |
| Onay | `src/core/approval.ts`, `src/services/delete-service.ts`, `src/actions/confirm.ts` |
| API | `src/web/server.ts`, `src/core/contract.ts` |
| Plan | `docs/T44-PLAN.md` |
| Motor durumu | `docs/ENGINE-ROADMAP.md` |
| Önceki devir | `docs/HANDOVER-2026-10-21c.md` |
| İç kayıtlar | `state.json`, `SESSION_LOG.md`, `AGENTS.md` (git dışı) |
