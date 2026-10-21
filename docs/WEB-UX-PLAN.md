# WEB UX PLANI — Residue

> **ARŞİV (21.10.2026, sürüm 2.0.0):** Tarayıcı arayüzü projeden söküldü.
> Bu plan **uygulanmayacak**; tarihsel kayıt olarak durur. Faz 1-2 yapıldı,
> Faz 3-8 yapılmadı. Yeniden yapım planı: **`docs/WEB-REBUILD-PLAN.md`**.
>
> Durum: yaşayan plan. Fazlar sırayla uygulanır; her faz sonunda
> `typecheck` + `vite build` + ilgili test çalıştırılır.
> Çelişkiler ve varsayımlar bölümü kullanıcı kararı gerektirir.

## Fazlar

### Faz 1 — Tarama durumu, 24 saat bandı, ayarlar, plan görünümü (bu oturum)

- [x] Sunucu: `settings.json` (tarama önbelleği saat) + `GET/PUT /api/settings`.
- [x] Sunucu: `GET /api/scan/status` — `never | current | stale | scanning`,
      son tarama zamanı, yaş, TTL, sonraki önerilen zaman.
- [x] Sunucu: süresi dolmuş tarama sonucu da yüklenir (gösterilebilir),
      ancak "eski" işaretlenir; yeniden tarama **engellenmez**.
- [x] Sunucu: silme başladığında/CLI temizliğinden sonra diskteki
      `dirty.json` ile sonuç "eski" işaretlenir.
- [x] Web: üstte tutarlı tarama durumu rozeti + bilgi bandı
      ("Önceki sonuçları göster" / "Yine de yeniden tara").
- [x] Web: ayarlar modalı — 24 saat sabit kod değil.
- [x] Web: "Planla ve Uygula" ekranı risk gruplarına ayrılır; hedef yolları
      varsayılan kapalı, yüksek risk açık; özet üstte sabit.

### Faz 2 — Liste sanallaştırma + akış tamponu

- [x] `@tanstack/react-virtual` ekle; görünen satırları sanallaştır.
      `VirtualClusterList` disk listesini, `ScanFoundList` canlı "Bulunanlar"
      listesini sanallaştırır; satır yüksekliği `measureElement` ile ölçülür.
- [x] SSE olaylarını `item` düzeyine genişlet (mevcut `target-done` korunur).
      Sunucu her bulunan küme için `item` yayınlar; `done` sonucu değişmez.
- [x] İstemci tamponu (100–200 ms batch), `requestAnimationFrame`.
      `web/src/util/sse-batch.ts` (120 ms + rAF); terminal olaylarda `flush()`.
- [x] Kaydırma konusu korunur; "N yeni öğe" rozeti.
      Canlı liste kullanıcı aşağı kaydırdıysa konum atlamaz; sağ üstte rozet.
- [x] Kararlı kimlik: cluster key + path hash (yinelenen item güncellenir).
      `src/core/scan-items.ts` (`scanItemId`); istemci aynı kimliği günceller.
- [x] Bağlantı kopunca son olay kimliğiyle yeniden bağlan (`Last-Event-ID`).
      İstemci geçici kopmada EventSource'u kapatmaz (10 deneme sınırı).
- Not: silme sözleşmesi değişmedi. `item` kimliği küme + birincil yol
  özetidir; seçim/plan hâlâ küme anahtarıyla yapılır.

### Faz 3 — Tarama kapsamı ve ilerleme

- [ ] Taranacak kök dizinleri seçme (profil/AppData/PATH) + kalıcı ayar.
- [ ] Taranan/atlanan/erişilemeyen listeleri ayrı göster.
- [ ] Derinlik ve dışlama listesi ayarları; sembolik bağ döngüsü koruması
      (walker zaten korumalı; ayarlar bağlanacak).
- [ ] Duraklat/devam: `AbortController` yalnızca iptal eder; gerçek duraklatma
      için walker'a checkpoint gerekir. İlk sürümde "iptal + yeniden tara".
- [ ] Ağır sıralama/filtre tarama sürerken tamponlu.

### Faz 4 — Liste ekranı (kolonlar, seçim, gruplama)

