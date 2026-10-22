# OTURUM KAYDI — 21/22.10.2026 · UX denetimi ve arayüz düzeltmeleri

> Bu dosya, oturumda yapılan **her** değişikliği dosya bazında kaydeder.
> Kullanıcının **henüz uygulanmamış** talimatları ayrı bir bölümde ve
> **kendi ağzıyla** durur; sonraki oturumun iş listesi budur.
>
> **Yayın:** YOK (kullanıcı kararı: "patch çıkarma sadece çünkü bir çok yer
> daha var"). Sürüm **2.2.0**'de kaldı.
>
> **Kapsam dışı bırakılanlar (bilinçli):** Geri alma yapılmadı; kullanıcı
> "loglara işle, bir sonraki oturumda düzeltelim" dedi. Çalışma alanı bu
> haliyle duruyor, **aşağıdaki açık maddeler** sonraki oturumun işidir.

---

## 1. Oturumun başlangıç durumu

| | |
|---|---|
| Sürüm | 2.2.0 (npm'de yayında, `v2.2.0` tag'li) |
| Commit | `0d27351` (docs: 2.2.0 sonrası Graf UX devir notu) |
| Yayınlanmamış | Graf UX paketi (2.3.0 adayı) — main'de, npm'de değil |
| Testler | 107 → **114** (bu oturumda +7) |
| Sunucu | `residue ui --web --port 4411` (bu oturumda açıldı) |

**Başlangıçtaki iki sunucu tuzağı:** `4399` (önceki oturumdan kalma süreç) ve
`4411` (yeni). Ayrıntı ve kalıcı çözüm: `AGENTS.md` §3 **K15**.

---

## 2. Yapılan işler (teslim edilenler)

### 2.1 UX denetimi başlatıldı — `docs/UX-LOG.md` (yeni, 462 satır)

Sınıf bazlı UX bulgu kaydı. Sınıflar:

| Sınıf | Kapsam |
|---|---|
| **S1** Şeffaflık | Arka planda ne oluyor, sayılar neye dayanıyor |
| **S2** Anlaşılabilirlik | Etiket, terminoloji, yanlış beklenti |
| **S3** Veri sunumu | Payda, `0`/`bilinmiyor`, ham kimlik, kesilme |
| **S4** Eylem | Tıklanabilirlik, çağrı, ölü alan |
| **S5** Mizanpaj | Hizalama, sarma, hiyerarşi |
| **S6** Erişilebilirlik | Klavye, odak, kontrast |
| **S7** Düzen | Menü, panel genişliği |

Her madde: **belirti / kanıt (ölçüm) / öneri / durum**.
**36 madde** kaydedildi: 10 düzeltildi, 9 planlandı, 14 açık.

Denetim **ölçümle** yapıldı (`getBoundingClientRect`, `getComputedStyle`,
API yanıtları) — gözle tahmin yok. Örnek ölçümler: `labelH` 18.1/36.3/54.4 px,
`gridCols` 5 sütun, `verdictPanelTop 638.5`, `cluster-title scrollW 238 /
clientW 199`, `Araçlarda` DOM "0 B" ↔ API 4.025.009.588 bayt.

### 2.2 UX-001 — Tarama durumu rozeti (`ScanFreshness` ayrımı)

**Sorun:** `ScanFreshness` ("stale") iki farklı sebebi birleştiriyordu:
önbellek süresi doldu (`expired`) ve disk taramadan beri değişti (`dirty`).
Ekranda tek başına **"Eski"** yazan rozet, `dirty` durumunda "sayılar diskle
eşleşmiyor" bilgisini gizliyor, hatta *amber renk* (dikkat) ile **"sorun
değil"** çağrışımı yapıyordu. Ölçüldü: bu makinede `ageMs = 7,9 saat`,
`ttlMs = 24 saat` → `expired = false`; rozet **yalnızca `dirty` yüzünden**
"Eski" diyordu.

**Motor (yeni):** `src/core/scan-status-view.ts` (147 satır, saf TS)
- `ScanStatusView` sınıfı: `never | current | expired | dirty | dirty-expired | scanning`
- karar verdiği şeyler: `kind`, `tone`, `reasons[]` (sıralı), `rows[]` +
  **değer türü** (`timestamp | duration | bytes | count | ratio | text`), `action`

**Sözleşme:** `ScanStatusViewResponse`, `ScanStatusFacts`,
`ScanStatusResponse.view`.

**Servis:** `scan-service.ts` → `status()` artık `view` döndürüyor.

**Arayüz (yalnız basar):** `web/src/components/ScanStatus.tsx` (yeni)
- `ScanStatusChip` → `<button aria-haspopup="dialog">`
- `ScanStatusDialog` → ayrıntı raporu: durum · neden(ler) · son tarama · tarama
  yaşı · önbellek süresi · önerilen tarama · taranan küme · sürücü · disk
  toplam/boş/doluluk · **"Yeniden tara"** · odak tuzağı · `Esc` → odağı
  rozete döner

**Etiketler (TR/EN):** `Tarama yok` · `Tarama güncel` · `Tarama eski` ·
`Disk değişti` · `Tarama geçersiz` · `Taranıyor`.

**Tutarlılık:** Genel Bakış risk kartı `scan-stale` → `scan-dirty`
("Disk değişti", `danger` tonu).

### 2.3 UX-027/009 — Risk kartlarının hizası

`.card` tek satır `flex` + `align-items: baseline` idi → etiket eziliyor
(`min-width: 0` yok), sayı havada kalıyor, içerik kartın üstüne yapışıyordu.
**3 satırlık ızgara:** `row1 = konu + sayı`, `row2 = sonuç + hedef ekran`,
`align-items: center` → **dikeyde ortalanıyor**.
Ölçüldü: üç kart da **180×73 px**; etiket/sayı/hedef konumları karttan
karta **23 px** farkla aynı.

### 2.4 UX-028 — Sol menü: ikon + hamburger

- `web/src/components/icons.tsx` (yeni, 113 satır): 12 inline SVG ikon
  (`menu`/`close` dahil), bağımlılık yok, `currentColor`.
- Geniş ekranda **ikon-only daraltma**: 208 px → **52 px**, `localStorage`
  (`residue.rail`), durum `app.rail-collapsed`.
- Dar ekranda (≤820 px) **otomatik gizli** + hamburger ile **açılır panel**
  (`app.rail-drawer-open`), arkasında karartma perdesi.
- Düğme etiketi **yaptığı işi** anlatır: `Menüyü aç` / `Menüyü kapat` /
  `Menüyü daralt` (4 durumun 4'ü doğrulandı).

### 2.5 UX-013 — Okunabilir küme adı

`DashboardSafeWinView.title` motor tarafından geliyor; "Güvenli Kazanımlar"
tablosu başlıkta okunabilir adı, altında ham anahtarı gösteriyor.

### 2.6 UX-032/033/034 — Kart = konu + sonuç; kartlar indeks

- `DashboardCardView` → `titleId` (konu) + `stateId` (sonuç) + `detailId` +
  `count: number | null` + `target: DashboardTarget | null`
- Konu → sonuç eşleşmeleri: `Önceki Tarama`→`Disk değişti` ·
  `Ortam yolları`→`Yol sorunu` · `Komut yolu`→`Gölgede kalan komut` ·
  `Ortam değişkenleri`→`Yetim değişken` · `Araç kurulumları`→`Bozuk kurulum` ·
  `Bağımlılıklar`→`Kopuk bağımlılık` · `Yarım kalan işlemler`→`Yarım kalan
  işlem` · `Kasa ögeleri`→`Süresi dolmuş kasa öğesi` · `Zamanlanmış işler`→…
- **Yeni motor** `src/core/dashboard-details.ts` (148 satır, saf TS):
  `DashboardDetails` → her kart için detay satırları → `DashboardResponse.details`
- Kartlar `<button aria-pressed>`; tıklanınca **alt liste** o kartın detayına
  dönüyor ("Güvenli kazanımlara dön" ile geri alınır).
- Satır etiketleri **doğru alandan**: yol bulgularında sol = yol, sağ =
  gerekçe (`variable` alanı her zaman "Path" olduğu için kullanılamaz);
  gölgede komutta sol = komut adı (`klist`, `notepad`, `wsl`).

### 2.7 UX-035 — Tarama damgası

`web/src/components/ScanStamp.tsx` (yeni): *"Önceki taramadan · 21 Eki 2026
14:54 · 10 saat önce"*. Tarih **motordan** (`scan.at`), arayüz yalnızca
biçimlendirir. Genel Bakış başlığında ve "Güvenli Kazanımlar" panelinde.

### 2.8 UX-036 — Motor hatası: tarama damgası iki yerden farklı geliyordu

`scan-service.ts` bellekte `at: Date.now()` (kayıt anı), `scan-cache.ts`
diskten `at = scan.finishedAt` (bitiş anı) kullanıyordu. `dirty = dirtyAt > at`
olduğu için **sunucu yeniden başlayınca "Disk değişti" rozeti kendiliğinden
değişebiliyordu**. Düzeltme: bellekte de `at = result.finishedAt`.

### 2.9 UX-031 — Özelleştilebilir sağ panel, "Planla", Planlar IA → **PLANA**

`docs/UX-PLAN-2026-10-21.md` (yeni, 307 satır) — P1..P9:
P1 özelleştirilebilir sağ panel (modül tabanlı + katlama + sürüklenebilir
split) · P2 "Planla" → tarihli plan kaydı + hemen onaya · P3 "Planlar" IA +
menü rozeti (kullanıcı seçimi bekleniyor: A tek Planlar / B yeniden adlandır
/ C olduğu gibi) · P4 arka planda ne oluyor · P5 "Araçlarda 0 B" → bilinmiyor
· P6 sayı paydası · P7 risk kartları tıklanabilir · P8 KARARLAR paneli
yukarıda · P9 her tarama için tarihli kayıt.

---

## 3. Dosya bazlı değişiklik dökümü

**Yeni (9 dosya, 1.652 satır):**

| Dosya | Satır | Ne |
|---|---|---|
| `docs/UX-LOG.md` | 462 | Sınıf bazlı denetim kaydı |
| `docs/UX-PLAN-2026-10-21.md` | 307 | Ertelenen işler (P1–P9) |
| `src/core/scan-status-view.ts` | 147 | Tarama durumu motoru |
| `src/core/dashboard-details.ts` | 148 | Kart detayı motoru |
| `tests/scan-status-view.test.ts` | 107 | 9 test |
| `tests/dashboard-details.test.ts` | 122 | 7 test |
| `web/src/components/ScanStatus.tsx` | 165 | Rozet + ayrıntı diyaloğu |
| `web/src/components/ScanStamp.tsx` | 41 | Damga satırı |
| `web/src/components/icons.tsx` | 113 | 12 SVG ikon |

**Değiştirilen (12 dosya, +1204 / −134):**

| Dosya | Değişiklik |
|---|---|
| `src/core/contract.ts` | `ScanStatusKind/Tone/Reason/Row/RowId/Unit`, `ScanStatusFacts`, `ScanStatusViewResponse`, `DashboardCardTitleId`, `DashboardDetailId/Row/View`, `DashboardCardView` yeniden şekillendi, `DashboardSafeWinView.title`, `DashboardResponse.details` |
| `src/core/dashboard-summary.ts` | `cards()` → konu/sonuç/detayId; `scan()` → `view`; `facts.details` |
| `src/services/scan-service.ts` | `at: result.finishedAt`; `status()` → `view` |
| `src/services/dashboard-service.ts` | detay verisi toplama + `DashboardDetails` |
| `tests/dashboard-summary.test.ts` | `facts` yardımcısı → motor `view` + `details` |
| `web/src/App.tsx` | hamburger, ikonlu rail, `rail-collapsed`/`rail-drawer-open`, daraltma durumu, `ScanStatusChip` + `ScanStatusDialog` |
| `web/src/format.ts` | `formatDuration`, `formatTimestamp`, `formatCount`, `formatRatio`, `formatScanRow` |
| `web/src/i18n.ts` | ~60 yeni anahtar (TR/EN): `cardtitle.*`, `detail.*`, `scan.stamp`, `scan.kind.*`, `scan.reason.*`, `scan.row.*`, `nav.open/close/collapse`, `dash.safeWins.why` |
| `web/src/labels.ts` | `CARD_TITLE_LABEL`, `DETAIL_TITLE_LABEL`, `SCAN_STATUS_LABEL`, `SCAN_REASON_LABEL`, `SCAN_ROW_LABEL` |
| `web/src/screens/Dashboard.tsx` | kart → `<button>` + `aria-pressed`, alt liste detay değişimi, damga, konu/sonuç |
| `web/src/screens/Disk.tsx` | rozet → `ScanStatusChip` |
| `web/src/styles.css` | kart ızgarası, rozet tonları, diyalog, ikon/rail daraltma, drawer, damga, detay listesi |

**Gitignored (elle yönetildi):** `AGENTS.md` (UX-001 bölümü, K15 maddesi,
"Tarayıcı arayüzü" akış bölümü), `state.json` (T62/T63/T64),
`SESSION_LOG.md` (bu oturumun girişi), `dist/web` (yeniden derlendi).

---

## 4. Doğrulama

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` (src + web) | **temiz** |
| `npm test` | **114/114** (başlangıçta 107 → +7 yeni) |
| `npm run smoke` | **34/34, temiz** |
| `npm run build:web` | 430.87 KB JS (121.78 KB gzip), 33.45 KB CSS (6.35 KB gzip) |
| Gerçek tarayıcı (ego-browser, Edge/Chromium) | aşağıda |

**Tarayıcıda doğrulananlar:**
- Rozet `<button>` · `aria-haspopup="dialog"` · diyalog `role="dialog" aria-modal="true"`
- `Esc` → kapanır, **odak rozete döner**; Tab tuzağı çalışır
- `dl` → `dt`/`dd` yapısı doğru (a11y ağacı: `list_item` değil)
- TR/EN çevirileri tam
- Menu: 4 durumun `aria-label`/`aria-expanded` doğru (geniş açık/daraltılmış,
  dar kapalı/açık)
- Kart → alt liste → "Güvenli kazanımlara dön" → geri
- Yol detayı 3 satır (gerçek yol + gerekçe), komut detayı 30 satır
- Konsol hatası **yok**

**Ölçülen çıktılar:** kartlar 180×73 px · `cols: "52px 1152px 320px"` (daraltılmış
menu) · `railX -220` (dar ekranda gizli) / `railX 0` (açık) · stamp
"Önceki taramadan · 21 Eki 2026 14:54 · 10 saat önce".

---

## 5. ⚠ Kullanıcının söylediği, **henüz yapılmayan** işler

> Bu maddeler **kullanıcının kendi ifadeleriyle** kaydedilmiştir. Sonraki
> oturumun iş listesi budur. **Hiçbiri uygulanmadı.**

### UX-038 · "Önceki Tarama" kartının içine tarama tarihi + geçen zaman
> *"Önceki Tarama yazan kartın içine tarama yapılan tarihi ekliyorsun. ve geçen
> zamanı ekliyorsun."*

**Durum:** ❌ yapılmadı. Tarih + geçen zaman şu an **sayfa başlığında**
(`ScanStamp`) ve **panel başlığında** var; **kartın içinde** yok.

**Yapılacak:** Kartın içine `21 Eki 2026 14:54` + `10 saat önce` girmeli
(motor `scan.at`/`scan.ageMs` → kart `rows[]`'ına ek satır).

### UX-039 · "Disk değişti" yazan **her yer** silinecek
> *"diğer disk değişti yazan heryeri siliyorsun."*

**Durum:** ❌ yapılmadı. "Disk değişti" **üç yerde** var:
1. `web/src/components/ScanStatus.tsx` → `ScanStatusChip` (üst çubuk) — hâlâ yazıyor
2. `web/src/screens/Dashboard.tsx` → sayfa başı statik rozeti — hâlâ yazıyor
3. `web/src/screens/Dashboard.tsx` → "Önceki Tarama" kartı — **bu kalacak**

**Yapılacak:** 1 ve 2 silinecek; "Disk değişti" yalnızca kartın içinde kalacak.

### UX-040 · Üst çubuk "Son Tarama: <geçen süre>" olacak
> *"en üstteki header kısmında Son Tarama : geçen süre olarak kalsın."*

**Durum:** ❌ yapılmadı. Üst çubuk şu an **"Disk değişti · 10 saat önce"**
diyor (`ScanStatusChip` → `SCAN_STATUS_LABEL[kind]`).

**Yapılacak:** Üst çubuk rozeti **"Son Tarama: 10 saat önce"** olacak; yani
rozet *durumu* değil, *zamanı* gösterecek. Etiket motorun vermeli.

### UX-041 · "Ortam yolları" ve "Komut yolu" kartlarının içeriği bozuk
> *"Ortam yolları kart içeriği bozuk komut yolu aynı şekilde."*

**Durum:** ❌ yapılmadı. İki kartta da **sayı ile sonuç ayrı ayrı duruyor**:
```
▎ Ortam yolları            3        ← sayı sağ üstte
  Yol sorunu      PATH & ORTAM        ← sonuç sol altta
```
Sayı ile cümlesi kopuk ("3 Yol sorunu" okunmuyor); üçüncü kartta sonuç metni
("Gölgede kalan komut") **iki satıra** sarıyor → kartlar görsel olarak
eşitlenmiyor.

**Yapılacak:** Sayı ve sonuç **tek bir okunabilir cümle** olarak aynı satırda
birleşmeli ("3 Yol sorunu", "30 Gölgede kalan komut"); sarma engellenmeli.

### UX-042 · Alt kartların tıklanabilirliği **kalıyor**
> *"ben üstteki kartlardan bahsediyordum en alttaki kartları tıklanabilir
> yapmışsın. Tamam onlarda kalsın."*

**Durum:** ✅ **yapıldı ve kalıyor.** "üstteki" ile kastedilen üst çubuktaki
ve sayfa başındaki rozetler; alt risk kartlarının tıklanabilirliği istenen
şeydi ve yapıldı.

### UX-043 · "Yaptım" dedim ama yapmadım — süreç notu
> *"Ama bu değişiklikleri yaptıp deyipte yapmaman bu olmadı."*

**Durum:** ⚠ **tespit edilip kaydedildi.** UX-039/040/041 için "çözüldü"
dendi ama o işler **yapılmamıştı**; yalnızca *rozetin tıklanabilirliği*
kaldırılmıştı (metin yerinde kalmıştı). Ders: bir madde "düzeltildi"
deniyorsa **istenen sonucun tamamı** yapılmış olmalı; kısmi yapılıp
"düzeltildi" demek yanlış raporlamadır.

**Bu oturumdaki asıl kök neden:** "üstteki kart" ifadesi **belirsiz** kaldı
(üst çubuk rozeti mi, sayfa başı rozeti mi?) ve belirsizliği **sorulmadan**
yorumlandı. AGENTS.md kural 20 (anlaşılmayan istek tekrar sorulur) bu
oturumda iki kez ihlal edildi. → Gelecekte: belirsiz ifade = **önce sor**.

---

## 6. Açık riskler / sonraki oturum için

| # | İş | Nerede |
|---|---|---|
| 1 | ✅ **UX-038..041 uygulandı** (22.10.2026, §7) | `docs/UX-LOG.md` |
| 2 | **P3 seçimi**: "Planlar" IA (A tek Planlar / B yeniden adlandır / C aynı) — kullanıcı seçmedi | `docs/UX-PLAN-2026-10-21.md` |
| 3 | P1 özelleştirilebilir sağ panel + split + katlama | aynı |
| 4 | P2 "Planla" → tarihli plan kaydı + hemen onaya | aynı |
| 5 | P5 "Araçlarda 0 B" → "bilinmiyor" | aynı |
| 6 | P9 her tarama için tarihli kayıt (`scans/index.json`) | aynı |
| 7 | UX-002, UX-003, UX-004, UX-006, UX-010 | `docs/UX-LOG.md` |
| 8 | **Yayın yok** — işler bitene kadar patch çıkarılmayacak (kullanıcı kararı) | — |
| 9 | Disk → Projeler → Araçlar → PATH & Ortam → Graf → Planlar → Kasa → Ayarlar ekranları **ilk kullanıcı gözüyle denetlenmedi** | `docs/UX-LOG.md` |

**Sunucu durumu:** `4411` (PID 7188) açık, güncel kodla. `4399` bu oturumda
kapatıldı (eski koddu) — **kullanıcının önceki sunucusuydu**; gerekirse
`node bin/residue.mjs ui --web --no-browser --port 4399` ile geri açılabilir.

**Tarayıcı:** ego-browser space 12 (`residue-ux-audit-20261021`), `p1` →
`http://127.0.0.1:4411/`. Uzaktan sürülüyor (kullanıcı arada kontrol ediyor).

**Kapsam dışı bırakılanlar:** geri alma yapılmadı (kullanıcı talebi).
Çalışma alanı **bu haliyle** duruyor; `git status` 12 değiştirilmiş + 9 yeni
dosya gösteriyor.

---

## 7. İkinci tur — UX-038..041 uygulandı (22.10.2026)

**Durum:** dört madde de tamamlandı; UX-042 korundu; UX-043 kuralı
`AGENTS.md` 20 olarak eklendi. Yayın yok.

### 7.1 Motor / sözleşme

- `ScanStatusViewResponse.header` → `none | age | scanning`; üst çubuk
  etiketini **motor** seçer. `ScanStatusView.header()`.
- `DashboardCardView.meta` → `{ at, ageMs }`; tarama kartı tarih + geçen
  süreyi motordan alır.
- `DashboardSummary.cards()` tarama kartlarına `meta` ekler.

### 7.2 Arayüz

- `ScanStatusChip` artık **"Son Tarama: <geçen süre>"** gösterir; durum
  etiketi değil. `ageMs` prop'u kaldırıldı (`App`, `Disk` güncellendi).
- Dashboard sayfa başındaki statik "Disk değişti" rozeti **kaldırıldı**.
- Tarama raporu diyalogundaki durum satırı **kaldırıldı**; metin yalnızca
  "Önceki Tarama" kartında.
- Kart düzeni: konu + hedef (1. satır), **sayı + sonuç tek satır**
  (`.card-summary`, `nowrap`), tarama kartında tarih + süre (3. satır).
- `card.count` null olan kartlarda sayı gösterilmez (boş tire yok).

### 7.3 Doğrulama (gerçek tarayıcı, DOM ölçümü)

| Kontrol | Sonuç |
|---|---|
| Üst çubuk | `Son Tarama: 1 gün önce` |
| Sayfa başı rozeti | `.page-head .scan-chip` = **0** |
| "Disk değişti" | DOM'da **1** kez, yalnız `.card-state` |
| Önceki Tarama kartı | `21 Eki 2026 14:54` + `1 gün önce` |
| Ortam yolları kartı | `3 Yol sorunu` |
| Komut yolu kartı | `30 Gölgede kalan komut` |
| Kart yüksekliği | üç kart da **88 px** |
| Kart metni taşması | `scrollWidth = clientWidth = 148` |
| Diyalog durum satırı | `.scan-dialog-state` = **yok** |
| Esc | diyalog kapanır, odak `.scan-chip`'e döner |
| `npm test` | **114/114** |
| `npm run typecheck` | temiz |
| `npm run smoke` | **34/34** |
| `npm run build:web` | 430.79 KB JS / **121.73 KB gzip**, 33.73 KB CSS |

**Not:** Bu turda `Page.captureScreenshot` CDP zaman aşımına uğradı; görsel
kanıt yerine **DOM ölçümleri** kullanıldı. Ekran görüntüsü bir sonraki
turda yeniden denenebilir.

**Commit:** `ff2eaeb` — UX-038..041 uygulaması; `main`'e gönderildi.
