# Devir belgesi — 21.10.2026 · 2.2.0 arayüz (M3: Araçlar + PATH/Env + Graf)

> **Konum:** `C:\Users\Code\source\repos\residue-cleaner`
> **Durum:** M3 tamam; çalışma ağacı bu belgeyle birlikte commit edildi.
> **Sürüm:** npm'de yayınlanan **2.1.0**; 2.2.0 geliştirmede
> (`CHANGELOG` → `[Unreleased]`, `package.json` hâlâ 2.1.0).
> **Test:** `npm test` **89/89**, typecheck (src + web) temiz,
> `build:web` **104.58 KB gzip** JS + 3.99 KB gzip CSS.
>
> Önceki belge: `docs/HANDOVER-2026-10-21e.md` (M2).

---

## 1. Oturumun talebi

Kullanıcı: **"devam edelim"** + "görünüme ve tasarıma dikkat edelim,
hizalama gibi işlemlere". `AGENTS.md` sıradaki iş:
**T44 / D4 — M3: Araçlar + PATH/Env + Graf** (kanal bazlı envanter; graf
engeli gerekçeli; env planı yedek gösterir).

Bağlayıcı kurallar:

1. Tarayıcı yalnız **istek** gönderir; filtre, sıralama, sayım ve onay
   ifadesi **Karar Motoru**'ndan gelir.
2. Yazma işlemleri iki aşamalıdır: plan → yazılı onay. Env'de ayrıca
   **uygulamadan önce yedek** alınır.
3. Gerçek tarayıcı doğrulaması **ego-browser** ile (kural 19).

---

## 2. Motor ve sözleşme

### 2.1 `src/core/cli-view.ts` (yeni, saf TS)

`CliView` tek sorumluluk: envanter listesi görünümü.

- Durum filtresi: `all` / `unused` / `recent` / `unknown` / `protected`.
- Kaynak filtresi: `all` / `npm-global` / `uv-tool` / `dotnet-tool` /
  `pip-user` / `standalone`.
- Arama: komut, paket, sürüm, kurulum yolu, shim, durum klasörü, kanıt.
- Sıralama: `status` (atıl → bilinmiyor → yakında → korunan, sonra boyut),
  `size`, `idle`, `name`.
- Çıktı: filtrelenmiş araçlar, `counts`, `sources` (kanal sayısı + bayt),
  `summary` (`unusedBytes`, `totalBytes`, `removable`, `broken`, ...),
  `selectableIds` (yalnız görünen + kaldırılabilir), filtre yankısı.
- Arayüz hesap yapmaz.

### 2.2 Arama düzeltmesi

`toLocaleLowerCase('tr-TR')` büyük `I` harfini `ı` yaptığı için `UV-CLI`
aramıyordu. Arama ve Windows yol karşılaştırmaları `toLowerCase()`'a
çevrildi (`cli-view`, `project-view`, `project-discovery`, `project-service`).
Regresyon testi `tests/cli-view.test.ts` içinde.

### 2.3 Onay dili

- `ApprovalRules` türüne **`envClean` = `TEMIZLE`** eklendi.
- `env-engine` artık `ENV_CLEAN_PHRASE` ve doğrulamayı `ApprovalRules`'tan
  alır (büyük/küçük harf duyarlı; baş/son boşluk yok sayılır).
- CLI kaldırma planı `delete` (`SIL`) kullanır; yanıt artık ifadeyi taşır.

### 2.4 Sözleşme (`src/core/contract.ts`)

Yeni: `CliStatusFilter`, `CliSourceFilter`, `CliSort`, `CliViewCounts`,
`CliSourceStat`, `CliViewSummary`, `CliViewFilter`, `CliViewResponse`;
`EnvPlanResponse`; `GraphNodeView`, `GraphViewResponse`,
`GraphWhatIfResponse`.

Değişen: `CliPlanResponse` → `phrase` + `approvalKind: 'delete'`;
`CliPlanItemView` → `totalBytes`; `CliTool` dışa aktarıldı.

---

## 3. API

| Uç | Davranış |
|---|---|
| `GET /api/cli/view` | Son envanterden motor filtreli liste. Envanter yoksa **`null`** (ağır tarama yok). `text/status/source/sort`. |
| `POST /api/cli/inventory` | SSE envanter (zaten vardı); `GET /api/cli/view` için önbellek üretir. |
| `POST /api/cli/plan` | `phrase: SIL`, `approvalKind: delete`; bağımlılık engeli + yedek boyutu. |
| `POST /api/cli/execute` | `SIL` doğrulanır; gerçek kaldırma (test edilmedi). |
| `GET /api/env` | Salt okunur analiz: bulgular, PATH girdileri, yetim değişken, gölge. |
| `POST /api/env/plan` | `phrase: TEMIZLE`, `approvalKind: envClean`; değişiklikler + `requiresAdmin`. |
| `POST /api/env/apply` | `TEMIZLE` + yedek yazımı + doğrulama; sonuçta `backupFile` ve hatalar. |
| `GET /api/graph` | Envanterden graf görünümü (gerekirse `ensure()`). |
| `POST /api/graph/what-if` | Düğüm eşleşmesi + `allowed` / `blocked` / `brokenEdges` / `isolated`. |

