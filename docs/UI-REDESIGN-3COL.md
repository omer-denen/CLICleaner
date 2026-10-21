# 3 Sütunlu Geliştirici Konsolu — Tasarım ve Uygulama Planı

> **ARŞİV (21.10.2026, sürüm 2.0.0):** Tarayıcı arayüzü projeden söküldü
> (P0-P5 uygulanmıştı, P6 açık kalmıştı). Bu belge tarihsel kayıttır.
> Yeniden yapım planı: **`docs/WEB-REBUILD-PLAN.md`**.
>
> Dalga: **D3 — Geliştirici Konsolu** · Görev: **T42**
> Durum: **plan** (kod yazılmadı). Bu belge, uygulama sırasını ve kabul
> ölçütlerini sabitler. Çelişkiler bölümü kullanıcı kararı ister.

> **Planlama vazgeçilmezdir.** Residue'in en vurucu özelliği, silmeden
> önce **gerekçeli bir plan** üretmesidir. Yeni arayüz "Nuke All" gibi
> doğrudan silme eylemi içermez; her toplu eylem önce plana dönüşür.
> Plan bir modal değil, **birinci sınıf bir çalışma alanıdır**.

## 1. Tasarım felsefesi: Geliştirici Dostu Şeffaflık

Arayüz, **modern bir terminal emülatörü ile temiz bir web dashboard'unun
hibriti** olacaktır. Terminal estetiği taklit değil, işlevsel olacaktır:
monospace değerler, hizalı sayılar, `>` prompt işaretleri, kısa etiketler;
buna karşılık ferah bir grid, net hiyerarşi ve erişilebilir odak durumları.

**Altın kural: veri yoğunluğu.** Geliştirici, tek ekranda mümkün olduğunca
çok veriyi ve kontrolü görmek ister. Sevimli ama işlevsiz boşluk yok.

**Değişmez ilkeler (mevcut ürün kuralları):**
- Hiçbir şey tek tıkla silinmez; iki aşamalı onay korunur.
- Sınıflandırma **kanıtla** yapılır; uygulama adı listesi yoktur.
- Bulut yapay zekâ/telemetri yoktur. "AI yorumu" deterministik kanıt
  metnidir; istenirse ileride yerel model ayrı bir iş olur.
- Kasa/geri alma varsayılan yoldur; kalıcı silme ayrı ve yazılı onaylıdır.

## 2. Bilgi mimarisi (3 sütun)

```
┌──────────────┬────────────────────────────────┬────────────────────────┐
│ SOL %20      │ ORTA %50                       │ SAĞ %30                │
│ Kontrol      │ Yoğun ızgara                   │ Bağlam / röntgen       │
│ merkezi      │ (seçim + filtre)               │ (odaklanan öğe)        │
├──────────────┼────────────────────────────────┼────────────────────────┤
│ Sağlık       │ Sıralama/yoğunluk çipleri      │ Ne? / Neden?           │
│ Kategoriler  │ Dense tablo (32px satır)       │ Kanıtlar               │
│ Global       │ Sticky başlık + sanal liste    │ Bağımlılık ağacı       │
│ eylemler     │ Çoklu seçim + klavye           │ Kanıt yorumu           │
│              │                                │ Komut + kopyala        │
└──────────────┴────────────────────────────────┴────────────────────────┘
```

### Planlama — birinci sınıf çalışma alanı

Plan, üç sütunun **dördüncü ve kalıcı durumudur**:

```
[ Bul ]  →  [ Plan ]  →  [ Onay ]  →  [ Uygula ]
  seçim       gerekçe      yazılı       iki aşamalı
              + hedefler    onay         yürütme
```

- **Sol sütunda plan durumu:** `0 seçili` · `Plan taslağı` ·
  `Onay bekliyor` · `Uygulanıyor`. Plan bir madde olarak her zaman görünür.
- **Orta sütunda plan görünümü:** seçilen bulgular risk gruplarına ayrılır;
  her satırda gerekçe, hedef sayısı, boyut, kaynak (disk/CLI) ve
  `Yolları göster` bulunur. Üstte **korunacaklar** ve **toplam etki**
  (kasa / kalıcı) özeti sabittir.
