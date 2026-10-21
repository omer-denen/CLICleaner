# Devir belgesi — 21.10.2026 · 2.2.0 arayüz (M4: Planlar + Ayarlar + Güncelleme)

> **Konum:** `C:\Users\Code\source\repos\residue-cleaner`
> **Durum:** M4 tamam; çalışma ağacı bu belgeyle birlikte commit edildi.
> **Sürüm:** npm'de yayınlanan **2.1.0**; 2.2.0 geliştirmede
> (`CHANGELOG` → `[Unreleased]`, `package.json` hâlâ 2.1.0).
> **Test:** `npm test` **92/92**, typecheck (src + web) temiz,
> `build:web` **109.96 KB gzip** JS + 4.21 KB gzip CSS.
>
> Önceki belge: `docs/HANDOVER-2026-10-21f.md` (M3).

---

## 1. Oturumun talebi

Kullanıcı: **"başla."** `AGENTS.md` sıradaki iş:
**T44 / D4 — M4: Planlar/Zamanlama + Ayarlar + Güncelleme**
(kural oluşturma `PLANLA`; yalnız kasaya taşır).

Bağlayıcı kurallar:

1. Planlı işlem **yalnız kasaya taşır**; kalıcı silme ve env yazımı
   otomatik yapılmaz.
2. Kural oluşturma yazılı onay ister; arayüz ve sunucu aynı kuralı
   (`ApprovalRules`) kullanır.
3. Güncelleme kontrolü **opt-in**; kapalıyken hiçbir ağ isteği yapılmaz.
4. Tarayıcı doğrulaması **ego-browser** (kural 19).

---

## 2. Motor / sözleşme

### 2.1 Onay dili

- `ApprovalRules` türüne **`schedule` = `PLANLA`** eklendi.
- `ScheduleService.create(input, approval?)` yazılı onayı doğrular:
  `approval.require` true ise `ApprovalRules.matches('schedule', phrase)`.
- API `POST /api/schedules` her zaman `require: true` ile çağırır.
- CLI `residue schedule add ... --phrase PLANLA` aynı kuralı kullanır;
  eksikse açıklayıcı hata verir.

### 2.2 Sözleşme (`src/core/contract.ts`)

- `ScheduleView extends ScheduleRule` — `nextRunAt`, `due`, `missed`,
  `lastRun` sunucudan gelir.
- `ScheduleCreateRequest` — `phrase` alanı dahil.
- `ScheduleListResponse`, `ScheduleCatchUpResponse`,
  `ScheduleHistoryResponse`.
- `ScheduleInput` servis tarafında `ScheduleCreateRequest` takma adı
  olarak korunur (CLI uyumu).
- `CategoryKey` / `CategoryStat` sözleşmeden yeniden dışa aktarıldı
  (arayüzün kategori seçimi için).

### 2.3 Ayarlar / güncelleme

Mevcut `SettingsResponse`, `SettingsUpdateRequest`, `UpdateCheckView`
tipleri arayüze bağlandı. `GET /api/update` davranışı değişmedi:
`off` iken `checked: false`, ağ isteği yok; `force=1` yalnız açık modda
tek registry sorgusu.

---

## 3. API

| Uç | Davranış |
|---|---|
| `GET /api/schedules` | Kurallar + `nextRunAt` / `due` / `missed` / `lastRun`. |
| `POST /api/schedules` | Yazılı **`PLANLA`** ister; `mode: 'vault'`; 201. Onaysız **400**. |
| `POST /api/schedules/:id/preview` | Mevcut tarama önbelleğinden seçici önizlemesi. |
| `POST /api/schedules/:id/run` | Kuralı hemen çalıştırır (yalnız kasa); iki adımlı UI onayı. |
| `DELETE /api/schedules/:id` | Kuralı siler (dosya/disk silmez). |
| `GET /api/schedules/catchup` | Kaçırılan/geciken çalışma **önerileri**; otomatik çalışmaz. |
| `GET /api/schedules/history` | Çalışma geçmişi. |
| `GET/PUT /api/settings` | Tarama önbelleği, kasa saklama, güncelleme modu. |
| `GET /api/update` | Opt-in sürüm kontrolü; `force=1` zorlar. |

---

## 4. Arayüz

### 4.1 Planlar — `web/src/screens/Schedules.tsx`

- **Kural formu:** ad, sıklık (`once/daily/weekly`), saat/dakika,
  haftanın günü, tek sefer için “kaç dakika sonra”, en yüksek risk
  (`safe/low`), en az atıllık, en fazla öğe, kategori çipleri,
  kaçırılan çalışma telafisi, etkin.
- **`PLANLA` duvarı:** ifade yazılmadan “Kural oluştur” pasif; sunucu
  ayrıca doğrular.
- **Kural kartları:** sıklık, `mode: vault`, sonraki çalışma, seçici
  özeti (kategori/risk/limit), son çalışma, `due`/`missed` rozetleri.
- **İşlemler:** önizleme (6 öğe / 5.5 GB gerçek veri), iki adımlı
  “Şimdi çalıştır” ve “Sil”.
