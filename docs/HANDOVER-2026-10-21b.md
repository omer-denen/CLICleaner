# Devir belgesi — 21.10.2026 · T43: motor/ayüz ayrımı

> Bu oturumun kapanış kaydı.
> Önceki devir: `docs/HANDOVER-2026-10-20b.md` · `docs/HANDOVER-2026-10-21.md`
> · `docs/HANDOVER-2026-10-20.md`
>
> **Tarih notu:** kayıtlar 20–21.10.2026 arasına düşüyor; tarih etiketleri
> kaymış, içerik doğru.
>
> **Bu oturumda iki kayıt dosyası `.gitignore`'dadır** (`state.json`,
> `SESSION_LOG.md`, `AGENTS.md` — makineye özel çalışma notları). Kalıcı
> kayıt `docs/` altındadır; bu belge odur.

## 1. Bu oturumun tezi

Kullanıcı talebi:

> "web tarafında sadece arayüz olmalı, liste bazlı seçim işlemleri yaptığımız
> için cli arayüzü buna uygun değil. cli bir motor olarak çalışacak, web
> bunu gösterecek."

Ve ardından:

> "hepsi ayrı sınıflar şeklinde motora eklensin, tek bir godclass istemiyorum"

**Hedef:** karar mantığı **tek yerde** (çekirdekte), arayüz yalnız **gösterir**.

## 2. Denetim (başlangıç)

Motor tarafı zaten doğruydu: tarama `src/core/*`, silme `src/actions/*`,
kategori `core/categories.ts`, varsayılan seçim `core/selection.ts`,
"SIL" kuralı `delete-service.ts:104` (sunucuda tek yerde).

Ama **web'de ~190 satır iş mantığı** vardı ve motor/ayrım **üç yerden** ihlal
ediliyordu:

| # | İhlal | Nerede |
|---|---|---|
| 1 | Filtre · arama · sıralama · plan kapsamı · seçim özeti | `web/src/App.tsx` (5 blok) |
| 2 | Kanıt yorumu (deterministik metin üretimi) | `web/src/util/evidence-text.ts` |
| 3 | **CLI komutu → web'e bağımlılık** | `src/commands/clean.ts` → `src/web/scan-store.ts` |

Ayrıca servis katmanı `src/web/contract.ts`, `src/web/scan-store.ts`,
`src/web/settings-store.ts` dosyalarına bağlıydı.

## 3. Yapılanlar

### 3.1 Motor sınıfları (god class yok — her biri tek sorumluluk)

| Sınıf | Dosya | Sorumluluk |
|---|---|---|
| `ClusterQuery` | `src/core/cluster-query.ts` | liste motoru: arama, filtre, sıralama |
| `SelectionScope` | `src/core/selection-scope.ts` | seçilebilirlik, plan kapsamı, seçim özeti |
| `ScanSummary` | `src/core/scan-summary.ts` | toplamlar, karar sayaçları, risk grupları |
| `CliInventoryQuery` | `src/core/cli-inventory-query.ts` | envanter listesi, sıralama, sayaçlar |
| `FindingsQuery` | `src/core/findings-query.ts` | birleşik bulgu filtresi + özet |
| `PlanSummary` | `src/core/plan-summary.ts` | plan risk/hedef sayımları, bayt toplamları |
| `TargetMap` | `src/core/target-map.ts` | hedef ↔ parça ilişkisi, tür dağılımı |
| `EvidenceReader` | `src/core/evidence-text.ts` | deterministik kanıt yorumu |
| `DefaultSelection` | `src/core/selection.ts` | varsayılan seçim kuralı |

Hepsi **saf TS** (node builtin importu yok) → Node (CLI/TUI) ve tarayıcı
(web) aynı dosyaları paylaşıyor.

### 3.2 Katman taşımaları

| Eski | Yeni | Neden |
|---|---|---|
| `src/web/contract.ts` | `src/core/contract.ts` | sözleşme web'e özgü değil; servisler de kullanıyor |
| `src/web/scan-store.ts` | `src/store/scan-cache.ts` | kalıcı uygulama durumu; CLI de kullanıyor |
| `src/web/settings-store.ts` | `src/store/settings.ts` | kalıcı uygulama ayarları |
| `web/src/util/evidence-text.ts` | `src/core/evidence-text.ts` | alan mantığı, alan değil |

`src/web/` artık **yalnızca HTTP/SSE adaptörü**: `server.ts` + `http.ts`.

### 3.3 Web'den silinen mantık