- **Sağ sütunda onay duvarı:** seçili grubun kanıtı, ne kaybedileceği,
  hangi hedeflerin kasa/`older`/`whole` olduğu, gereken onay ifadesi
  (`SIL` / `KARANTINA` / `BOŞALT`) ve yüksek risk işaretlemesi.
- **İki ayrı onay:** disk planı ve CLI planı ayrı yürür. Birleşik plan
  yalnız **salt-okunur önizleme**dir; tek tıkla birleşik uygulama yoktur.
  (Kullanıcı kararı, 21.10.2026.)
- **Dry run = plan.** "Simulate Clean" ayrı bir gizli mod değil, planın
  kendisidir; hiçbir dosya taşınmaz/silinmez.
- Plan **TTL**'i dolduğunda yeniden üretilir; eski plan uygulanamaz.
- Plan ekranı klavye ile tamamlanabilir: `Tab` gruplar, `Space` aç/kapa,
  `Enter` onay alanı, `Esc` planı bırak (silme yok).

### Sol sütun — Kontrol merkezi
- **Sağlık göstergesi (terminal banyosu):**
  `DISK 82% [||||||||--]` + `AJAN KİRLİLİĞİ %38`.
  Veriler: `statfs` ile disk boş alanı, tarama toplamı ve kategori bazlı
  geri kazanılabilir bayt. Tarama yoksa `--` gösterilir.
- **Kategori filtreleri (kanıt türevi):**
  1. **AI Debris** — model depoları, vektör indeksleri, ajan çalışma
     alanlarındaki önbellek/log artıkları.
  2. **Orphaned CLI** — hedefi olmayan shim, kırık sembolik bağ, referanssız
     global paket (T17/T33 kanıtları).
  3. **Ghost Envs** — üst projesi/manifesti kaybolmuş `.venv`, `conda-meta`,
     `node_modules`.
  4. **Tümü** ve **Diğer** (kanıtı yetersiz olanlar; yalnız rapor).
- **Global eylemler (alt kısım):**
  - `Plan oluştur (Dry Run)` → seçili/filtreli bulguları gerekçeli plana
    dönüştürür; hiçbir dosyaya dokunmaz.
  - `Tümünü planla` → kullanıcının "Nuke All" fikrinin **güvenli karşılığı**:
    önce plan, sonra yazılı onay. **Doğrudan silme yok.**
  - Kapsam: aktif kategori + filtre; "tüm disk" için ayrı ve daha güçlü onay.
  - Plan durumu (`taslak / onay bekliyor / uygulanıyor`) sol sütunda kalıcı
    rozet olarak görünür; plan ekranına her an dönülebilir.

### Orta sütun — Yoğun ızgara
- Satır yüksekliği **32px** (dokunmatik için minimum 28px hedefi korunur),
  sticky kolon başlığı, sanal liste (mevcut `@tanstack/react-virtual`).
- Kolonlar: `[ ]` · yol/başlık (mono) · kategori · son erişim/zombi günü ·
  boyut (mono, sağa hizalı) · risk · karar.
- **Akıllı triyaj çipleri:** Boyut · Risk · Zombi süresi · Kategori.
- **Klavye:** `Space` seç, `↑/↓` veya `J/K` gezin, `Enter` sağ paneli sabitle,
  `/` aramaya odaklan, `Shift+↓` aralık seç, `Esc` seçimi bırak.
- **Seçim:** tekli, `Shift` aralık, "filtredeki tümünü seç", "seçimi temizle".
  Seçim özeti alt çubukta; plan düğmesi orada.
- **Yoğunluk modu:** `Rahat / Yoğun` anahtarı (satır 32 ↔ 40px). Varsayılan
  yoğun; erişilebilirlik için rahat mod.

### Sağ sütun — Bağlam ve güvenlik duvarı
Odaklanan (klavye) veya hover edilen öğenin röntgeni; `Enter` ile sabitlenir.
- **Ne? / Silersem ne olur?** — mevcut `verdict.what/consequence`.
- **Kanıtlar** — dosya türleri, işaretler, sahip, log sinyalleri.
- **Bağımlılık ağacı** — hedef yolların ve alt parçaların ağaç görünümü,
  boyutlarıyla. CLI için shim → paket → durum klasörü; disk için
  kök → alt parça → hedef. Kırık halkalar kırmızı işaretlenir.
