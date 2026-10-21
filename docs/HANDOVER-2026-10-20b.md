# Devir belgesi — 20.10.2026 (gece) · v1.0.0 + 3 sütunlu konsol
> **AD NOTU (21.10.2026, 2.0.0):** Bu belge eski adla (**CLICleaner**)
> yazılmıştır ve olduğu gibi bırakılmıştır (tarihsel kayıt). Proje artık
> **Residue**: npm paketi `residue-cleaner`, komut `residue`, veri dizini
> `%LOCALAPPDATA%\residue`. Bu belgedeki `clicleaner ...` komutları
> `residue ...` olarak okunmalıdır.

> Bu oturumun kapanış kaydı.
> Önceki devir: `docs/HANDOVER-2026-10-21.md` · `docs/HANDOVER-2026-10-20.md`
>
> **Tarih notu:** Bu oturumun sistem saati **20.10.2026 21:00–23:30 (+03)**.
> Önceki devir belgesi "21.10.2026" diye etiketlenmiş ama o oturumun da
> kayıtları 20.10–21.10 arasına düşüyor; tarih etiketleri kaymış, içerik
> doğru. Dosya adı gerçek tarihi (20.10) taşır.
>
> **Bu oturumda iki kayıt dosyası `.gitignore`'dadır** (`state.json`,
> `SESSION_LOG.md`, `AGENTS.md` — makineye özel çalışma notları). Kalıcı
> kayıt `docs/` altındadır; bu belge odur.

## 1. Bu oturumda kapanan işler

### 1.1 v1.0.0 YAYINI (major)

Kullanıcı kararı: "yayın artık web arayüzü komple değişeceği için v1 ile
başla".

| Adım | Sonuç |
|---|---|
| `CHANGELOG.md` → `[1.0.0]` | teknik detay yok, kullanıcı dili |
| `npm run release:major` | **1.0.0** + tag **v1.0.0** + commit `eba5931` |
| `git push origin main --tags` | main + tag gitti |
| `npm publish` | **clicleaner@1.0.0** (273.9 kB, 67 dosya) |
| Doğrulama | `npm view clicleaner version` → **1.0.0** ✅ · `npx clicleaner@1.0.0 status` çalışıyor ✅ |

- Öncesinde: typecheck temiz, `vite build` başarılı, **36 test dosyası yeşil**.
- **GitHub Release:** `gh` CLI kurulu değil → sayfa **elle** açılacak.
  Kural: **release başlığı verilmez** → GitHub varsayılanı (başlık = tag adı).
  Kural `AGENTS.md` 17. madde + `docs/GITHUB-METADATA.md` içinde kayıtlı.

### 1.2 Canlı arayüz geliştirme ortamı

Kullanıcı sorusu: "web arayüzünü tasarlarken canlı değişiklikleri browser'da
görebilir miyim?" → **Ev.**

- `vite.config.ts` → dev sunucusu `:5173` + `/api` proxy → `127.0.0.1:4321`.
  `changeOrigin: false` (arka uc loopback kontrolü yapar) + `Origin` başlığı
  Host'a eşitlenir (arka uc "Origin == Host" kontrolü yapar).
