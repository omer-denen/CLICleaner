# CLICleaner

![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Lisans](https://img.shields.io/github/license/omer-denen/CLICleaner)
![Sürüm](https://img.shields.io/github/v/tag/omer-denen/CLICleaner?label=s%C3%BCr%C3%BCm)
![npm](https://img.shields.io/npm/v/clicleaner)

**Türkçe (varsayılan)** · [English](README.en.md)

Windows'ta geliştiricilerin diskini dolduran **önbellekleri, paket depolarını,
yorumlayıcı ortamlarını ve CLI artıklarını** kanıtlara dayanarak bulan,
hiçbir şeyi onayın olmadan silmeyen temizleyici.

> **Hiçbir şeyi adına göre değil, kanıta göre sınıflandır.**
> Kararı gerekçesiyle göster. Silmeyi iki aşamada onaylat.

---

## Neden?

Kod yazan bir bilgisayarda yer kaplayan şeyler tek bir uygulamaya ait değil:
npm/NuGet/conda/uv önbellekleri, `.venv` ve conda ortamları, AI ajanlarının
oturum klasörleri, güncelleyici artıkları, yarım inmiş modeller. Windows
"Program ekle/kaldır" listesinde görünmezler; ne olduklarını bilmeden
silmek de risklidir.

CLICleaner bu klasörleri **adına bakmadan** tanır. Kaynak kodda `opencode`,
`claude` gibi bir uygulama adı geçmez; yalnızca diskte gözlenen işaretler
okunur:

| Gözlem | Çıkarım |
|---|---|
| `CACHEDIR.TAG` | Bu klasör bir önbellek (npm, conda, uv, pip standardı) |
| `packages/<paket>/<sürüm>/*.nupkg` | NuGet paket deposu |
| `model.onnx` + `tokenizer.json` | Yerel AI model deposu |
| `cuDNN` / `cuBLAS` / `onnxruntime_providers_cuda.dll` | GPU hızlandırıcı runtime |
| `pyvenv.cfg`, `conda-meta`, `envs/`, `site-packages` | Derlenmiş yorumlayıcı ortamı |
| `.vhd` / `.vhdx` | Sanal disk — **asla otomatik silinmez** |
| Log'da `Device: CPU` + CUDA DLL'leri | İndirilmiş ama kullanılamayan runtime |
| `skills/` + `SKILL.md` veya `.skill-lock.json` | Ajan çalışma alanı — **kullanıcı değeri** |
| `extensions/` + `extensions.json` | Editör uzantı deposu (eski sürümler hedeflenir) |
| `app-<sürüm>` + `Update.exe` | Sürümlü uygulama deposu (en güncel sürüm korunur) |

Yeni bir araç çıktığında kural eklemek gerekmez: aynı işaretlerle tanınır.

## Öne çıkanlar

- **Kanıt zinciri:** her karar "hangi gözleme dayanıyor" sorusunu yanıtlar
  (`clicleaner explain <küme>`).
- **Hedefli silme:** klasörün tamamı değil, yalnız güvenli kısım silinir
  (ör. `Temp`'te 3 günden eski dosyalar, Electron'da yalnız `Cache`).
- **İki aşamalı onay:** plan → yazılı onay. Orta/yüksek riskte `SIL` yazmak
  zorunludur; `--yes` bunu atlayamaz.
- **Canlı tarama:** tarama sürerken taranan dizinler ve bulunan kümeler anlık
  listelenir; iptal sunucudaki işi gerçekten durdurur.
- **Kullanılmayan CLI envanteri:** kurulu araçları ve "atıl" kanıtlarını
  (shim erişimi, durum klasörü, kabuk geçmişi) raporlar; kaldırma paket
  yöneticisinin kendi komutuyla yapılır.
- **Yerel ve sessiz:** arayüz yalnız `127.0.0.1` üzerinde çalışır, her
  başlatmada rastgele token üretir; telemetri yoktur.

## Kurulum

### Gereksinimler

- **Windows 10/11** (64 bit)
- **Node.js 22.6 veya üzeri** — [nodejs.org](https://nodejs.org)
- Yönetici hakkı gerekmez; araç yalnızca kullanıcı klasörlerini okur.

Sürümü doğrula:

```bash
node --version    # v22.6.0 veya üzeri olmalı
```

### 1) Kurulum yapmadan dene

```bash
npx clicleaner ui --web
```

Tarayıcı otomatik açılır. Açılmazsa terminalde yazan adresi kullan
(token içerir; her başlatmada değişir).

### 2) Kalıcı kurulum

```bash
npm install -g clicleaner
clicleaner ui --web
```

### 3) Kaynaktan çalıştırma

```bash
git clone https://github.com/omer-denen/CLICleaner.git
cd CLICleaner
npm install
node bin/clicleaner.mjs ui --web
```

### İlk çalıştırma — web arayüzü

1. **İncele**'ye bas. Tarama sürerken solda taranan dizinler, sağda bulunan
   kümeler canlı listelenir.
2. Tarama bitince **"Tarama tamamlandı"** diyaloğu çıkar; **Tamam** ile listeye geç.
3. Kümeleri sekmelerden incele: `Önerilen` / `Doğrulama` / `Rapor` / `Korunuyor`.
   Boyut, risk, tarih veya ada göre sıralayabilirsin.
4. Silmek istediklerini işaretle → **Planla ve onayla**.
5. Plan ekranını oku → onay kutusunu işaretle (yüksek risk varsa) → `SIL` yaz →
   **Planı uygula**.
6. Varsayılan mod **geri dönüşüm kutusu**'dur; yanlış karar verirsen geri
   döndürebilirsin. Kalıcı silme ayrı bir moddur ve geri alınamaz.

`CLI'lar` sekmesinde kurulu araçları, atıllık kanıtlarını ve kaldırma planlarını
görebilirsin (envanter salt okunurdur).

### İlk çalıştırma — terminal

```bash
clicleaner scan                    # tara ve listele
clicleaner clean --dry-run         # yalnızca planı göster, hiçbir şey silme
clicleaner clean                   # iki aşamalı onay + geri dönüşüm kutusu
clicleaner inventory --verbose     # kurulu CLI envanteri (salt okunur)
clicleaner inventory --unused 21   # 21+ gündür kullanılmayanlar
clicleaner explain <küme>          # karar gerekçesini kanıtlarla göster
clicleaner log --summary           # son kararların özeti
clicleaner doctor                  # ortam kontrolü (uzun yol, geri dönüşüm, GPU)
```

### Kaldırma ve veri konumu

```bash
npm uninstall -g clicleaner
```

- Araç verileri: `%LOCALAPPDATA%\clicleaner` — günlükler, plan günlükleri,
  24 saatlik tarama önbelleği ve yedek kasası. Silmekte sakınca yoktur; araç
  gerektiğinde yeniden oluşturur.
- `npx` ile denediysen kurulum kalmaz; npm indirme önbelleği `npm cache clean`
  ile temizlenebilir.

### Sorun giderme

| Sorun | Çözüm |
|---|---|
| TUI bozuk görünüyor / açılmıyor | Ink gerçek bir terminal (TTY) ister; Windows Terminal veya PowerShell kullan |
| Tarayıcı açılmadı | Terminaldeki `http://127.0.0.1:<port>/?token=...` adresini yapıştır |
| "Geçersiz token" | Sunucu her başlatmada yeni token üretir; eski sekmeyi kapat, yeni adresi kullan |
| Uzun yol hataları | Araç `\\?\` önekini kullanır; `clicleaner doctor` ile doğrula |
| Windows dışı sistem | Şu an yalnızca Windows desteklenir |
| Antivirüs uyarısı | Araç dosya silebilir; imza gerekmiyorsa davranışı `clean --dry-run` ile sınayıp kendin karar ver |

## Kullanım

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

## Güvenlik modeli

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
    discover.ts           kök keşfi, ortam profilleri, korumalı yollar
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
