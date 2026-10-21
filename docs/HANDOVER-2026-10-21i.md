# Devir belgesi — 21.10.2026 · 2.2.0 sonrası Graf UX (Düğüm testi)

> **Konum:** `C:\Users\Code\source\repos\residue-cleaner`
> **Durum:** **2.2.0 npm'de yayında** (`residue-cleaner@2.2.0`, tag
> `v2.2.0`). Bu oturumun Graf UX paketi **main'de, yayınlanmadı**;
> bir sonraki sürüm **minor → 2.3.0**.
> **Test:** `npm test` **98/98**; typecheck temiz; `npm run smoke`
> **34/34**; `build:web` **117.73 KB gzip** JS + 5.71 KB gzip CSS.
>
> Önceki belge: `docs/HANDOVER-2026-10-21h.md` (M5).
> Bu oturum: klavye/a11y cilası → 2.2.0 yayını → Graf UX turu.

---

## 1. Oturumun talepleri

1. **"kaldığımız yerden devam et"** → M5 cila + 2.2.0 yayını.
2. **"ego browser da işlemleri görsem"** → gerçek tarayıcı turu.
3. **Graf UX:** satırdan simülasyon, ilerleme, düğüm/kenar anlamı,
   iki kullanıcı profili.
4. **Graf yeniden:** 6 özet kartı renkli + tıklanınca açılır; liste aşağı
   uzamasın; "silinmez" ifadeleri kalksın; düğümler TreeView.
5. **Dil:** Türkçe büyük harf doğru olsun; ardından **"WHAT-IF" yerine
   "Düğüm Testi"**.
6. **"Kaldırılabilir 6"** sonucunun hangileri olduğu **ağaç listesi**.
7. **İletişim kuralı (AGENTS 20):** anlaşılmayan istekte tahmin yok,
   kullanıcıya sorulur.

---

## 2. Graf ekranının son hali

Sıra: **başlık + profil → 6 kart → kapsam notu → sözlük → kök nedenler →
Düğümler/Kenarlar sekmeleri → Düğüm testi paneli.**

- **Bakış profili:** **Koruyan** / **Deneyen**. Yalnız bölüm **sırasını**
  değiştirir: Koruyan’da önce İlişkiler, Deneyen’de önce Etki Analizi.
  `localStorage: residue.graphProfile`; varsayılan Koruyan.
- **6 özet kartı:** düğüm, kenar, kopuk, gölgede, döngü, kritik.
  Renk kodlu (`info/ok/warn/danger/vault`), `+ / −` ile açılır; tıklanınca
  **ayrıntı paneli**:
  - Düğümler → tür/sayım çipleri (tıklayınca grup açılır ve görünüme gelir),
  - Kenarlar → durum/sayım çipleri,
  - Kopuk / Gölgede → kenar listesi + “Düğümü göster”,
  - Kritik → kritik düğümler + “İncele”,
  - Döngü → döngü listesi.
- **Sözlük:** düğüm = varlık; kenar = `A → B` “A, B’ye ihtiyaç duyar”;
  kenar yalnızca ilişki kaydıdır.
- **Kök nedenler:** ne arandığı (hedefi olmayan kenarlar) ve “yok” sonucunun
  sağlıklı olduğu açıklanıyor.
- **Sekmeler:** Düğümler / Kenarlar. Liste **sabit yükseklikte** (iç kaydırma);
  sayfa aşağı uzamıyor. Ölçüm: gövde yüksekliği **694 px = viewport**.
- **Düğüm ağacı:** tür grupları (araç, paket, shim, PATH, durum, kısayol,
  süreç, ayar…); **Genişlet / Daralt**; satır aç/kapa.
- **Satır açılınca:** `İLİŞKİLER` (gelen/giden) + `ETKİ ANALİZİ` (what-if)
  birlikte. Durum: **Kaldırılabilir / Kısmi etki / Engelli**; kopacak
  kenarlar, yalıtılacak düğümler listelenir.
- **Düğüm testi (eski “What-if”):** serbest metin, birden fazla düğüm.
  Sonuç: Kaldırılabilir/Engellenen sayıları, **Kaldırılabilir düğümler
  ağaç listesi** (tür + seviye + **İncele**), engellenenler, kopacak
  kenarlar, yalıtılacaklar. **İncele** ilgili ağaç satırını açar.