- **Kaçırılan çalışmalar:** otomatik çalıştırılmaz; her biri için onay.
- **Geçmiş:** son 30 çalışma; durum, öğe, bayt, hata.
- Form 4 kolonlu (saat/dakika aynı satırda); dar ekranda 2 kolon.

### 4.2 Ayarlar — `web/src/screens/Settings.tsx`

- Tarama önbelleği (min/max sunucudan), kasa saklama, güncelleme modu.
- **Kaydet** + “Kaydedildi” rozeti.
- **Şimdi kontrol et** (`force=1`); kapalıyken
  “Kontrol kapalı — ağ isteği yapılmadı.” gösterilir.
- Kurulu sürüm başlıkta; sonuçta kurulu/son sürüm ve son kontrol yaşı.

---

## 5. Doğrulama

```powershell
npm run typecheck     # src + web temiz
npm test              # 92/92
npm run build:web     # 386.37 KB JS / 109.96 KB gzip; 21.23 KB CSS
```

### 5.1 API smoke (gerçek sunucu, `:4399`)

- Ayarlar: 24 saat / 30 gün / `off`; geçici değişim 1 saat / 21 gün /
  `off`; **geri yüklendi**.
- `GET /api/update`: `checked: false`, `mode: 'off'` — ağ isteği yok.
- `POST /api/schedules` onaysız → **400** “PLANLA bekleniyordu”;
  onaylı → **201**, `mode: 'vault'`, `nextRunAt`, seçici `safe`.
- Önizleme → **2 öğe / 5.3 GB**; history 0; catchup 0; kural silindi.

### 5.2 Ego-browser (space 5)

- Planlar formu dolduruldu; `ego test plani` oluşturuldu.
- Önizleme: **6 öğe / 5.5 GB** (`rattler`, `uv`, updater artıkları…).
- Kural iki adımlı onayla silindi; liste “Henüz plan kuralı yok.” oldu.
- Ayarlar: kaydet → “Kaydedildi”; kontrol → kapalı mesajı.
- **Gerçek plan çalıştırma yapılmadı.**
- Görseller: `scratch/ego-m4-schedules-form-4col.png`,
  `scratch/ego-m4-schedule-created.png`,
  `scratch/ego-m4-schedule-preview.png`,
  `scratch/ego-m4-settings.png`.

### 5.3 Testler

- `tests/approval.test.ts` — `schedule` (`PLANLA`) testi.
- `tests/api.test.ts` — onaysız 400 / onaylı 201 / list / delete;
  ayarlar kaydı; kapalı güncelleme kontrolü.
- Toplam **92/92**.

---

## 6. Kararlar

1. **`PLANLA` iki katmanda.** Arayüz düğmesi ifade olmadan pasif;
   sunucu da `ApprovalRules` ile doğrular. CLI de aynı ifadeyi ister.
2. **Planlı işlem yalnız kasaya taşır.** `ScheduleService` `mode: 'vault'`
   ile çalışır; risk `safe/low` dışına çıkarsa kural oluşturulmaz, çalışma
   sırasında yazılı onay gerektiren plan oluşursa çalışma **failed** olur.
3. **Kaçırılan çalışma otomatik değil.** `/catchup` yalnız öneri döner;
   kullanıcı onaylar.
4. **Güncelleme opt-in.** Kapalıyken ağ isteği yok; `force` yalnız açık
   modda sorgular. Kendi kendine güncelleme yok.
5. **Gerçek çalıştırma test edilmedi.** Bu oturumda hiçbir plan çalıştırılmadı.

---

## 7. Açık riskler

1. **M5 yok:** cila, a11y, klavye-only tur, `npx` smoke, 2.2.0 yayını.
2. **Plan çalıştırma** gerçek cihazda test edilmedi (yalnız önizleme).
3. **Kural düzenleme** ucu yok; sil + yeniden oluştur.
4. **CLI `schedule add`** artık `--phrase PLANLA` ister; eski kullanım
   alışkanlığı olanlar için hata mesajı var.
5. **T54** (eski CLICleaner kalıntıları) planlı; uygulanmadı.
6. GitHub Release `v2.1.0` hâlâ elle.
7. Sunucu `:4399` oturumluk; **oturum kapanırken durduruldu**, yeni
   oturumda yeniden başlatılmalı.

---

## 8. Sıradaki adımlar

1. **M5 — Cila + yayın:** klavye-only tur, a11y, headless smoke, `npx`
   ile arayüz, `CHANGELOG` 2.2.0, tag/publish kullanıcı onayıyla.
2. Sonra T30 → T37 → T41 arayüzü → **T54** (kullanıcı onayıyla).

---

## 9. Dosya haritası (bu oturum)