- **Kanıt yorumu** — "AI meta-açıklaması"nın deterministik karşılığı:
  kanıtlardan üretilen düz metin. Örnek: *"Bu klasör bir vektör indeksi
  içeriyor; aktif bir referans bulunamadı. Kasa modunda güvenle taşınabilir."*
- **Komut kopyala** — önce güvenli yol: `residue explain <anahtar>` /
  `residue clean --only <anahtar> --dry-run`. Manual silme komutu ayrı
  sekmede, açık uyarıyla: Windows PowerShell
  `Remove-Item -LiteralPath '<yol>' -Recurse` (bash `rm -rf` değil).
  **Yol istemciden gelmez**; sunucu anahtardan çözer.
- **WSL notu:** Windows'ta kurulu npm, WSL içinde PATH üzerinden
  `/mnt/c/Program Files/nodejs/npm` olarak çözülebilir; prefix'i
  `C:\Users\<kullanıcı>\AppData\Roaming\npm` olur. Yani bu **Linux npm'i
  değildir**; Windows shim/paket üretir. WSL'de ayrı Node yoksa
  `node: not found` alınır (bu makinede doğrulandı). Residue Windows
  yollarını taradığı için **PowerShell'de** çalıştırılmalıdır; WSL yalnız
  `cmd.exe /c npm ...` ile Windows npm'i çağırabilir, bu da yine Windows
  tarafında çalışır. UI'da manual komut PowerShell olarak gösterilir.
- **Referanslar** — çalışan süreç, yapılandırma, kısayol, zamanlanmış görev
  (T33). Varsa "önce kapat" uyarısı.

## 3. Kategoriler — ad değil kanıt

| Kategori | Kanıt (örnek) | Karar |
|---|---|---|
| AI Debris | `model-store`, `vector-index`, `agent-workspace` + önbellek/log işaretleri | Çoğu `ask`/`report-only`; model ve oturum **korunur** |
| Orphaned CLI | shim var hedef yok, kırık symlink, PATH gölgeleme, referans yok | Kaldırma planı; iki aşamalı onay |
| Ghost Envs | `.venv`/`conda-meta`/`node_modules` var, üst manifest/parent yok | `ask`, düşük güven; önce kanıt genişletme |
| Diğer | yetersiz kanıt | `report-only` |

**Yasak:** "LangChain/CrewAI/Ollama" gibi marka listeleriyle sınıflandırma.
Marka adı yalnızca kullanıcı yolunda görünür; motor yapıyı okur.

## 4. Sağlık göstergesi

- `fs.statfs` ile sistem sürücüsü: toplam/boş.
- Tarama özeti: taranan bayt, geri kazanılabilir bayt, kategori dağılımı.
- `Ajan kirliliği` = AI Debris geri kazanılabilir bayt / taranan bayt.
- Değerler tarama sonucuyla birlikte önbelleğe yazılır; ayrı tarama gerekmez.
- Gauge metni: `DISK 82% [||||||||--]` · `AJAN %38 [|||-------]`.

## 5. Veri ve sözleşme değişiklikleri

1. **`FindingView` (birleşik görünüm):**
   `id`, `source: 'disk' | 'cli'`, `title`, `path`, `category`,
   `bytes`, `idleDays`, `risk`, `verdict`, `selectable`,
   `evidence`, `targets`, `references`.
   Disk kümeleri ve CLI araçları aynı ızgarada gösterilir; eylemler
   kaynağa göre yönlendirilir.
2. **`GET /api/findings`:** tarama + CLI envanterinden birleşik liste.
   (Alternatif: istemcide birleştirme; sunucu tarafı tek kaynak daha güvenli.)
3. **`GET /api/health`:** disk/scan/sağlık özeti.
4. **`POST /api/command`:** `{ source, key/index }` → `{ safeCommand, manualCommand, warning }`.
   İstemci yol göndermez; sunucu çözer.
5. **`explanation`:** `verdict` + `evidence`ten deterministik metin (sunucu).
6. **Plan sözleşmesi:** disk ve CLI planları ayrı kalır. Birleşik önizleme
   (v1) yalnız **okuma**dır; uygulama kaynak başına iki aşamalı onayla yapılır.

## 6. Uygulama fazları

### P0 — Kabuk ve tasarım belirteçleri