- **İlerleme:** ilk açılışta envanter SSE ile canlı araç sayısı; adım
  göstergesi (1/2 → 2/2) ve animasyonlu çubuk.
- **Dil:** “silinmez” ifadeleri Graf’tan kaldırıldı; yalnız ilişki/etki
  analizi dili. Başlık **Düğüm testi**; İngilizce **Node test**.

---

## 3. Motor / sözleşme

- `GraphViewResponse`:
  - `nodes[].dependents` (gelen) + `nodes[].needs` (giden) — `GraphDependentView`.
  - `groups: GraphKindGroup[]` — `groupNodesByKind()` (tür sırası motorda).
  - `details` — `nodeKindCounts`, `edgeStateCounts`, `brokenEdges`,
    `shadowedEdges`, `criticalNodes`; özet sayaçları **aynı kaynaktan**
    hesaplanır (tutarlılık).
- `GraphWhatIfRequest { query?, nodeId? }`; `GraphService.whatIfNode`
  **kesin kimlikle** tek düğüm çalıştırır (serbest arama alt dizi eşleştirir).
- `translateUpper(lang, key)` — `tr-TR` / `en-US`; `WHAT-İF` sorunu kökten
  çözüldü, sonra başlık tamamen “Düğüm testi” oldu.
- `web/src` sınırı korunur: UI yalnız `contract.ts` + `approval.ts` tüketir;
  gruplama/ayrıntı motorda.

---

## 4. Doğrulama

- `npm test` **98/98** (yeni: tür grupları, gelen/giden kenar, i18n büyük harf).
- `npm run typecheck` temiz; `npm run smoke` **34/34** temiz.
- `npm run build:web`: **117.73 KB gzip** JS + 5.71 KB gzip CSS.
- API (`GET /api/graph`): **68 düğüm / 65 kenar**; 8 tür grubu;
  17 gölgede, 0 kopuk, 1 kritik (`npx`); `details` + `groups` dolu.
- Gerçek Edge (ego-browser space **7**), 1036×744:
  - kartlar renkli, “Kritik” açıldı → `npx` + İncele;
  - `browser` satırı: İlişkiler (6 gelen, 1 giden) + Etki Analizi
    (**Kısmi etki**, 1 kopacak kenar);
  - Düğüm testi `browser` → **Kaldırılabilir düğümler (6)**:
    `browser`, `browser-use`, `browser.exe`, `browser-use.exe`,
    `browser-use-tui.exe`, `browseruse.exe`; “İncele” satırı açtı;
  - `Genişlet / Daralt` 68 → 0 → 68 satır;
  - gövde yüksekliği = viewport (aşağı uzama yok);
  - “WHAT-IF” metni yok, **DÜĞÜM TESTİ** var.
- **Gerçek silme / plan çalıştırma / env yazımı YAPILMADI.**
- Görseller: `scratch/ego-graph-03-current.png` … `ego-graph-18-allowed-inspect.png`
  (son tur: 13–18).

---

## 5. Yayın durumu

- **npm:** `residue-cleaner@2.2.0` (`latest`) — yayınlandı.
- **GitHub:** `main` + tag `v2.2.0` (commit `982ac77`). GitHub Release
  gerekli değil (dağıtım npm; kullanıcı kararı 21.10.2026).
- **Yayınlanmamış (main):** Graf UX paketi — commit’ler:
  - `49c7048` satır simülasyonu (nodeId),
  - `3e3c88c` profiller + satır içi ağaç + TR büyük harf,
  - `c3184ee` özet kartları + sekmeler + ağaç + nötr metin,
  - `9169c58` “Düğüm testi” + kaldırılabilir düğüm ağacı.
- **Sonraki sürüm:** bu paket **2.3.0** (yeni özellik = minor).
  `CHANGELOG` → `[Unreleased]`; `package.json` hâlâ 2.2.0.

---

## 6. Açık riskler / notlar

1. **Görsel kapsam:** Graf 1036×744’te doğrulandı; **İngilizce** ve
   **≤820 px** düzenleri bu oturumda gözle kontrol edilmedi.
2. **`details` servis testi:** gruplama ve gelen/giden kenar birim testli;
   `GraphService.details` yalnız API + tarayıcı ile doğrulandı (sahte
   envanterle birim testi eklenebilir).
3. **Gerçek plan çalıştırma** hâlâ denenmedi (yalnız önizleme).
4. **`scripts/init-state.ts` bayat** (10 görev); çalıştırılırsa `state.json`’u
   ezer → **B18**. Sonraki oturumda düzeltilmeli/kaldırılmalı.