| Dosya | Değişiklik |
|---|---|
| `src/core/approval.ts` | `schedule` (`PLANLA`) |
| `src/core/contract.ts` | Planlar sözleşmesi; `CategoryKey` dışa aktarımı |
| `src/services/schedule-service.ts` | Onay doğrulaması; sözleşme tipleri |
| `src/commands/schedule.ts` | `--phrase PLANLA` |
| `src/web/server.ts` | `POST /api/schedules` onayı |
| `web/src/screens/Schedules.tsx` | **YENİ** — Planlar |
| `web/src/screens/Settings.tsx` | **YENİ** — Ayarlar + güncelleme |
| `web/src/App.tsx` | Rotalar + geniş ekranlar |
| `web/src/api.ts` | Schedule/settings/update istemcileri |
| `web/src/i18n.ts`, `labels.ts`, `styles.css` | TR/EN + stiller |
| `tests/approval.test.ts`, `tests/api.test.ts` | `PLANLA`, API testleri |
| `docs/T44-PLAN.md`, `CHANGELOG.md`, `AGENTS.md`, `state.json` | Durum güncellemesi |

---

## 10. Oturum kapanışı — sonraki oturum için

**Kullanıcı kararı (21.10.2026):** M5 **bir sonraki oturumda** yapılacak.
Bu oturum M4 ile kapatıldı.

### 10.1 Bırakılan durum

- **Commit:** `40a75a5` — “2.2.0 M4: planlar + ayarlar + guncelleme”.
  **Push yapılmadı.**
- Çalışma ağacı temiz (AGENTS.md, SESSION_LOG.md, state.json `.gitignore`).
- `npm test` **92/92**; typecheck temiz; `build:web` **109.96 KB gzip**.
- `package.json` hâlâ **2.1.0**; 2.2.0 `[Unreleased]`.
- **Sunucu kapatıldı.** `:4399` dinlemiyor; yeni oturumda yeniden başlat.
- Ego-browser space 5 bu oturuma aitti; yeni oturumda yeni space açılabilir.

### 10.2 Sonraki oturumun ilk adımları

1. **Oku:** `AGENTS.md` → `SESSION_LOG.md` (en üst M4) →
   `docs/HANDOVER-2026-10-21g.md` (bu belge) → `docs/T44-PLAN.md` (M5).
2. **Doğrula:** `git status`, `git log -1`, `npm run typecheck`,
   `npm test`, `npm run build:web`.
3. **Sunucuyu başlat:**
   `node bin/residue.mjs ui --web --no-browser --port 4399`
   (veya varsayılan port). Çıktıdaki token yalnız `ui --web` gerekmez;
   tarayıcı `GET /` ile çerezi alır.
4. **Tarayıcı:** `ego-browser skill` çıktısını izle; tek TaskSpace aç;
   Araçlar / PATH & Ortam / Graf / Planlar / Ayarlar / Projeler ekranlarını
   kısa bir turla kontrol et.

### 10.3 M5 kabul listesi (öneri)

- **Klavye-only tur:** nav, tablolar, formlar, onay ifadeleri; `Tab`,
  `Enter`, `Esc`, `Space`, `/` davranışları.
- **a11y:** `aria-label`, odak halkası, kontrast, form etiketleri;
  `role="alert"` hataları.
- **Headless smoke:** `ui --web` + `GET /` çerezi + tüm API uçları 200/401.
- **Paket smoke:** `npm pack` → boş klasörde `npx residue-cleaner@2.2.0`
  (veya yerel tarball) → arayüz açılır; URL'de token yok.
- **Sürüm:** `CHANGELOG` `[2.2.0]` (teknik detay yok), `npm version minor`
  → **2.2.0**, tag `v2.2.0`, `npm publish`.
- **GitHub Release:** `gh` yok; sayfa **elle**, başlık = tag adı
  (AGENTS 17). **Tag/publish kullanıcı onayı olmadan yapılmaz.**
- **T54** hâlâ planlı; M5 kapsamında değil.

### 10.4 Bilinen tuzaklar

- **Eski sunucu:** Eski bir `:4399` süreci yeni `dist/web` ile karışırsa
  “Bilinmeyen uç nokta” görülür. Sunucuyu yeni kodla başlat.
- **Ego-browser PATH:** `ego-browser` PATH'te olmayabilir; tam yol
  `C:\Program Files\Citro Labs\ego lite\Application\<sürüm>\ego-browser.exe`.
  PowerShell'de çok satırlı script `-e` ile verilmez; UTF-8 `.mjs` dosyası
  ve `-e "await import('file:///...')"` kullan.
- **CLI plan kuralı:** `residue schedule add` artık `--phrase PLANLA`
  istiyor; eski komutlar hata verir.
- **Gerçek plan çalıştırma** hâlâ test edilmedi; M5'te istenirse küçük,
  güvenli bir kural ve kasa ile denenmeli.

### 10.5 Açık kararlar

1. 2.2.0 yayını M5 sonunda mı, ayrı bir onayla mı? (Öneri: M5 sonunda,
   kullanıcı onayıyla.)
2. T54 (eski CLICleaner kalıntıları) 2.2.0 sonrası mı? (Mevcut plan: sonra.)
3. Plan çalıştırma gerçek cihaz testi M5'e dahil mi? (Öneri: evet, küçük
   ve geri alınabilir tek kural.)