- `package.json` → `npm run dev` (Vite/HMR) · `npm run dev:api` (token'lı API).
- Başlatıcı betik (repo dışında):
  `C:\Users\Code\AppData\Local\Temp\opencode\dev-ui.ps1`
  → API'yi `--no-open` ile başlatır, **token'ı stdout'tan okur**, Vite'i
  başlatır, tarayıcıyı `http://localhost:5173/?token=…` ile açar.
- Doğrulama: proxy'den `GET /api/meta` 200 · `POST /api/scan` 202 ·
  SSE `text/event-stream` akışı · `styles.css` değişince `hmr update` ·
  CDP ile gerçek render.

### 1.3 T42 / D3 — 3 sütunlu geliştirici konsolu (P0 → P5)

Tasarım: `docs/UI-REDESIGN-3COL.md`. Felsefe: **"Geliştirici Dostu
Şeffaflık"** — terminal emülatörü × temiz dashboard hibriti; veri yoğunluğu
altın kural, mono değerler, hizalı sütunlar, `>` prompt imleci, ince ayraçlar.

| Faz | İçerik | Dosyalar |
|---|---|---|
| **P0** | Sol rail (sağlık + kategoriler + plan durumu), içerik kabuğu, belirteçler (`--rail-w/--ctx-w/--row-h`) | `components/Rail.tsx` (yeni) |
| **P1** | Tek satır durum şeridi, 32px yoğun ızgara, yapışkan mono başlık, klavye, triyaj çipleri | `components/StatusStrip.tsx` (yeni), `ClusterRow.tsx` (yeni yazım), `VirtualClusterList.tsx` |
| **P2** | Sağ bağlam paneli: Ne? / Silersem ne olur? / Kanıt yorumu / Kanıtlar / Bağımlılık ağacı / güvenli + manuel komut | `components/ContextPanel.tsx` (yeni), `util/evidence-text.ts` (yeni) |
| **P3** | Plan artık **modal değil**, kalıcı çalışma alanı: yapışkan özet, adım şeridi, yoğun tablo, plandan çıkarma, onay duvarı | `components/PlanWorkspace.tsx` (yeni), `components/ApprovalWall.tsx` (yeni) |
| **P4** | `DISK %` göstergesi (`statfs`) + kategori mantığı çekirdeğe taşındı | `src/core/disk-usage.ts` (yeni), `src/core/categories.ts` (yeni) |
| **P5** | "Birleşik" sekmesi: disk + CLI tek listede (**salt okunur**) | `src/core/findings.ts` (yeni), `GET /api/findings`, `components/FindingsView.tsx` (yeni) |
| **P6** | Cila + a11y | ⏳ **sıradaki** |

**P3 tasarım kararı (kullanıcı onaylı):** disk temizleyici uygulamaların
(Cleaner-App örneği) onay adımındaki düzeni örnek alındı → seçim yapılan
listeyle **aynı dil**, üstte tek satır özet, onay ekranında bile seçimden
çıkarılabilir, hedef yolları satır altında açılır.

**P3 sözleşme değişikliği:** `PlannedCluster.key` eklendi → "plandan çıkar"
başlığa göre değil **anahtara** göre çalışır; sunucu yeniden plan üretir,
böylece **uygulanan plan ile görünen plan birebir aynıdır**.

### 1.4 T40 — masaüstü kısayolu (web arayüzünden sonra ilk iş)

- `src/actions/desktop-shortcut.ts` (yeni): `.lnk` oluşturma/kaldırma
  (WScript.Shell COM).
- Kısayol sadece aracı başlatır (`node.exe "<giriş>" ui`); **token `.lnk`
  içine yazılmaz** (her açılışta yeni güvenlik jetonu üretilir).
- **Güvenlik:** açıklamaya sahiplik işareti yazılır; **yalnızca bize ait**
  kısayol silinir (yabancı `.lnk` testte korundu).
- API: `GET/POST/DELETE /api/shortcut/desktop`. Arayüz: Ayarlar → Masaüstü kısayolu.
- Test: `scratch/test-desktop-shortcut.ts` **16/16** (`CLICLEANER_DESKTOP` ile
  geçici klasör; gerçek masaüstüne dokunulmaz).
- ⚠️ Doğrulamada **gerçek masaüstünde** `C:\Users\Code\Desktop\CLICleaner.lnk`
  oluştu; Ayarlar ekranından kaldırılabilir.

### 1.5 T41 — sürüm/güncelleme bildirimi (kısmen)

- **Karar (kullanıcı): varsayılan KAPALI, opt-in.**
- `src/core/update-check.ts` (yeni): tek registry sorgusu
  (`registry.npmjs.org/clicleaner/latest`), 24 saat önbellek, hata sonucu
  önbelleğe girmez. **Kendi kendine güncelleme yok.**
- `src/web/settings-store.ts`: `updateCheck: 'off' | 'daily' | 'weekly'`
  (varsayılan `off`).
- `GET /api/update` → kapalıyken **hiç ağ isteği yapılmaz**.
- `clicleaner --version` / `-v` / `version` → sürümü yazar (ağ isteği yok).
- ⏳ **Eksik:** arayüzdeki "Güncelleme Politikası" ekranına mod seçici +
  "şimdi kontrol et" düğmesi + rozet eklenmedi. Sonraki adım.

## 2. Kararlar (bu oturum)

1. **v1.0.0** ile yayın; 1.x çizgisi arayüz çalışmasına ayrıldı.
2. **GitHub Release'e isim verilmez** → başlık = tag adı.
3. **T41** otomatik güncelleme kontrolu **varsayılan kapalı** (opt-in).
4. **T40** masaüstü kısayolu, web arayüzü kapandıktan sonra **ilk iş** → yapıldı.
5. **Sağ panel hover tabanlı değil, seçim/imleç tabanlı** (hover sağlıklı
   çalışmıyordu).
6. **Plan ekranı** tarama ızgarasıyla aynı dilde yoğun tablo (kullanıcı onayı).
7. **Kod tabanında düzenlemeye onay verildi** (P4/P5 sözleşme/ölçüm ekleri;
   **sınıflandırma mantığı değişmedi**).

## 3. Test durumu

- **36 test dosyası tamamen yeşil** (`scratch/test-*.ts`).
  Yeni: `test-disk-usage` 9/9 · `test-findings` 29/29 · `test-desktop-shortcut` 16/16.
- `npm run typecheck` (kök + web) temiz · `npx vite build` başarılı.
- CDP (headless Chrome) doğrulamaları: 3 sütun 264/1001/380px · plan alanı
  modal değil · `X` ile plandan çıkarma (7→6 küme, 8.92→5.47 GB, sunucu yeniden
  plan üretti) · `Space` yollar · `Esc` dönüş · dar ekranda yatay rail şeridi ·
  menü aç/kapat · disk göstergesi %62 · birleşik sekme 108 bulgu ·
  masaüstü kısayolu oluş/kaldır · **konsol hatası yok**.

## 4. Bulunan ve düzeltilen hata (bu oturum)

**`clicleaner --version` web sunucusunu başlatıyordu.**
Belirti: komut sürüm yazdırmak yerine "CLICleaner web arayüzü hazır" basıp
bloklanıyordu.
Kök neden: `src/cli.ts` komut çözümlemesi `argv[0]` '-' ile başlıyorsa
varsayılan olarak `'ui'` seçiyor; `--version` bayrağı bu yüzden komut
ziyaretine **hiç ulaşmıyordu** (bayrak `rest` içinde kalıyordu).
Düzeltme: sürüm bayrakları komut çözümlemesinden **önce**, ham `argv`
üzerinde kontrol edilir (`src/cli.ts`). Doğrulama: `--version`, `-v`,
`version` → `1.0.0` (hiçbir sunucu açılmıyor).

## 5. Çalışan ortam (şu an)

| Servis | Adres | Not |
|---|---|---|
| API (CLICleaner) | `http://127.0.0.1:4321` | token her açılışta yeni |
| Vite dev (HMR) | `http://localhost:5173` | `/api` proxy → 4321 |
| Tarayıcı | `http://localhost:5173/?token=…` | sessionStorage'da token saklanır |

- Yeniden başlatma: `powershell -ExecutionPolicy Bypass -File C:\Users\Code\AppData\Local\Temp\opencode\dev-ui.ps1`
- Token değişirse tarayıcıyı **yeni adresle** aç (eski sekmedeki token geçersiz).
- Kapatma: `Stop-Process -Id <pid>` (port 4321 / 5173 dinleyen süreçler).

## 6. Açık riskler

1. **T38 yanlış negatif:** geçerli PE başlığı olan ama runtime'da bozuk
   ikililer "bozuk" işaretlenmiyor.
2. **T35 web tarafı yok:** PATH çakışma kartı yalnız CLI + Markdown rapor.
3. **T28 bayrakları yalnız CLI `clean` için**; web arayüzünde hassas sınıflar
   (sohbet geçmişi, model deposu, kural dosyaları) karşılığı yok — web'de de
   kapalı tutulmalı.
4. **T31/T32/T36 yalnız sentetik fixture ile doğrulandı.**
5. **P3 "plandan çıkarma" sunucuya yeni plan isteği atar** → yoğun kullanımda
   her çıkarma bir istek demek; pratikte sınırlı, izlemede.
6. **T41 arayüz kısmı eksik** (bkz. 1.5).
7. GitHub Release sayfası elle açılacak (`gh` CLI yok).
8. `scratch/` betikleri ve `state.json`/`SESSION_LOG.md`/`AGENTS.md` git'e
   girmez (bilinçli `.gitignore`).

## 7. Sıradaki adımlar

1. **T41 arayüz tamamlama:** Güncelleme Politikası ekranına mod seçici
   (Kapalı/Günlük/Haftalık), "Şimdi kontrol et" düğmesi ve "yeni sürüm var"
   rozeti. Kapalıyken ağ isteği **sıfır**.
2. **T42/D3 P6** — cila + a11y: klavye tuş haritası (yardım metni), odak
   halkaları, boş/kırık durumlar, tekrar eden metinlerin temizlenmesi.
3. **T30** — global AI araç artıkları kanıtı (Ollama/LM Studio/GPT4All).
4. **T37** — yarım kalan güncelleme artıkları (gizli `.paket-rastgele` klasörler).
5. **1.1.0** yayını (arayüz + T41 kapanınca).

## 8. Dosya haritası (bu oturumda eklenen/değişen)

**Yeni (çekirdek):** `src/core/disk-usage.ts` · `src/core/categories.ts` ·
`src/core/findings.ts` · `src/core/update-check.ts` · `src/util/version.ts` ·
`src/actions/desktop-shortcut.ts`

**Yeni (arayüz):** `web/src/components/Rail.tsx` · `StatusStrip.tsx` ·
`ContextPanel.tsx` · `PlanWorkspace.tsx` · `ApprovalWall.tsx` ·
`FindingsView.tsx` · `CliFindingPanel.tsx` · `web/src/util/evidence-text.ts`

**Değişen:** `src/cli.ts` (sürüm bayrağı) · `src/actions/delete.ts`
(`PlannedCluster.key`) · `src/web/contract.ts` (`key`, `disk`, `findings`,
`updateCheck`, `DesktopShortcutView`) · `src/web/server.ts` (`/api/findings`,
`/api/update`, `/api/shortcut/desktop`) · `src/web/settings-store.ts` ·
`src/services/scan-service.ts` (disk ölçümü) · `vite.config.ts` (proxy) ·
`package.json` (dev scriptleri) · `web/src/App.tsx` (kabuk) ·
`web/src/api.ts` · `web/src/i18n.tsx` · `web/src/labels.ts` ·
`web/src/styles.css` · `docs/UI-REDESIGN-3COL.md` · `docs/GITHUB-METADATA.md`

**Testler:** `scratch/test-disk-usage.ts` · `scratch/test-findings.ts` ·
`scratch/test-desktop-shortcut.ts`

**Kaldırılan:** `web/src/util/categories.ts` (çekirdeğe taşındı) ·
`web/src/components/ConfirmDialog.tsx` kullanılmıyor (plan artık modal değil)