> **Durum: TAMAMLANDI (20.10.2026).** `web/src/components/Rail.tsx` (yeni),
> `web/src/util/categories.ts` (yeni), `web/src/App.tsx` (kabuk),
> `web/src/styles.css` (belirteçler), `web/src/i18n.tsx` (TR/EN).
> Sabit sol rail + içerik kabuğu; sağ sütun P2 için yer ayrıldı.
> Sapmalar: rail genişliği 264px (planda 248px); `DISK %` göstergesi
> **sunucu tarafı `statfs` gerektirdiği için ertelendi** (çekirdeğe
> dokunulmadı) — yerine taranan/geri kazanılır/ajan kirliliği
> ölçümleri tarama sonucundan gelir. Kategoriler **istemci tarafında,
> mevcut kanıtlardan** türetilir (mimari tip + dosya türü); çekirdekte
> yeni sınıflandırma kuralı yok.
>
- Sol sabit rail, sağ içerik; `--app-sidebar: 248px`; 8px grid.
- Tipografi: UI sans + mono (`Cascadia Code/Consolas`) değerler.
- Renk belirteçleri: mevcut koyu palet + açık tema hazırlığı.
- Responsive: ≥1400 üç sütun; 1100–1400 sağ panel daraltılabilir;
  <1100 sol rail üstte, sağ panel alt sayfa.
- **Kabul:** 1440/1024/768 genişliklerde taşma yok; klavye odağı görünür.

### P1 — Yoğun ızgara

> **Durum: TAMAMLANDI (20.10.2026).** Tek satır durum şeridi + 32px
> yoğun ızgara + yapışkan başlık + klavye + triyaj çipleri.
> `StatusStrip.tsx` (yeni), `ClusterRow.tsx` (yeniden yazıldı),
> `VirtualClusterList.tsx` (klavye + başlık), `labels.ts` (kısa etiketler).
> Satır 32px (Rahat 40px); sütunlar `--grid-cols` ile hizalı.
> Klavye: `↑/↓`/`J/K` imleç · `Shift+↑/↓` aralık · `Space` seç ·
> `Enter` odak+detay · `/` arama · `Esc` seçimi bırak.
> Terminal × dashboard dili: mono değerler, büyük harfli mono başlıklar,
> ince ayraçlar, odak satırında `>` prompt imleci.
> **Sapma:** `DISK %` göstergesi sunucu `statfs` gerektiriyor → P4'te.
>
- 32px satır, sticky başlık, sanal liste, kolonlar.
- Klavye gezinme/seçim, `Shift` aralık, filtreli tümünü seç.
- Triyaj çipleri ve yoğunluk anahtarı.
- **Kabul:** 500+ satırda 60fps hissi; Space/ok tuşları çalışır; seçim
  sayısı/boyutu doğru.

### P2 — Sağ bağlam paneli

> **Durum: TAMAMLANDI (20.10.2026).** `ContextPanel.tsx` (yeni),
> `util/evidence-text.ts` (yeni, deterministik kanıt yorumu).
> Odaklanan/klavye imleci (veya Enter ile sabitlenen) öğenin tüm kanıtı:
> Ne? / Silersem ne olur? / Neden bu karar? / Kanıt yorumu / Kanıtlar /
> Bağımlılık ağacı / Güvenli komut + manuel PowerShell komutu.
> **Hover önizleme kaldırıldı** (kullanıcı kararı: hover sağlıklı çalışmıyor);
> panel **seçim/imleç** tabanlıdır.
> Metinler bir dil modeli değil, kanıttan üretilen deterministik cümlelerdir.

### P3 — Planlama çalışma alanı (önerinin çekirdeği)

> **Durum: TAMAMLANDI (20.10.2026).** `PlanWorkspace.tsx` + `ApprovalWall.tsx`
> (yeni). Plan artık **modal değil, kalıcı çalışma alanı**dır.
> Tasarım, bu tür uygulamaların onay adımındaki düzenini izler:
> yapışkan özet şeridi (`KALDIRILACAK 8.92 GB · 7 küme · 8 hedef` + mod +
> geri sayım), **adım şeridi** (Bul › Plan › Onay › Uygula), tarama ızgarasıyla
> **aynı dilde yoğun tablo** (32px), satır içi **"plandan çıkar"** (sunucuda
> yeniden plan üretilir → uygulanan plan ile görünen plan aynıdır), yollar
> satır altında açılır. Sağda **onay duvarı**: "ne kaybedeceğim" + `SIL` +
> yüksek risk onayı + Uygula/Vazgeç. İki aşamalı onay korunur.
> *Sözleşme:* plana `key` alanı eklendi (`PlannedCluster.key`) — plandan
> çıkarma başlığa göre eşleştirme yapmaz, anahtarla yapar.

