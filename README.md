# CLICleaner

![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Lisans](https://img.shields.io/github/license/omer-denen/CLICleaner)
![Sürüm](https://img.shields.io/github/v/tag/omer-denen/CLICleaner?label=s%C3%BCr%C3%BCm)
![npm](https://img.shields.io/npm/v/clicleaner)

**Türkçe (varsayılan)** · [English](README.en.md)

**Windows'ta diskini dolduran ama "Program ekle/kaldır" listesinde görünmeyen
dosyaları bulur; ne olduğunu kanıtıyla gösterir; sen onaylamadan hiçbir şeyi
silmez.**

Önbellekler, model dosyaları, Python ortamları, güncelleyici artıkları,
kullanılmayan CLI'lar… Hangisinin silinebileceğini bilmek zordur. CLICleaner
bunu tahminle değil, diskte gördüğü işaretlerle yapar.

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
- Kapatmak için terminalde `Ctrl+C`. Hiçbir şeyi silmek zorunda değilsin.

---

## AI kod araçları kullanıyorsan

> **AI araçlarında yeniysen** — ilk kez bir ajan veya model kurduysan — bu
> bölüm tam sana göre. Kıdemli bir geliştirici olsan da AI araçlarına yeni
> başlamış olabilirsin; fark etmez.

AI kod araçları arka planda çok şey indirir: model dosyaları, GPU kütüphaneleri,
Python ortamları, paket önbellekleri, ajan oturumları ve becerileri. Bunlar
"Program ekle/kaldır" listesinde görünmez; hangisinin yeniden indirilebilir,
hangisinin **senin verin** olduğunu bilmek zordur.

| AI tarafında ne var? | CLICleaner ne yapar? |
|---|---|
| Ajan oturumları, beceriler, hafıza | **Korur.** Kullanıcı değeridir; silme hedefi üretmez. |
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
| Sanal diskler | yalnız raporlanır |
| SDK kurulumları | yalnız raporlanır |

---

## Neden güvenli?

- **Kanıt:** her kararın yanında "bunu neden öneriyorum" yazar.
- **İki aşama:** önce plan, sonra yazılı `SIL` onayı. `--yes` bunu atlayamaz.
- **Geri dönüşüm kutusu:** varsayılan mod; yanlışsa geri alabilirsin.
- **Hedefli silme:** klasörün tamamı değil, yalnız güvenli kısım silinir.
- **Yerel ve açık:** arayüz yalnız bu bilgisayarda çalışır; telemetri yoktur,
  kod MIT lisanslıdır.

---

## Sık sorulanlar

**Sadece bakmak istiyorum, silmek istemiyorum.**
İncele; hiçbir şey silinmez. Terminalde `clicleaner clean --dry-run` yalnızca
planı gösterir.

**AI ajanımın sohbetleri, becerileri veya modeli silinir mi?**
Hayır. Ajan oturumları ve beceriler kullanıcı verisi sayılır. Modeller korunur;
yalnız kanıtla "kullanılamayan" GPU artıkları aday olur.

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

## Kurulum

**Gereksinimler:** Windows 10/11 ve Node.js 22.6+ ([nodejs.org](https://nodejs.org)).
Yönetici hakkı gerekmez.

```bash
npx clicleaner              # kurulum yapmadan dene
npm install -g clicleaner   # kalıcı kurulum
clicleaner                  # tarayıcı arayüzünü aç
```

Kaynaktan çalıştırmak için:

```bash
git clone https://github.com/omer-denen/CLICleaner.git
cd CLICleaner
npm install
npm start
```

**Kaldırma:** `npm uninstall -g clicleaner`.
Araç verileri `%LOCALAPPDATA%\clicleaner` altındadır (günlükler, tarama
önbelleği, yedek kasası); silmekte sakınca yoktur.

| Sorun | Çözüm |
|---|---|
| Tarayıcı açılmadı | Terminaldeki `http://localhost:<port>` adresini yapıştır |
| "Geçersiz token" | Sunucu her başlatmada yeni token üretir; eski sekmeyi kapat |
| Terminal arayüzü bozuk | Gerçek bir terminal (PowerShell / Windows Terminal) kullan |
| Windows dışı sistem | Şu an yalnızca Windows desteklenir |

---

## Kullanım

```bash
clicleaner                     # tarayıcı arayüzü (önerilen)
clicleaner scan                # terminalde tara ve listele
clicleaner clean --dry-run     # yalnızca planı göster, hiçbir şey silme
clicleaner clean               # iki aşamalı onay + geri dönüşüm kutusu
clicleaner undo --restore      # geri dönüşüm kutusundan geri al
clicleaner ui --tui            # terminal arayüzü (isteğe bağlı)
```

Daha fazlası için: `clicleaner help`

---

## Lisans

MIT — bkz. [LICENSE](LICENSE).

CLICleaner hiçbir veriyi dışarı göndermez; arayüz yalnızca yerel makinede
çalışır. Silme kararı her zaman kullanıcıya aittir.
