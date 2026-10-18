# Değişiklik Günlüğü

Bu proje [Semantic Versioning](https://semver.org/lang/tr/) kullanır.
Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) temellidir.

## [Unreleased]

## [0.1.0] - 2026-10-18

İlk kamuya açık sürüm (anasürüm).

### Eklendi

- **Kanıta dayalı sınıflandırma:** `CACHEDIR.TAG`, `.nupkg/.nuspec`, ONNX model
  dosyaları, CUDA/ORT DLL'leri, `pyvenv.cfg`/`conda-meta`, `.vhd/.vhdx`,
  güncelleyici artıkları, ajan beceri depoları, editör uzantı depoları ve
  `app-<sürüm>` kurulumları. Kaynak kodda uygulama adı geçmez.
- **Hedefli silme:** klasörün tamamı yerine yalnız güvenli kısım (ör. `Temp`'te
  3 günden eski dosyalar, Electron'da yalnız `Cache`/`GPUCache`).
- **İki aşamalı onay:** plan → yazılı `SIL`; orta/yüksek riskte `--yes` bypass
  edemez. Varsayılan mod geri dönüşüm kutusudur.
- **`guard.ts` güvenlik kapısı:** korunan yolların atası hedef olamaz.
- **Paralel dosya yürüyücüsü:** `\\?\` uzun yol desteği ve junction döngü koruması.
- **Terminal TUI (Ink) ve yerel web arayüzü:** yalnız `127.0.0.1`, her başlatmada
  rastgele token, Host/Origin doğrulaması, 10 dakikalık plan TTL'si.
- **Canlı tarama (SSE):** disk taramasında taranan dizinler ve bulunan kümeler
  anlık akar; CLI envanterinde araçlar bulundukça listelenir; iptal sunucudaki
  işi gerçekten durdurur.
- **Kullanılmayan CLI envanteri:** npm/uv/dotnet/pip/standalone kaynakları,
  atıllık kanıtı (shim erişimi, durum klasörü, kabuk geçmişi) ve güven düzeyi.
- **Kaldırma planı + yedek kasası:** durum klasörleri kasaya kopyalanır,
  kaldırma paket yöneticisinin kendi komutuyla planlanır.
- **24 saatlik tarama önbelleği**, günlük (`journal`), `undo`, `log --summary`,
  `doctor`, `explain`, `rules`, `status` komutları.
- **Arayüz:** TR/EN, disk listesinde kategori sekmeleri, risk/boyut/tarih/ad
  sıralaması, kademeli listeleme; tarama sonunda `Tamam` diyalogu.

### Bilinen sınırlar

- Yalnızca Windows (geri dönüşüm kutusu ve `%LOCALAPPDATA%` varsayımları).
- Gerçek uninstall yolu plan düzeyinde test edildi; ilk gerçek kaldırma testi
  henüz yapılmadı.
- `atime` kanıtı antivirüs/indexer tarafından etkilenebilir; güven düzeyi
  arayüzde açıkça gösterilir.