---

## 4. Arayüz

### 4.1 Araçlar — `web/src/screens/Tools.tsx`

- SSE envanter: canlı bulunan sayısı, son komut, iptal; bitince
  `/api/cli/view` çağrılır (envanter yoksa "Henüz envanter yok" + tarama).
- Atıl eşiği (varsayılan 21 gün), durum sekmeleri (sayaçlı), kanal,
  sıralama, arama (hepsi sunucuda), seçim çubuğu.
- Yoğun liste: komut + paket@versiyon, kanal, durum, atıllık, boyut,
  bozuk/gölgede/korunan rozetleri. Sağda kanıt paneli: kurulum yolu,
  kanıt, shimler, durum klasörleri, kaldırma/yeniden kurma komutu,
  referanslar, çoklu kurulum.
- Kaldırma planı: satırlar, toplam/yedek, manuel, engellenen (gerekçe +
  bağımlılar), `SIL` duvarı. **Gerçek kaldırma test edilmedi.**

### 4.2 PATH & Ortam — `web/src/screens/Env.tsx`

- Bulgular: tür, kapsam, değişken, değer, gerekçe.
- PATH girdileri: kapsam, indeks, yol, `sağlam` / `diskte yok` / `tekrar` /
  `gölgede`.
- Yetim değişkenler ve gölgede kalan komutlar.
- Plan: kapsam (kullanıcı/sistem/ikisi), eksik/tekrar seçenekleri;
  öncesi/sonrası, uyarılar, `requiresAdmin`, **yedek notu**, `TEMIZLE`
  duvarı; sonuçta yedek dosyası ve hatalar.
- **Gerçek yazma test edilmedi.**

### 4.3 Graf — `web/src/screens/Graph.tsx`

- 6 özet kutusu (düğüm/kenar/kopuk/gölgede/döngü/kritik).
- Kök nedenler, döngüler, düğüm tablosu (tür/rol/seviye/yol/etkin/korumalı),
  kenar tablosu (kaynak/hedef/tür/güç/durum).
- What-if: sorgu → eşleşen düğümler, `allowed`, `blocked` (gerekçe +
  bağımlılar), kopacak kenarlar, yalıtılacak düğümler.
- Dar ekranda "What-if" düğmesi paneline kaydırır.

### 4.4 Hizalama cilası

- Araç satırı kolonları: `26px / minmax(0,1fr) / 92 / 104 / 64 / 80 / 80`;
  komut kolonu 1024 px görünümde **262 px**; `browser-use@0.13.8` kırpılmıyor.
- Satır yüksekliği 44 px; durum etiketi "Yakında" kısaltıldı; atıllık
  değerleri tam sayı gösteriliyor.

---

## 5. Doğrulama

```powershell
npm run typecheck     # src + web temiz
npm test              # 89/89
npm run build:web     # 361.37 KB JS / 104.58 KB gzip; 19.94 KB CSS
```

### 5.1 API smoke (gerçek sunucu, `:4399`)

- Envanter: **14 araç**; 1 çoklu kurulum, 1 shim sorunu, 2 PATH gölgesi.
- `GET /api/cli/view`: 6 ms; `unused=2`, `protected=2`, `removable=10`,
  kaynaklar: npm 6 / uv 3 / dotnet 3 / standalone 2; atıl 391 MB.
- `GET /api/env`: 34 bulgu, 33 PATH girdisi, 30 gölge, 0 yetim.
- `POST /api/env/plan`: 1 değişiklik, `TEMIZLE`, `requiresAdmin=false`.
- `GET /api/graph`: 68 düğüm, 65 kenar; 17 gölgeli, 1 kritik.
- `POST /api/graph/what-if` `opencode2`: **1 engelli**, 4 bağımlı
  (`opencode.cmd/ps1/opencode/opencode.exe`), 1 kopacak kenar.

### 5.2 Ego-browser (space 4)

- **Araçlar:** 14 araç, 2 atıl, 391 MB; `browser` detayı (şimler, kanıt,
  zamanlanmış görev referansı); `SIL` kaldırma planı (198 MB).
- **PATH & Ortam:** 34 bulgu, plan 1 değişiklik, yedek notu.
- **Graf:** 68 düğüm/65 kenar; `opencode2` what-if → **Engellenen 1**,
  "4 sert/aktif bağımlılık bu öğeye ihtiyaç duyuyor", bağımlılar listesi.