5. **`state.json.openQuestions`** içinde çözülmüş eski maddeler var
   (arayüz yeniden yapımı, T41, GitHub Release). Temizlenebilir.
6. **Sunucu oturumluk:** `:4399` bu oturumda açıktı; yeni oturumda yeniden
   başlatılmalı. Token her başlatmada değişir.
7. **`graph.whatIf.*` i18n anahtarları** iç ad olarak kaldı (görünür metin
   “Düğüm testi”); yeniden adlandırma istenirse anahtar göçü gerekir.
8. **Kenar listesi işlem almaz** — bilinçli; kenarlar ilişki kaydıdır,
   eylem düğüm satırındadır.
9. **`graph.tree.readonly`, `graph.row.*`, `graph.whatIf.simulate*`**
   anahtarları artık kullanılmıyor; sözlükten temizlenebilir.

---

## 7. Sonraki oturumun ilk adımları

1. **Oku:** `AGENTS.md` (özellikle kural 20) → `SESSION_LOG.md` (en üst
   “Graf UX”) → bu belge.
2. **Doğrula:** `git status`, `npm run typecheck`, `npm test`,
   `npm run build:web`, `npm run smoke`.
3. **Karar:** Graf UX paketi **2.3.0** olarak yayınlanacak mı?
   (Öneri: evet; README’ye kısa “Graf” bölümü + `CHANGELOG` `[2.3.0]`.)
4. **Planlanan işler (kullanıcı sırası):**
   - **T30** — global AI çalışma zamanı artıkları (Ollama/LM Studio/GPT4All),
   - **T37** — yarım kalan güncelleme artıkları,
   - **T54** — eski CLICleaner kalıntıları (ayrı onay).
5. **Hızlı bakım (öneri):** **B18** (`init-state`), `package.json` `bin`
   normalizasyonu, `state.json` eski sorular.
6. **Doğrulama borcu:** küçük ve geri alınabilir tek kuralla **gerçek plan
   çalıştırma**; ardından T54.

---

## 8. Dosya haritası (bu oturumun Graf kısmı)

| Dosya | Değişiklik |
|---|---|
| `src/core/dependency-graph.ts` | `GraphKindGroup`, `groupNodesByKind` |
| `src/core/contract.ts` | `GraphDependentView`, `GraphKindCount`, `GraphStateCount`, `GraphDetails`; `GraphViewResponse.groups/details`; `GraphWhatIfRequest` |
| `src/services/graph-service.ts` | `dependents`/`needs`, `groups`, `details`; `whatIfNode` |
| `src/web/server.ts` | `nodeId` ile kesin what-if |
| `web/src/screens/Graph.tsx` | Kartlar, sekmeler, ağaç, satır içi paneller, Düğüm testi, izin listesi |
| `web/src/i18n.ts` | TR/EN metinler; `translateUpper` |
| `web/src/styles.css` | Kart renkleri, sekmeler, ağaç, sabit liste, detay panelleri |
| `scripts/smoke-web.mjs` | Graf boş what-if 400 kontrolü |
| `tests/dependency-graph.test.ts` | Grup + gelen/giden kenar |
| `tests/i18n-upper.test.ts` | `DÜĞÜM TESTİ` / `NODE TEST`, `DİSK` |
| `CHANGELOG.md` | `[Unreleased]` Graf maddeleri |

---

## 9. Ego-browser notu

- Space **7** (`residue m5 keyboard a11y 2`) bu oturumun Graf turu içindir.
- Son ekran görüntüleri:
  - `scratch/ego-graph-13-dugum-testi.png` — kartlar + ağaç,
  - `scratch/ego-graph-14-kritik-karti.png` — kritik kart ayrıntısı,
  - `scratch/ego-graph-15-satir-ici.png` — İlişkiler + Etki Analizi,
  - `scratch/ego-graph-16-dugum-testi.png` — Düğüm testi,
  - `scratch/ego-graph-17-allowed-tree.png` — Kaldırılabilir 6 ağaç listesi,
  - `scratch/ego-graph-18-allowed-inspect.png` — “İncele” ile açılan satır.
- Yeni oturumda sunucu `node bin/residue.mjs ui --web --no-browser --port 4399`
  ile başlatılmalı; sayfa bir kez yenilenince çerez token’ı yenilenir.
