# Residue

![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Lisans](https://img.shields.io/github/license/omer-denen/residue-cleaner)
![Sürüm](https://img.shields.io/github/v/tag/omer-denen/residue-cleaner?label=s%C3%BCr%C3%BCm)
![npm](https://img.shields.io/npm/v/residue-cleaner)

**Türkçe (varsayılan)** · [English](README.en.md)

**CLI temizleyici ve kanıt denetleyicisi.** AI kod araçları ve geliştirici
araçları arkalarında CLI önbellekleri, model depoları, sanal ortamlar, oturumlar
ve güncelleyici artıkları bırakır; bunlar Windows "Program ekle/kaldır"
listesinde **görünmez**. Residue bu klasörleri **adına göre
değil, içindeki kanıta göre** tanır: ne olduğunu, silersen tam olarak ne
olacağını ve kararın gerekçesini gösterir.

> **Bu bir Windows disk temizleyici değildir.** Genel disk temizliği, kayıt
> defteri/PATH onarımı, "PC hızlandırma" veya yer açma aracı değildir. Kapsamı
> yalnızca geliştirici ve AI araçlarının bıraktığı, Windows'un listelemediği
> artıklardır. **Hiçbir şey sen onaylamadan silinmez;** ilk tarama yalnızca
> listeler.

---

## Kapsam ve sınırlar

| Yapmaz | Neden |
|---|---|
| Kayıt defteri / PATH / "Program ekle-kaldır" girdilerine **varsayılan olarak** dokunmaz | Genel Windows bakımı değildir; ancak `residue env` ile **açık onay + yedek** alınarak PATH temizliği yapılabilir |
| Belgelerini, fotoğraflarını, projelerini "yer açmak için" silmez | Bu klasörler karar kapsamına girmez |
| Tanımadığı klasörü adına bakarak silmez | Kanıt yoksa "tanımlanamayan" der ve **yalnızca raporlar** |
| Model, ajan oturumu ve becerileri silmez | Senin verindir; silme hedefi üretilmez |
| Kendi verisini (günlük, yedek kasası) silmez | Araç kendi veri dizinini hedeflemez |

Aradığı şey tek bir sorunun kanıtlı cevabıdır: **"Bu klasör ne, silsem ne olur?"**

---

## 30 saniyede başla

1. **Node.js 22.6 veya üzeri** kurulu olsun → [nodejs.org](https://nodejs.org) (LTS).
2. **PowerShell**'i aç: Başlat → `PowerShell` yaz → aç.
3. Şunu yaz ve Enter'a bas:

   ```powershell
   npx residue-cleaner scan
   ```

4. Araç geliştirici ve AI araçlarının bıraktığı klasörleri tarar; her birini
   **ne olduğu, silinirse ne olacağı ve gerekçesiyle** listeler. Ölçüm büyük
   klasörlerde birkaç dakika sürebilir; `Ctrl+C` ile durdurabilirsin.
5. Silmek istediklerini seç → `residue clean` → planı oku → orta/yüksek risk
   için `SIL` yaz → onayla.

Varsayılan mod **aracın kendi kasası**dır; yanlış karar verirsen geri
alabilirsin (`residue undo --restore`).

> **2.0.0 notu:** Proje yeniden adlandırıldı: **Residue** (npm paketi
> `residue-cleaner`, komut `residue`). Tarayıcı arayüzü de bu sürümde
> kaldırıldı; araç artık **yalnızca terminalden** çalışır. Arayüzün yeniden
> yapımı planlanıyor: [docs/WEB-REBUILD-PLAN.md](docs/WEB-REBUILD-PLAN.md).
>
> Eski ad `clicleaner` idi. Verilerin (kasa, günlük) taşındığı yer:
> `%LOCALAPPDATA%\residue`.

### Hiç terminal kullanmadıysan

- `node --version` yaz; `v22.6.0` veya üzeri değilse nodejs.org'dan LTS kur.
- `npx residue-cleaner scan` ilk çalıştırmada paketi indirir; birkaç saniye sürer.
- `npx residue-cleaner` komut listesi ve yardım metnini gösterir.
- Hiçbir şeyi silmek zorunda değilsin; `residue clean --dry-run` yalnızca
  planı gösterir.

---

## AI kod araçları kullanıyorsan

> **AI araçlarında yeniysen** — ilk kez bir ajan veya model kurduysan — bu
> bölüm tam sana göre. Kıdemli bir geliştirici olsan da AI araçlarına yeni
> başlamış olabilirsin; fark etmez.

AI kod araçları arka planda çok şey indirir: model dosyaları, GPU kütüphaneleri,
Python ortamları, paket önbellekleri, ajan oturumları ve becerileri. Bunlar
"Program ekle/kaldır" listesinde görünmez; hangisinin yeniden indirilebilir,
hangisinin **senin verin** olduğunu bilmek zordur.

| AI tarafında ne var? | Residue ne yapar? |
|---|---|
| Ajan oturumları, beceriler, hafıza | **Korur.** Kullanıcı değeridir; silme hedefi üretmez. |
| Ajan çalışma alanındaki eklenti bağımlılıkları | **Raporlanır.** Yeniden kurulabilir; beceri ve plan dosyaları korunur. |
| Model dosyaları | **Korur.** Yalnız kullanılamayan GPU artıkları aday olur; CPU modelleri kalır. |
| GPU kütüphaneleri | Kullanılmadığı kanıtlanırsa aday olur; yoksa dokunmaz. |
| Python / conda ortamları | Eski veya atıl olanları **raporlar**; projeye bağlı olanlar korunur. |
| Paket önbellekleri | Yeniden indirilebildiği için güvenli aday. |
| Kullanılmayan CLI araçları | Kaldırma **planı** çıkarır; kendiliğinden kaldırmaz. |

### Basit sözlük

| Terim | Ne demek? |
|---|---|
| **Önbellek** | Tekrar indirilebilen dosyalar; silinince yeniden oluşur. |
| **Model** | AI'ın "beyni" olan büyük dosya; yeniden indirmek GB'larca olabilir. |
| **Ortam** | Bir projenin Python paketlerinin izole kurulumu. |
| **Ajan oturumu / beceri** | Sohbet geçmişi ve öğrenilmiş beceriler — **senin verin**. |

> Kural: **Ajan verisi, beceri ve modeller asla otomatik silinmez.** Yalnız
> yeniden üretilebilir önbellekler ve kanıtla "kullanılamaz" olduğu gösterilen
> parçalar aday olur.

---

## Ne bulur, neye dokunmaz?

**Bulur (aday gösterir):**

| Kategori | Örnek |
|---|---|
| Paket önbellekleri | npm, NuGet, conda, uv |
| Yorumlayıcı ortamları | `.venv`, conda ortamları |
| Model depoları | ONNX / GGUF dosyaları |
| GPU artıkları | kullanılmayan CUDA kütüphaneleri |
| Güncelleyici artıkları | updater klasörleri, eski sürümler |
| CLI / ajan artıkları | kullanılmayan araçlar |

**Dokunmaz:**

| Dokunmaz | Neden |
|---|---|
| Belgeler, fotoğraflar, projeler | taranmaz |
| Uygulama ayarları | yalnız önbellek klasörleri hedeflenir |
| Ajan oturumları ve becerileri | kullanıcı değeri taşır |
| Git tarafından takip edilen dosyalar | sürüm kontrolündeki dosya asla silinmez |
| Sanal diskler | yalnız raporlanır |
| SDK kurulumları | yalnız raporlanır |
| Aracın kendi veri dizini | günlük ve yedek kasası orada yaşar |

---

## Proje taraması: kendi projenin artıkları

Bir projenin içindeki `node_modules`, `.venv`, `dist` gibi artıkları görmek
istersen taranacak klasörü sen seçersin:

```bash
residue scan --root C:\projeler\uygulamam
```

Bu modda:

- Sonuçlar **salt rapordur**: hiçbir silme hedefi üretilmez.
- `.git` klasörü taranmaz; Git tarafından **takip edilen (tracked)** dosyalar
  hedef olamaz. Yalnız untracked veya `.gitignore` içindeki yollar değerlendirilir.
- Proje taraması, sisteminizin 24 saatlik tarama önbelleğini değiştirmez.

---

## Neden güvenli?

- **Kanıt:** her kararın yanında "bunu neden öneriyorum" yazar; kanıt yetersizse
  araç "tanımlanamayan" der ve yalnızca raporlar.
- **İki aşama:** önce plan, sonra yazılı `SIL` onayı. `--yes` bunu atlayamaz.
- **Kasa:** varsayılan mod; silinenler aracın kendi kasasına taşınır ve geri alınabilir.
- **Journal:** her yıkıcı adım önce yazılır; yarım kalan işlem `residue recover` ile raporlanır.
- **Kanıt ağacı:** her öneri gözlem → kanıt → iddia zinciriyle açıklanır.
- **Bağımlılık grafiği:** sert/aktif bir bağımlılık kopacaksa CLI kaldırma planı engellenir.
- **Ortam değişkenleri:** hassas değerler maskelenir; yazma yalnız `env --clean --apply` + yedek + yazılı onayla yapılır.
- **Hedefli silme:** klasörün tamamı değil, yalnız güvenli kısım silinir.
- **Git farkındalığı:** tracked dosya hedef olamaz; proje taramaları salt rapordur.
- **Son savunma hattı:** silme katmanı, korunan bir yolun üstünü veya aracın
  kendi veri dizinini hedef almışsa silmeyi reddeder.
- **Yerel ve açık:** araç yalnızca bu bilgisayarda çalışır; telemetri yoktur,
  kod MIT lisanslıdır.

---

## Sık sorulanlar

**Sadece bakmak istiyorum, silmek istemiyorum.**
İncele; hiçbir şey silinmez. Terminalde `residue clean --dry-run` yalnızca
planı gösterir.

**AI ajanımın sohbetleri, becerileri veya modeli silinir mi?**
Hayır. Ajan oturumları ve beceriler kullanıcı verisi sayılır. Modeller korunur;
yalnız kanıtla "kullanılamayan" GPU artıkları aday olur.

**Projemin içindeki `node_modules` silinir mi?**
Proje taraması (`--root`) hiçbir zaman silme hedefi üretmez; yalnız raporlar.
Git tarafından takip edilen dosyalar zaten her koşulda korunur.

**Yanlış sildim.**
Kasadan geri al: `residue undo --restore`.

**Bağımsız bir aracı silmeden devre dışı bırakabilir miyim?**
Evet. Karantinaya al: `residue quarantine <ad>`. Shim kasaya taşınır (komut
PATH'ten düşer), verilerin yerinde kalır; geri alma adımları kasaya yazılır.

**Tarama neden uzun sürüyor?**
Diskteki en büyük klasörlerin boyutu ölçülüyor. İstediğin an
**Taramayı iptal et** ile durdurabilirsin.

**Node yok / sürüm eski.**
[nodejs.org](https://nodejs.org) LTS kur; `node --version` ile doğrula.

**Windows dışında çalışır mı?**
Şu an yalnızca Windows destekleniyor.

**Antivirüs uyarı verdi.**
Araç dosya silebilir. Önce `residue clean --dry-run` ile plana bak; hiçbir
şey silinmez.

**Verilerim bir yere gönderiliyor mu?**
Hayır. Her şey yerel makinede çalışır.

**Nasıl kaldırırım?**
`npm uninstall -g residue-cleaner`. `npx` ile denediysen kurulum kalmaz.

---

## Kurulum

**Gereksinimler:** Windows 10/11 ve Node.js 22.6+ ([nodejs.org](https://nodejs.org)).
Yönetici hakkı gerekmez.

```bash
npx residue-cleaner scan     # kurulum yapmadan dene
npm install -g residue-cleaner   # kalıcı kurulum
residue                  # komut listesini göster
```

Kurulumdan sonra komut **`residue`**'dir (`residue-cleaner` da aynı işi görür).

Kaynaktan çalıştırmak için:

```bash
git clone https://github.com/omer-denen/residue-cleaner.git
cd residue-cleaner
npm install
npm start
```

**Kaldırma:** `npm uninstall -g residue-cleaner`.
Araç verileri `%LOCALAPPDATA%\residue` altındadır (günlükler, tarama
önbelleği, yedek kasası). **Araç bu dizini kendi taramalarında hedef olarak
göstermez ve silmez**; yedek kasası orada yaşadığı için elle de silmemek
gerekir.

| Sorun | Çözüm |
|---|---|
| "Geçersiz token" | API sunucusu her başlatmada yeni token üretir; eski adresi kapat |
| Terminal arayüzü bozuk | Gerçek bir terminal (PowerShell / Windows Terminal) kullan |
| Windows dışı sistem | Şu an yalnızca Windows desteklenir |

---

## Kullanım

```bash
residue                     # komut listesi ve yardım
residue scan                # terminalde tara ve listele
residue scan --root .       # proje içi artıkları yalnız raporla
residue clean --dry-run     # yalnızca planı göster, hiçbir şey silme
residue clean               # iki aşamalı onay + kasa (geri alınabilir)
residue undo --restore      # kasadan geri al
residue repair --dry-run    # bozuk / yarım kurulumları göster
residue repair              # onar (ONAR onayı; çıktı canlı akar)
residue quarantine <ad>     # bağımsız aracı silmeden kasaya taşı (KARANTINA onayı)
residue env                 # PATH / ortam değişkeni analizi (salt okunur)
residue env --clean         # PATH temizlik planı (yazmaz)
residue project [dir]       # proje bağımlılıkları + yeniden kurulum tarifi
residue graph               # CLI bağımlılık grafiği; --what-if <ad>
residue schedule            # planlı kasa temizliği (günlük/haftalık)
residue vault               # kasa envanteri / saklama / kalıcı silme
residue recover             # yarım kalan işlemleri raporla
residue ui                  # terminal arayüzü (Ink; gerçek terminal gerekir)
residue api                 # başsız HTTP/SSE API (arayüz yok; 127.0.0.1)
```

Daha fazlası için: `residue help`

---

## Güncelleme

Otomatik güncelleme kontrolü **yoktur** (planlanan davranış: varsayılan kapalı).
Manuel güncelleme:

```bash
npm i -g residue-cleaner        # global kurulumu güncelle
npx residue-cleaner@latest      # kurulum yapmadan en güncel sürümü çalıştır
```

- npm: <https://www.npmjs.com/package/residue-cleaner>
- GitHub sürümleri: <https://github.com/omer-denen/residue-cleaner/releases>

Otomatik sürüm kontrolü **kapalıdır** (varsayılan: hiçbir ağ isteği yapılmaz).

---

## Lisans

MIT — bkz. [LICENSE](LICENSE).

Residue hiçbir veriyi dışarı göndermez; tüm işlemler yerel makinede
çalışır. Silme kararı her zaman kullanıcıya aittir.