- **Gerçek kaldırma/uygulama yapılmadı.**
- Görseller: `scratch/ego-m3-tools-aligned.png`,
  `scratch/ego-m3-tool-detail-aligned.png`,
  `scratch/ego-m3-removal-plan.png`, `scratch/ego-m3-env.png`,
  `scratch/ego-m3-env-plan.png`, `scratch/ego-m3-graph.png`,
  `scratch/ego-m3-graph-whatif.png`.

### 5.3 Testler

- `tests/cli-view.test.ts` — 4 test: durum sayım/filtre, kaynak/arama/
  sıralama, kaynak istatistiği + filtre yankısı, bilinmeyen filtre.
- `tests/approval.test.ts` — `envClean` (`TEMIZLE`) testi.
- `tests/api.test.ts` — `GET /api/cli/view` boş envanter; env planı ifadesi.
- Toplam **89/89**.

---

## 6. Kararlar

1. **Araçlar listesi motor filtreli.** `/api/cli/view` son envanteri
   kullanır; her filtre değişiminde disk taranmaz. Envanter yoksa `null`.
2. **Araç kaldırma iki aşamalı.** Plan + `SIL`; paket yöneticisinin kendi
   `uninstall` komutu. Bağımlılık grafiği engelliyorsa satır plana girmez.
3. **Env yazımı yalnız yedek + `TEMIZLE`.** Plan öncesi/sonrası gösterilir;
   `requiresAdmin` açıkça uyarılır. `TEMIZLE` artık büyük/küçük harf duyarlı.
4. **Graf what-if kararı motorda.** Arayüz yalnız `allowed/blocked`
   sonucunu ve gerekçeyi gösterir.
5. **Gerçek yazma testleri yapılmadı.** Bu oturumda hiçbir araç
   kaldırılmadı, hiçbir PATH değeri yazılmadı.

---

## 7. Açık riskler

1. **M4–M5 yok:** Planlar/Zamanlama, Ayarlar, Güncelleme, cila/yayın.
2. **Araç onarım/karantina** uçları hazır ama arayüzde yok.
3. **Gerçek kaldırma/Env apply** test edilmedi; yönetici hakkı ve gerçek
   registry yazımı doğrulanmadı.
4. **Graf sanallaştırma yok;** 68 düğümde sorun yok, binlerce düğümde
   gerekir.
5. **T54** (eski CLICleaner kalıntıları) planlı; uygulanmadı.
6. GitHub Release `v2.1.0` hâlâ elle.
7. Sunucu `:4399` oturumluk; yeni oturumda yeniden başlatılmalı.

---

## 8. Sıradaki adımlar

1. **M4 — Planlar/Zamanlama + Ayarlar + Güncelleme:** `schedules*`,
   `settings`, `update`; kural oluşturma `PLANLA`; yalnız kasaya taşıma.
2. **M5 — Cila + yayın:** klavye-only tur, a11y, headless smoke, `npx`.
3. Sonra T30 → T37 → T41 arayüzü → **T54** (kullanıcı onayıyla).

---

## 9. Dosya haritası (bu oturum)

| Dosya | Değişiklik |
|---|---|
| `src/core/cli-view.ts` | **YENİ** — `CliView` |
| `src/core/contract.ts` | CLI view/env plan/graf tipleri; `SIL`/`TEMIZLE` |
| `src/core/approval.ts` | `envClean` (`TEMIZLE`) |
| `src/core/env-engine.ts` | Onay ifadesi `ApprovalRules`'tan |
| `src/core/project-view.ts`, `project-discovery.ts` | Arama/yol `toLowerCase()` |
| `src/services/project-service.ts` | Yol karşılaştırması |
| `src/services/cli-removal-service.ts` | `phrase` + `approvalKind` + `totalBytes` |
| `src/services/env-service.ts` | `EnvPlanResponse` + ifade |
| `src/services/graph-service.ts` | Sözleşme tipleri |
| `src/web/server.ts` | `GET /api/cli/view` |
| `web/src/screens/Tools.tsx`, `Env.tsx`, `Graph.tsx` | **YENİ** |
| `web/src/App.tsx` | Rotalar + geniş ekranlar |
| `web/src/api.ts` | CLI/env/graf istemcileri |
| `web/src/i18n.ts`, `labels.ts`, `styles.css` | TR/EN + etiketler + stiller |
| `tests/cli-view.test.ts` | **YENİ** — 4 test |
| `tests/approval.test.ts`, `tests/api.test.ts` | `TEMIZLE`, CLI view |
| `docs/T44-PLAN.md`, `CHANGELOG.md`, `AGENTS.md`, `state.json` | Durum güncellemesi |
