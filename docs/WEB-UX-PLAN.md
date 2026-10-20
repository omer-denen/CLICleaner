# WEB UX PLANI — CLICleaner

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

- [ ] `@tanstack/react-virtual` ekle; görünen satırları sanallaştır.
- [ ] SSE olaylarını `item` düzeyine genişlet (mevcut `target-done` korunur).
- [ ] İstemci tamponu (100–200 ms batch), `requestAnimationFrame`.
- [ ] Kaydırma konusu korunur; "N yeni öğe" rozeti.
- [ ] Kararlı kimlik: cluster key + path hash (yinelenen item güncellenir).
- [ ] Bağlantı kopunca son olay kimliğiyle yeniden bağlan (`Last-Event-ID`).
- Not: bugünkü akış küme (cluster) düzeyinde; hedef (path) düzeyine inmek
  silme sözleşmesini değiştirir. Önce küme kimliğiyle sanallaştırma yapılır.

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
- [ ] Kasa ekranı: parti listesi, boyut, tek tık geri yükleme, kalan gün.
- [ ] Saklama süresi yalnızca bilgi; otomatik temizlik yok (OS Storage Sense
      zaten Recycle Bin'i yönetir; bizim kasamız kullanıcı onayıyla boşaltılır).
- [ ] Kalıcı silme: iki aşamalı onay + metin (mevcut `SIL` akışı korunur).

### Faz 8 — Güvenlik / UX cilası

- [x] 127.0.0.1 + token + Host/Origin (mevcut).
- [x] İstemci yol göndermez; plan anahtarları sunucuda çözülür (mevcut).
- [ ] Denylist genişletmesi (Belgeler/Masaüstü vb.) + yol doğrulama testleri.
- [ ] Klavye/odak/ekran okuyucu denetimi, açık/koyu tema, bildirim merkezi.
- [ ] Tutarlı boyut biçimlendirme (mevcut `formatBytes`).

## Çelişkiler ve varsayımlar

1. **Zamanlanmış silme:** "Direkt silme hiçbir zaman olmaz" ilkesiyle çelişir.
   Otomatik çalışan silme yapılmayacak; plan hatırlatıcı + onay üretecek.
2. **Karantina kararı (kullanıcı):** Windows Geri Dönüşüm Kutusu **iptal**.
   Silinen yollar aracın kendi kasasına taşınır
   (`%LOCALAPPDATA%\clicleaner\vault\<batch>`), manifest + `.restored-*`
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

## Varsayımlar

- Tek kullanıcılı yerel uygulama; çok kullanıcı/eşzamanlı tarayıcı yok.
- Tarama önbelleği `%LOCALAPPDATA%\clicleaner` altında; ayarlar aynı yerde.
- TTL varsayılanı 24 saat, 1–720 saat aralığında değiştirilebilir.
