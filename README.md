# CLICleaner

![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Lisans](https://img.shields.io/github/license/omer-denen/CLICleaner)
![Sürüm](https://img.shields.io/github/v/tag/omer-denen/CLICleaner?label=s%C3%BCr%C3%BCm)
![npm](https://img.shields.io/npm/v/clicleaner)

**Türkçe (varsayılan)** · [English](README.en.md)

**Windows'ta diskini dolduran ama "Program ekle/kaldır" listesinde görünmeyen
dosyaları bulur; ne olduğunu kanıtıyla gösterir; sen onaylamadan hiçbir şeyi
silmez.**

Önbellekler, paket depoları, yorumlayıcı ortamları, model ağırlıkları,
güncelleyici artıkları, kullanılmayan CLI'lar… Hepsi diskte yer kaplar ama
hangisinin silinebileceğini bilmek zordur. CLICleaner bunu tahminle değil,
diskte gördüğü **işaretlerle** yapar.

> **Hiçbir şey sen onaylamadan silinmez.** İlk tarama yalnızca listeler.

---

## 30 saniyede başla

1. **Node.js 22.6 veya üzeri** kurulu olsun → [nodejs.org](https://nodejs.org) (LTS).
2. **PowerShell**'i aç: Başlat → `PowerShell` yaz → aç.
3. Şunu yaz ve Enter'a bas:

   ```powershell
   npx clicleaner
   ```

4. Tarayıcı otomatik açılır. Açılmazsa terminalde yazan
   `http://localhost:<port>` adresini tarayıcıya yapıştır.
5. **İncele**'ye bas. Tarama sürerken solda taranan dizinleri, sağda bulunanları
   canlı görürsün.
6. Tarama bitince **Tamam** → listeyi incele.
7. Silmek istediklerini işaretle → **Planla ve onayla** → planı oku → `SIL` yaz →
   **Planı uygula**.

Varsayılan mod **Geri Dönüşüm Kutusu**'dur; yanlış karar verirsen geri
alabilirsin (`clicleaner undo --restore`).

### Hiç terminal kullanmadıysan

- `node --version` yaz; `v22.6.0` veya üzeri değilse nodejs.org'dan LTS kur.
- `npx clicleaner` ilk çalıştırmada paketi indirir; birkaç saniye sürer.
- Tarama büyük klasörlerde birkaç dakika sürebilir. **Taramayı iptal et**
  düğmesi her zaman vardır.
- Kapatmak için terminalde `Ctrl+C`.
- Hiçbir şeyi silmek zorunda değilsin; sadece listeye bakıp çıkabilirsin.

---

## AI kod araçları kullanıyorsan

> **AI araçlarında yeniysen** — ilk kez bir ajan veya model kurduysan — bu
> bölüm tam sana göre. Kıdemli bir geliştirici olsan da AI araçlarına yeni
> başlamış olabilirsin; fark etmez.

AI kod araçları arka planda çok şey indirir: model ağırlıkları, CUDA/cuDNN
runtime'ları, Python ortamları, paket önbellekleri, ajan oturumları ve
becerileri. Bunlar "Program ekle/kaldır" listesinde görünmez; hangisinin
yeniden indirilebilir, hangisinin **senin verin** olduğunu bilmek zordur.

CLICleaner bu ayrımı tahminle değil, kanıtla yapar:

| AI tarafında ne var? | CLICleaner ne yapar? |
|---|---|
| Ajan oturumları, beceriler, hafıza | **Korur.** Kullanıcı değeridir; silme hedefi üretmez. |
| Model ağırlıkları (ONNX/GGUF) | **Korur.** Yalnız kullanılamayan GPU varyantları/artıkları hedeflenir; CPU modelleri kalır. |
| CUDA / cuDNN / ORT runtime | Log "CPU" diyorsa ve runtime kullanılmıyorsa aday olur; yoksa dokunmaz. |
| Python / conda ortamları | Eski veya atıl olanları **raporlar**; projeye bağlı ortamlar korunur. |
| Paket önbellekleri (npm, uv, NuGet) | Yeniden indirilebildiği için güvenli aday. |
| Kullanılmayan CLI araçları | Kaldırma **planı** çıkarır; kendiliğinden kaldırmaz. |

### Basit sözlük

| Terim | Ne demek? |
|---|---|
| **Önbellek** | Tekrar indirilebilen dosyalar; silinince yeniden oluşur. |
| **Model** | AI'ın "beyni" olan büyük dosya; yeniden indirmek GB'larca olabilir. |
| **Runtime** | Modeli çalıştıran kütüphane; CPU ve GPU sürümleri vardır. |
| **Ortam (venv/conda)** | Bir projenin Python paketlerinin izole kurulumu. |
| **Ajan oturumu / beceri** | Sohbet geçmişi ve öğrenilmiş beceriler — **senin verin**. |
| **Shim** | Bir komutu çalıştıran küçük kısayol dosyası. |

> Kural: **Ajan verisi, beceri ve modeller asla otomatik silinmez.** Yalnız
> yeniden üretilebilir önbellekler ve kanıtla "kullanılamaz" olduğu gösterilen
> parçalar aday olur.

---

## Ne bulur, neye dokunmaz?

**Bulur (aday gösterir):**

| Kategori | Örnek |
|---|---|
| Paket önbellekleri | npm, NuGet, conda, uv |
| Yorumlayıcı ortamları | `.venv`, conda `envs/` |
| Model depoları | ONNX / GGUF ağırlıkları |
| GPU runtime artıkları | kullanılmayan CUDA DLL'leri |
| Güncelleyici artıkları | `app-<sürüm>`, updater klasörleri |
| CLI / ajan artıkları | eski sürümler, kullanılmayan araçlar |

**Dokunmaz:**

| Dokunmaz | Neden |
|---|---|
| Belgeler, fotoğraflar, projeler | taranmaz |
| Uygulama ayarları | yalnız `Cache` / `GPUCache` hedeflenir |
| Ajan oturumları ve becerileri | kullanıcı değeri taşır |
| Sanal diskler (`.vhd` / `.vhdx`) | yalnız raporlanır |
| SDK kurulumları | yalnız raporlanır |

---

## Neden güvenli?

- **Kanıt:** her kararın yanında "bunu neden öneriyorum" yazar
  (`CACHEDIR.TAG`, `.nupkg`, `model.onnx`, log satırı…).
- **İki aşama:** önce plan, sonra yazılı `SIL` onayı. Orta/yüksek riskte `--yes`
  bile bunu atlayamaz.
- **Geri dönüşüm kutusu:** varsayılan mod. Yanlışsa geri alabilirsin.
- **Hedefli silme:** klasörün tamamı değil, yalnız güvenli kısım silinir
  (ör. `Temp`'te 3 günden eski dosyalar).
- **Yerel:** arayüz yalnız `127.0.0.1` üzerinde çalışır; telemetri yoktur,
  hiçbir veri dışarı gitmez.
- **Açık kaynak:** MIT lisansı; kodu okuyabilir, kendin derleyebilirsin.

---

## İlk açılışta ne göreceksin?

1. **Tarama ekranı:** solda taranacak dizinler ve durumları
   (`✓` bulundu, `●` taranıyor, `○` bekliyor); sağda bulunanlar canlı listelenir.
2. **Liste:** `Tümü` / `Önerilen` / `Doğrulama` / `Rapor` / `Korunuyor`
   sekmeleri; boyut, risk, tarih veya ada göre sıralama.
3. **Plan:** seçtiğin her hedef, boyutu ve uygulanacak komut. Onay metni `SIL`.
4. **CLI'lar sekmesi:** kurulu araçlar, "atıl" kanıtları ve kaldırma planı
   (envanter salt okunurdur; hiçbir şeyi kendi başına kaldırmaz).

---

## Sık sorulanlar

**Sadece bakmak istiyorum, silmek istemiyorum.**
İncele; hiçbir şey silinmez. Terminalde `clicleaner clean --dry-run` yalnızca
planı gösterir.

**AI ajanımın sohbetleri, becerileri veya modeli silinir mi?**
Hayır. Ajan oturumları/becerileri kullanıcı verisi sayılır ve silme hedefi
üretmez. Modeller korunur; yalnız kanıtla "kullanılamayan" GPU artıkları aday
olur.

**Yanlış sildim.**
Geri dönüşüm kutusundan geri al: `clicleaner undo --restore`.

**Tarama neden uzun sürüyor?**
Diskteki en büyük klasörlerin boyutu ölçülüyor. İstediğin an
**Taramayı iptal et** ile durdurabilirsin.

**Node yok / sürüm eski.**
[nodejs.org](https://nodejs.org) LTS kur; `node --version` ile doğrula.

**Windows dışında çalışır mı?**
Şu an yalnızca Windows destekleniyor.

**Antivirüs uyarı verdi.**
Araç dosya silebilir. Önce `clicleaner clean --dry-run` ile plana bak; hiçbir
şey silinmez.

**Verilerim bir yere gönderiliyor mu?**
Hayır. Her şey yerel makinede çalışır.

**Nasıl kaldırırım?**
`npm uninstall -g clicleaner`. `npx` ile denediysen kurulum kalmaz.

---

## Kurulum (ayrıntılı)

### Gereksinimler

- **Windows 10/11** (64 bit)
- **Node.js 22.6 veya üzeri** — [nodejs.org](https://nodejs.org)
- Yönetici hakkı gerekmez.

```bash
node --version    # v22.6.0 veya üzeri olmalı
```

### 1) Kurulum yapmadan dene

```bash
npx clicleaner
```

### 2) Kalıcı kurulum

```bash
npm install -g clicleaner
clicleaner
```

### 3) Kaynaktan çalıştırma

```bash
git clone https://github.com/omer-denen/CLICleaner.git
cd CLICleaner
npm install
node bin/clicleaner.mjs
```

### Kaldırma ve veri konumu

```bash
npm uninstall -g clicleaner
```

- Araç verileri: `%LOCALAPPDATA%\clicleaner` — günlükler, plan günlükleri,
  24 saatlik tarama önbelleği ve yedek kasası. Silmekte sakınca yoktur.
- `npx` ile denediysen kurulum kalmaz; npm indirme önbelleği
  `npm cache clean` ile temizlenebilir.

### Sorun giderme

| Sorun | Çözüm |
|---|---|
| Tarayıcı açılmadı | Terminaldeki `http://localhost:<port>` adresini yapıştır |
| "Geçersiz token" | Sunucu her başlatmada yeni token üretir; eski sekmeyi kapat, yeni adresi kullan |
| TUI bozuk görünüyor | Ink gerçek bir terminal (TTY) ister; Windows Terminal veya PowerShell kullan |
| Uzun yol hataları | Araç `\\?\` önekini kullanır; `clicleaner doctor` ile doğrula |
| Windows dışı sistem | Şu an yalnızca Windows desteklenir |
| Eski bir sekme açık kaldı | Sunucu her başlatmada yeni token üretir; yeni adresi kullan |

---

## Kullanım

```bash
clicleaner                         # tarayıcı arayüzünü aç (önerilen)
clicleaner ui --tui                # terminal arayüzü (isteğe bağlı)
clicleaner scan                    # terminalde tara ve listele
clicleaner clean --dry-run         # yalnızca planı göster, hiçbir şey silme
clicleaner clean                   # iki aşamalı onay + geri dönüşüm kutusu
clicleaner clean --purge           # kalıcı silme (yazılı onay ister)
clicleaner inventory --verbose     # kurulu CLI envanteri (salt okunur)
clicleaner inventory --unused 21   # 21+ gündür kullanılmayanlar
clicleaner explain <küme>          # karar gerekçesini kanıtlarla göster
clicleaner log --summary           # son kararların özeti
clicleaner doctor                  # ortam kontrolü
clicleaner undo --restore          # geri dönüşüm kutusundan geri al
```

### Ortamlar (`--env`)

| Ortam | Kapsam |
|---|---|
| `dotfolders` | Ev dizinindeki `.*` klasörleri |
| `localappdata` | Yerel uygulama verisi |
| `roamingappdata` | Profil taşıyan uygulama verileri |
| `pkgcache` | npm / NuGet / conda / uv önbellekleri |
| `agent` | AI ajan oturum ve çalışma alanları |
| `runtime` | Derlenmiş yorumlayıcı ortamları |
| `temp` | Geçici dosyalar |
| `vdisk` | WSL / Docker / VM diskleri (yalnız raporlanır) |

### Profiller

| Profil | Davranış |
|---|---|
| `lean` | Yalnız güvenli önbellekler |
| `audit` | Her şeyi raporla, hiçbir şey silme |
| `full` | Tüm kategoriler, risk düzeyine göre onayla |

---

## Güvenlik modeli (ayrıntılı)

Kararlar üç seviyeye ayrılır:

- **Önerilen** — yeniden üretilebilir önbellekler; varsayılan seçili.
- **Doğrulama** — silmeden önce içeriği görmen gerekir; yazılı onay (`SIL`).
- **Rapor** — sanal disk, VPN ayarı, SDK kurulumu; **asla otomatik silinmez**.

Ek kapılar:

- Son savunma hattı `guard.ts`: korunan bir yolun (ev dizini, `%LOCALAPPDATA%`,
  Program Files, çalışan `node.exe`) **atası** hedef olamaz.
- Web arayüzünde istemci **yol göndermez**; yalnız küme anahtarı seçer.
  Silme önce plan (10 dk TTL), sonra yazılı onay ister.
- Silme işlemleri varsayılan olarak **geri dönüşüm kutusuna** gider.

## Mimari

```
bin/clicleaner.mjs        giriş noktası (tsx yükleyicisi)
src/
  core/
    types.ts              veri modeli (Cluster, Part, DeleteTarget, Verdict)
    walker.ts             paralel dosya sistemi yürüyücüsü (uzun yol destekli)
    classifier.ts         kanıt toplayıcı (dosya türü, dizin yapısı, log sinyalleri)
    analyze.ts            kanıt → mimari tip → karar + silme hedefleri
    merge.ts              uygulama bazlı kümeleme ve risk birleştirme
    discover.ts           dizin keşfi, ortam profilleri, korumalı yollar
    cli-inventory.ts      kurulu CLI'lar + atıllık kanıtı (salt okunur)
  actions/
    guard.ts              hedef güvenlik kapısı
    delete.ts             geri dönüşüm kutusu / kalıcı silme, günlük
    cli-backup.ts         yedek kasası (durum klasörleri)
    cli-remove.ts         paket yöneticisinin kendi uninstall'ı
  web/
    server.ts             yerel HTTP + SSE API (token, Host/Origin kapısı)
  commands/               scan · clean · inventory · explain · rules · doctor · undo · log · status · tui
web/                      React tarayıcı arayüzü (Vite)
```

### Uzun yol desteği

`npm-cache\_cacache` içinde MAX_PATH sınırını aşan yüzlerce yol vardır;
bunları atlamak 15 GB'lık bir önbelleği yanlış boyutlu raporlamak demektir.
Tüm dosya sistemi çağrıları `\\?\` önekiyle yapılır.

## Geliştirme

```bash
npm install
npm run typecheck          # kök + web tip kontrolü
npm run build:web          # web arayüzünü derle
node bin/clicleaner.mjs scan
```

## Sürümleme

CLICleaner [Semantic Versioning](https://semver.org/lang/tr/) kullanır:

| Değişiklik | Sürüm |
|---|---|
| Yeni özellik | MINOR (`0.1.0 → 0.2.0`) |
| Hata düzeltme | PATCH (`0.2.0 → 0.2.1`) |
| Geriye uyumsuz değişiklik | MAJOR (`1.0.0`) |

Her sürüm `vX.Y.Z` etiketiyle yayınlanır; insan okur özet
[CHANGELOG.md](CHANGELOG.md) içinde tutulur.

```bash
npm run release:patch   # hata düzeltme
npm run release:minor   # yeni özellik
npm run release:major   # geriye uyumsuz değişiklik
git push --follow-tags
```

## Lisans

MIT — bkz. [LICENSE](LICENSE).

CLICleaner hiçbir veriyi dışarı göndermez; arayüz yalnızca yerel makinede
çalışır. Silme kararı her zaman kullanıcıya aittir.