### P4 — Kategoriler ve sağlık

> **Durum: TAMAMLANDI (20.10.2026).** Kategori mantığı **çekirdeğe** taşındı
> (`src/core/categories.ts`) — arayüz ayrı liste tutmaz. Sağlık göstergesi
> artık `DISK C:\ %62` (107 GB boş · 281 GB toplam) + Taranan + Geri kazanılır
> + Ajan kirliliği. Disk ölçümü **sunucu tarafında** `statfs` ile
> (`src/core/disk-usage.ts`, salt okunur, tek sistem çağrısı).

### P5 — Birleşik kaynaklar ve plan önizleme

> **Durum: TAMAMLANDI (20.10.2026).** `src/core/findings.ts` +
> `GET /api/findings` + "Birleşik" sekmesi. Disk kümeleri ve CLI araçları tek
> listede (kaynak sütunu ile). **Salt okunur:** planlar kaynak başına ayrıdır,
> birleşik uygulama yoktur (kullanıcı kararı: iki ayrı yazılı onay).

### P6 — Cila ve doğrulama

> **Durum: SIRA SONRASI.** Klavye/a11y taraması, boş durumlar, odak halkaları,
> hata mesajları, tekrar eden metinlerin temizlenmesi.
>
> **Ön adım TAMAMLANDI (20.10.2026): motor/ayrım ayrımı.** Filtre, arama,
> sıralama, plan kapsamı, seçim özeti ve kanıt yorumu artık `src/core/`
> içindedir; `web/src` yalnızca **gösterir**. Motor, her biri tek
> sorumluluğu taşıyan ayrı sınıflar halinde yazıldı:
> `ClusterQuery` (liste) · `SelectionScope` (seçim/plan kapsamı) ·
> `ScanSummary` (özetler) · `CliInventoryQuery` (envanter) ·
> `FindingsQuery` (birleşik bulgular) · `PlanSummary` (plan sayımları) ·
> `TargetMap` (hedef ↔ parça) · `EvidenceReader` (kanıt yorumu).
>
> **Ayrım tam:** `src/` → `src/web/` bağı **sıfır**. Sözleşme tipleri
> `src/core/contract.ts`, kalıcı uygulama durumu `src/store/` altındadır;
> `src/web/` yalnızca HTTP/SSE adaptörüdür (`server.ts` + `http.ts`).
>
> Bu, "liste bazlı seçim işlemleri" için arayüzün tek doğru yeri olduğu
> fikrini kod seviyesinde garanti eder: CLI ile web aynı soruya aynı cevabı
> verir. Test: `scratch/test-cluster-query.ts` (52/52) ·
> `scratch/test-cli-query.ts` (31/31) · `scratch/test-plan-summary.ts` (14/14)
> · CDP 24/24.

- Odak/hover takibi, `Enter` ile sabitleme.
- Kanıt, bağımlılık ağacı, deterministik yorum, komut kopyalama.
- **Kabul:** her satır için panel dolar; kopyalanan komut yolu doğru;
  istemci hiçbir istekte yol göndermez.

### P3 — Planlama çalışma alanı (ürünün çekirdeği)
- `Bul → Plan → Onay → Uygula` durumları; plan sol sütunda kalıcı rozet.
- Orta sütunda risk grupları, korunacaklar, toplam etki; sağda onay duvarı.
- `Plan oluştur (Dry Run)` ve `Tümünü planla`; ikisi de yalnız plan üretir.
- Plan TTL'i, yeniden üretim, eski planın uygulanamaması.
- Disk ve CLI planları **ayrı onay**; birleşik görünüm salt-okunur.
- **Kabul:** plan olmadan tek dosya bile taşınmaz/silinmez; plan ekranından
  çıkmadan tüm hedefler ve gerekçeler görülebilir; yazılı onay olmadan
  uygulama düğmesi etkinleşmez.