- [ ] Kolonlar: ad, yol, tür, boyut, son erişim, risk, kurulum yöntemi.
- [ ] Shift/Ctrl çoklu seçim, "tümünü seç", sabit alt çubukta toplam boyut.
- [ ] Gruplama: araç / tür / kurulum yolu.
- [ ] Çift kurulumda "korunacak / eski" gerekçesi (envanterde var; web'e taşınır).
- [ ] Boş / iskelet / hata durumları ayrı tasarım.
- Not: `winget`/`scoop` kanalı bugün tespit edilmiyor; uydurulmaz,
  envanterde yalnızca gerçekten bilinen kaynak gösterilir.

### Faz 5 — Proje taraması

- [ ] Son kullanılan projeler listesi (yerel ayar).
- [ ] Proje içi / genel artıkları ayır; korumalı öğeler varsayılan seçilmez
      (T31 `project-artifact` + Git farkındalığı zaten report-only).

### Faz 6 — Planlama (zamanlanmış) ve geçmiş

- [ ] Plan şablonu: tek seferlik / günlük / haftalık, yaş/boyut/tür kuralları.
- [ ] **Çelişki:** otomatik (gözetimsiz) silme, "direkt silme yok" ilkesiyle
      çelişir. Öneri: plan yalnızca **hatırlatma + önizleme** üretir; silme
      her zaman kullanıcı onayıyla çalışır.
- [ ] Yalnızca Geri Dönüşüm Kutusu modu planlanabilir (kalıcı silme planlanamaz).
- [ ] Çalışma geçmişi (zaman, öğe, alan) — mevcut journal + yeni plan kaydı.

### Faz 7 — Geri dönüşüm / kalıcı silme

- [x] **Kasa:** Windows Geri Dönüşüm Kutusu iptal; `actions/vault.ts`
      (manifest, atomik rename, çakışmada `.restored-<zaman>`).
- [x] Kasa ekranı: parti listesi, boyut, tek tık geri yükleme, kalan gün.
- [x] Saklama süresi yalnızca bilgi; otomatik temizlik yok (OS Storage Sense
      zaten Recycle Bin'i yönetir; bizim kasamız kullanıcı onayıyla boşaltılır).
- [ ] Kalıcı silme: iki aşamalı onay + metin (mevcut `SIL` akışı korunur).

### Faz 8 — Güvenlik / UX cilası

- [x] 127.0.0.1 + token + Host/Origin (mevcut).
- [x] İstemci yol göndermez; plan anahtarları sunucuda çözülür (mevcut).
- [ ] Denylist genişletmesi (Belgeler/Masaüstü vb.) + yol doğrulama testleri.
- [ ] Klavye/odak/ekran okuyucu denetimi, açık/koyu tema, bildirim merkezi.
- [ ] Tutarlı boyut biçimlendirme (mevcut `formatBytes`).

### Faz 9 — Masaüstü kısayolu (token'li başlatma) — T40

Amaç: web arayüzündeki bir düğme, masaüstüne **Residue** kısayolu
eklesin; kısayol her çalıştırmada sunucuyu başlatsın, **yeni token** üretsin
ve tarayıcıyı doğrudan arayüze yönlendirsin.

- [ ] Server: `GET/POST/DELETE /api/shortcut/desktop`.
      Masaüstü yolu OS'ten alınır (`[Environment]::GetFolderPath('Desktop')`);
      OneDrive yönlendirmesi böylece kendiliğinden doğru olur.
- [ ] `.lnk` hedefi: global `residue` shim'i varsa `cmd.exe /k "<shim>" ui`;
      yoksa `process.execPath` + `bin/residue.mjs ui`. Yollar tırnaklanır.
- [ ] **Token .lnk içine YAZILMAZ.** Her başlatmada `runWeb` rastgele token
      üretir ve `?token=` ile tarayıcıyı açar (mevcut davranış).
- [ ] UI: **Ayarlar → Masaüstüne kısayol ekle**; durum + tam yol + **Kaldır**.
      Kaldırma yalnızca bizim oluşturduğumuz kısayolu siler (Description
      işareti doğrulanır).
- [ ] Tek örnek: ikinci çalıştırma yeni port/tarayıcı açmak yerine uyarır
      (token diske yazılmaz; istenirse yalnız "zaten çalışıyor" denir).
- [ ] Test: `RESIDUE_DESKTOP` ile sentetik masaüstü; oluştur/oku/sil;
      boşluklu ve Türkçe karakterli yol; `.lnk` içinde token yok.
- Not: konsol penceresi kapanırsa sunucu da kapanır (bilinçli: kullanıcı
  durdurabilsin). Simge/ikon ayrı iştir; ilk sürüm Node ikonunu kullanır.

### Faz 10 — Sürüm / güncelleme bildirimi — T41 (önce karar)

**Soru:** Kullanıcı yeni sürüm çıktığını nasıl öğrenecek? Bugün **hiçbir
mekanizma yok**: uygulama yerel çalışır, telemetri göndermez ve kendini
güncellemez. `npx` kullanıcısı bir sonraki çalıştırmada zaten yeni sürümü
alır; **global kurulum** yapan kullanıcı ise `npm i -g residue-cleaner` yapmadıkça
eski sürümde kalır.

Seçenekler:

1. **Hiç kontrol yok (bugünkü durum).** "Veri dışarı gitmez" sözü aynen
   korunur; kullanıcı sürümü tesadüfen öğrenir. En az sürpriz, en zayıf
   keşfedilebilirlik.
2. **Elle kontrol:** Ayarlar → "Sürümü kontrol et" + `residue update`
   (yalnız kontrol, kurulum yok). Tek tıkla tek HTTPS isteği; varsayılan
   **kapalı**. "Veri dışarı gitmez" sözü bozulmaz.
3. **Otomatik kontrol (varsayılan açık), 24 saat önbellekli.**
   `https://registry.npmjs.org/residue-cleaner/latest` adresine yalnız sürüm
   sorgusu; kimlik/telemetri yok, sonuç `%LOCALAPPDATA%\residue\update.json`
   içinde saklanır. Üst barda bloklamayan "Yeni sürüm var" rozeti +
   `npm i -g residue-cleaner` kopyalama düğmesi. README'deki "hiçbir veri dışarı
   gönderilmez" cümlesi **"telemetri yok; isteğe bağlı sürüm kontrolü"**
   olarak düzeltilmeli.
4. **npm `update-notifier`**: CLI çıkışında uyarı basar; web arayüzü
   kullanıcısını (ürünün ana girişi) görmez. Ek bağımlılık + varsayılan
   ağ erişimi. Önerilmez.
5. **Arka plan servisi / tepsi simgesi**: sürekli çalışan süreç, Windows
   başlangıcı ve ayrı güncelleme kanalı gerektirir; kapsam dışı.

**Öneri:** 2 + 3 birlikte — varsayılan **kapalı** otomatik kontrol, ayarlarda
"Güncelleme kontrolü: kapalı / günlük / haftalık", ayrıca "Şimdi kontrol et".
Kullanıcı açtığında tek istek, 24 saat önbellek, çevrimdışıysa sessiz geç.
Kendi kendine güncelleme **yok** (npm kurulumunu web arayüzünden çalıştırmak
güvenlik riski); yalnız komut gösterilir.

- [x] **"Güncelleme Politikası" bilgi ekranı** (Ayarlar): bugünkü davranış,
      neden kontrol, ne gönderilir, sonuç ve **manuel güncelleme adresleri**
      (GitHub Releases + npm). Ağ isteği YAPMAZ; yalnız bilgilendirir.
- [x] README TR/EN: "Güncelleme" bölümü + manuel komutlar + iki adres.
- [ ] `GET /api/update` (önbellekli) + `POST /api/update/check` (zorla).
- [ ] Ayar: `updateCheck: 'off' | 'daily' | 'weekly'`, varsayılan `off`.
- [ ] Üst bar rozeti + ayar satırı + komut kopyalama.
- [ ] CLI: `residue update` (yalnız kontrol) ve `--no-update-check`.
- [ ] Test: `RESIDUE_UPDATE_URL` ile sentetik kayıt; TTL, çevrimdışı,
      kapalıyken istek yok.
- [ ] README veri politikası cümlesini netleştir (otomatik kontrol eklenince).

## Çelişkiler ve varsayımlar

1. **Zamanlanmış silme:** "Direkt silme hiçbir zaman olmaz" ilkesiyle çelişir.
   Otomatik çalışan silme yapılmayacak; plan hatırlatıcı + onay üretecek.
2. **Karantina kararı (kullanıcı):** Windows Geri Dönüşüm Kutusu **iptal**.
   Silinen yollar aracın kendi kasasına taşınır
   (`%LOCALAPPDATA%\residue\vault\<batch>`), manifest + `.restored-*`
   çakışma çözümü vardır. Araştırma notu: Windows Storage Sense zaten
   Recycle Bin'i yaş/kota ile temizler; bu yüzden ayrı bir otomatik
   temizlik YAPILMAZ, saklama yalnızca bilgi olarak gösterilir.
3. **İstemciden yol:** Mevcut sözleşme bilinçli olarak yol kabul etmez.
   Yol doğrulama "sunucu tarama sonucundan gelen anahtarları çöz" şeklinde.
4. **Dosya sistemi değişikliği:** Tüm diski izlemek pahalı. "Eski" işareti
   silme sonrası, ayar değişimi ve TTL ile belirlenir; FS watcher eklenmez.
5. **Duraklat:** walker checkpoint'i yok; ilk sürümde iptal + yeniden tarama.
6. **Winget/scoop:** kanıt yoksa gösterilmez; envanter kaynakları gerçektir.
7. **SSE item düzeyi:** mevcut küme akışı korunur; item olayları ek katman
   olarak eklenir, silme sözleşmesi değişmez.
8. **Masaüstü kısayolu:** kısayol yalnızca başlatıcıdır; token, port ve
   oturum bilgisi `.lnk` içine yazılmaz. Her çalıştırmada yeni token üretilir.
   Kısayol kaldırılırken hedefin bizim oluşturduğumuz kısayol olduğu doğrulanır.
9. **Güncelleme kontrolü:** "hiçbir veri dışarı gitmez" ilkesiyle çelişir.
   Karar: otomatik kontrol **varsayılan kapalı**; yalnız kullanıcı açarsa
   `registry.npmjs.org` üzerinden tek sürüm sorgusu yapılır. README'deki
   ifade buna göre netleştirilecek; kendi kendine güncelleme olmayacak.

## Varsayımlar

- Tek kullanıcılı yerel uygulama; çok kullanıcı/eşzamanlı tarayıcı yok.
- Tarama önbelleği `%LOCALAPPDATA%\residue` altında; ayarlar aynı yerde.
- TTL varsayılanı 24 saat, 1–720 saat aralığında değiştirilebilir.