`App.tsx` (−142 satır) · `StatusStrip` · `PlanWorkspace` · `ApprovalWall` ·
`ContextPanel` · `CliView` · `FindingsView` · `VirtualClusterList`.

Özellikle **`isSelectable` kopyası** silindi (`VirtualClusterList` kendi
kuralını yazıyordu — bakım riskiydi).

### 3.4 Ek kurallar (AGENTS.md)

- **11.** CLI = motor, web = arayüz.
- **12.** Motor tek sınıf değil, sorumluluk sınıfları — god class yazılmaz.
- **13.** `src/` → `src/web/` bağları yoktur.
- **18.** Arayüzde karar mantığı yazma.
- **K11b.** `erasableSyntaxOnly` nedeniyle TS parametre özelliği
  (`constructor(private x: T)`) kullanılamaz — açık alan + constructor
  ataması gerekir.

## 4. Doğrulama

- `scratch/test-cluster-query.ts` **52/52**
- `scratch/test-cli-query.ts` **31/31**
- `scratch/test-plan-summary.ts` **14/14**
- **39 test dosyası tamamen yeşil**
- `npm run typecheck` (kök + web) temiz · `npx vite build` başarılı
- **CDP (headless Chrome) 24/24**: durum şeridi · "Seç (20)" · triyaj
  "1 GB" (25→6 satır) · kategori filtresi (25→8) · arama (0 sonuç) ·
  "Seçili 40.9 GB · 20 küme · 37 hedef" · plan alanı (20 satır) ·
  **plan kapsamı = Seç (N)** · plandan çıkarma (20→19) · sağ panel kanıt
  yorumu · **CLI envanteri (4 kart + durum filtresi)** · **birleşik
  bulgular (122 satır; kaynak filtresi 122→14; özet 0 B)** ·
  **konsol hatası yok**

## 5. Kapanış durumu

| Konu | Durum |
|---|---|
| Commit | `a892b5b` + bu oturumun taşımaları (commit'lendi) |
| Push | **YAPILMADI** — `origin/main` hâlâ `0e30390` |
| Testler | 39/39 yeşil |
| typecheck / build | temiz |
| Çalışan ortam | API `:4321` (PID 7008) + Vite `:5173` (PID 23448) ayakta |

## 6. Bilinen sınır

`evidence-text.ts` metinleri **TR sabit** ve `t()`'den geçmiyor → EN modunda
sağ panel Türkçe gösteriyor (mevcut durum; değiştirilmedi). Kullanıcı kararı:
"metinleri core'da TR sabit tut (hızlı)". Çok dilli sürüm ayrı iş.

## 7. Sıradaki adımlar

1. **T42/D3 P6** — çila + a11y: klavye tuş haritası, odak halkaları,
   boş/kırık durumlar, `aria-live`, kontrast, açık tema (koyu varsayılan).
2. **T41 arayüz** — Ayarlar → "Güncelleme Politikası": mod seçici
   (Kapalı/Günlük/Haftalık) + "Şimdi kontrol et" + "yeni sürüm var" rozeti.
   Arka uç hazır (`src/core/update-check.ts`, `GET /api/update`).
3. **T30** — global AI araç artıkları kanıtı.
4. **T37** — yarım kalan güncelleme artıkları (gizli `.paket-rastgele`).
5. **1.1.0** yayını + **GitHub Release sayfası** elle açılacak (`gh` CLI yok;
   başlık verilmeyecek → tag adı).

## 8. Dosya haritası (bu oturumda)

**Yeni (çekirdek):** `src/core/cluster-query.ts` · `selection-scope.ts` ·
`scan-summary.ts` · `cli-inventory-query.ts` · `findings-query.ts` ·
`plan-summary.ts` · `target-map.ts` · `contract.ts` (taşındı)

**Yeni (durum):** `src/store/scan-cache.ts` · `src/store/settings.ts` (taşındı)

**Değişen:** `src/core/evidence-text.ts` (sınıfa dönüştü) ·
`src/core/selection.ts` (sınıfa dönüştü) · `src/core/findings.ts` ·
`src/ui/App.tsx` · `src/web/server.ts` · `src/services/*.ts` ·
`src/commands/clean.ts` · `web/src/App.tsx` · `web/src/components/*` (8 dosya)

**Testler:** `scratch/test-cluster-query.ts` · `scratch/test-cli-query.ts` ·
`scratch/test-plan-summary.ts` · `scratch/verify-engine-split.mjs` (CDP)