### P4 — Kategoriler ve sağlık
- AI Debris / Orphaned CLI / Ghost Envs kanıt türevi filtreleri.
- Health gauge + kategori sayaçları; global plan kapsamı.
- **Kabul:** kategori sayıları tarama/CLI sonucuyla tutarlı; "Tümünü
  planla" yazılı onay olmadan hiçbir şey silmez.

### P5 — Birleşik kaynaklar ve plan önizleme
- CLI araçlarını aynı ızgarada gösterme; kaynak başına eylem.
- Birleşik salt-okunur plan önizlemesi; iki ayrı onay.
- **Kabul:** disk+CLI seçimi tek ekranda görünür; uygulama kaynak başına.

### P6 — Cila ve doğrulama
- Klavye/ekran okuyucu, odak tuzağı, `aria-live`, kontrast.
- Açık/koyu tema, yoğunluk modu, boş/hata durumları.
- Performans: 1000 satır, sanal liste, memoizasyon.
- **Test:** mevcut `test-*` + yeni `test-findings`, `test-command`,
  `test-health`, `test-plan-flow`; CDP ile 3 sütun düzeni, klavye ve
  plan→onay akışı.

## 7. Riskler ve kararlar

1. **Planlama vazgeçilmezdir.** Ürünün en vurucu özelliği, silmeden önce
   gerekçeli plan üretmesidir. "Nuke All" yoktur; toplu eylem
   **"Tümünü planla"**dır ve yalnız plan üretir. Plan görülmeden, hedefler
   ve riskler okunmadan hiçbir dosya taşınmaz/silinmez; iki aşamalı onay
   her durumda korunur.
2. **Manuel `rm -rf`.** Windows'ta `Remove-Item -LiteralPath`; kasa/geri alma
   yok uyarısı zorunlu. Komut sunucudan gelir, istemci yol göndermez.
3. **AI yorumu = kanıt metni.** Bulut LLM yok. Yerel model istenirse ayrı
   dalga (T43) ve opt-in olur.
4. **Birleşik kaynaklar.** Disk planı `keys[]`, CLI planı `commands[]`
   kullanır. v1'de birleşik plan yalnız önizleme; uygulama ayrı kalır.
5. **Ghost Envs yanlış pozitif.** Üst manifest geçici olarak yoksa (ör.
   yeni klonlanmış proje) yanlış "hayalet" denebilir. `confidence: low`
   ve `ask`; otomatik seçim yok.
6. **Yoğunluk vs erişilebilirlik.** 32px satır + görünür odak halkası;
   rahat mod ve zoom desteği.
7. **Ajan marka adları.** Kategoriler kanıtla; marka listesi yok.

## 8. Kararlar (21.10.2026)

1. **İki ayrı onay.** Disk planı ve CLI planı ayrı yürür. Birleşik plan
   yalnız **salt-okunur önizleme**dir; uygulama kaynak başına iki aşamalı
   onayla yapılır.
2. **Manuel komut:** birincil biçim Windows **PowerShell**
   (`Remove-Item -LiteralPath ...`). WSL/bash varyantı gösterilmez; WSL
   notu yukarıdadır. Windows'ta kurulu npm WSL'de Linux npm'i yerine
   geçmez.
3. **Sağ panel:** hover önizleme, `Enter` ile sabitleme. Sabitlenen öğe
   klavye gezintisinde değişmez.
4. **Varsayılan tema: koyu.** Açık tema P6'da; tasarım belirteçleri
   hazır.
5. **`Tümünü planla` kapsamı:** aktif kategori + filtre. "Tüm tarama"
   ayrı ve daha güçlü yazılı onay ister; hiçbir durumda doğrudan silmez.

## 9. Başarı ölçütleri

- 1000 satırlık sonuçta ilk etkileşim < 100 ms; kaydırma akıcı.
- Klavye ile seçim + plan akışı fare olmadan tamamlanabilir.
- Her silme/plan kararı sağ panelde kanıt + sonuç + komut gösterir.
- Yanlış "güvenli" sınıflandırma yok; şüphede `ask`/`report-only`.
- Hiçbir toplu eylem yazılı onayı atlamaz.
