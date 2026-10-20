# GitHub / npm kimlik metinleri

> Kopyala-yapıştır için tek kaynak. README bu metinlerle aynı çerçeveyi
> kullanır: **CLI temizleyici / kanıt denetleyicisi** — genel Windows disk
> temizleyici değil.

## GitHub "About" (sağ üstteki açıklama)

Türkçe:

```
CLI temizleyici: geliştirici ve AI araçlarının bıraktığı önbellek, kurulum ve çalışma zamanı artıklarını kanıtla inceler; onaysız silmez.
```

English:

```
CLI cleaner that audits developer and AI tool leftovers with evidence; nothing is deleted without approval.
```

**Kullanmayın:** "Windows disk cleaner", "PC cleaner", "hızlandırıcı",
"yer açma aracı" gibi genel temizlik ifadeleri. Ürün bunları yapmaz.

## GitHub Topics (arama etiketleri)

Depo sayfasında **About → dişli → Topics** alanına şunlar girilir
(küçük harf, tire; boşluk yok):

```
cli-cleaner
cli-temizleyici
clicleaner
cli-tools
cli-cache
developer-tools
cache-analyzer
disk-usage
ai-agents
ai-tools
ai-artifacts
npm-cache
nuget
conda
onnx
cuda
windows
```

## npm keywords

`package.json` içindeki `keywords` dizini yukarıdaki listeyle aynı çerçevede
tutulur (`cli-cleaner`, `cli-temizleyici` dahil). npm'de yayınlanan sürümün
arama etiketleri o dosyadan okunur; değişiklik bir sonraki yayınla görünür.

## README başlığı

İlk ekranda şu sıra korunur:

1. Ne olduğu: **CLI temizleyici ve kanıt denetleyicisi**
2. Ne yapmadığı: **Windows disk temizleyici değildir**
3. Nasıl çalıştığı: ad değil kanıt; iki aşamalı onay; kasa
