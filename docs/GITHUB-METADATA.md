# GitHub / npm kimlik metinleri

> Kopyala-yapıştır için tek kaynak. README bu metinlerle aynı çerçeveyi
> kullanır: **CLI temizleyici / kanıt denetleyicisi** — genel Windows disk
> temizleyici değil.

## GitHub "About" açıklaması (uygulandı)

```
CLI cleaner that audits developer caches, CLI installs and AI tool leftovers with evidence; shows what each folder is and deletes nothing without approval.
```

Türkçe karşılığı (gerekirse):

```
CLI temizleyici: geliştirici ve AI araçlarının bıraktığı önbellek, kurulum ve çalışma zamanı artıklarını kanıtla inceler; onaysız silmez.
```

**Kullanmayın:** "Windows disk cleaner", "PC cleaner", "hızlandırıcı",
"yer açma aracı" gibi genel temizlik ifadeleri. Ürün bunları yapmaz.

## GitHub Topics (uygulandı)

```
ai-agents
ai-artifacts
ai-tools
cache-analyzer
cli-cache
cli-cleaner
cli-temizleyici
cli-tools
clicleaner
conda
cuda
developer-tools
devtools
disk-usage
nodejs
npm-cache
nuget
onnx
python
windows
```

Eski genel temizlik etiketleri (`disk-cleaner`, `disk-space`, `cleanup`,
`cache`, `cli`, `web-ui`, `react`, `typescript`) kaldırıldı; yerine CLI
odaklı ve kanıt/denetim odaklı etiketler geldi. GitHub en fazla 20 konu
kabul eder.

## GitHub Release kuralı (20.10.2026)

Release oluşturulurken **özel başlık/etiket verilmez**; GitHub'un varsayılanı
kullanılır — yani başlık **tag adıdır** (`v1.0.0`).

- `gh release create v1.0.0` → `--title` **verilmez**.
- Release açıklaması istenirse yalnız kısa birkaç satır; sürüm notlarının
  tamamı `CHANGELOG.md` içindedir.

Bu kural `AGENTS.md` 17. maddede de yer alır.

## npm keywords

`package.json` içindeki `keywords` dizini aynı çerçevede tutulur
(`cli-cleaner`, `cli-temizleyici` dahil). npm'de yayınlanan sürümün arama
etiketleri o dosyadan okunur; değişiklik bir sonraki yayınla görünür.

## README başlığı

İlk ekranda şu sıra korunur:

1. Ne olduğu: **CLI temizleyici ve kanıt denetleyicisi**
2. Ne yapmadığı: **Windows disk temizleyici değildir**
3. Nasıl çalıştığı: ad değil kanıt; iki aşamalı onay; kasa
