# WEB ARAYUZUNU YENIDEN YAPIM PLANI

> **Durum: PLANLANDI (21.10.2026).** Tarayici arayuzu projeden sokuldu
> (surum 2.0.0). Bu belge, arayuzun **yeniden** olusturulacagi icin
> tutulan plandir. Kayit: `state.json` → gorev **T44**.
>
> Kapsam karari (kullanici, 21.10.2026): **yalnizca gorunur arayuz** silindi;
> motor (HTTP/SSE API, servisler, sozlesme) **yerinde birakildi**.

---

## 1. Neden sokuldu?

Kullanici karari: tarayici arayuzu projeden **sozuldu ve silindi**.

Arka plandaki teknik sey: 1.0.0 ile yayinlanan arayuz, T43/T43b
denetiminde "CLI = motor, web = arayuz" ayrimi tamamlanmis olsa da, urun
gercegi su durdu:

- **Tek kullanicilik isleri.** Arayuz, `scan`/`clean`/`inventory` gibi
  terminal komutlarinin yaptigi isin **ikinci bir uygulamasi**ydi. Iki
  yuz, ayni is mantigini iki farkli yerde anlatiyordu.
- **Surekli bakim yukunun buyuk kismi.** Web UX fazlari (sanal liste,
  tamponlu SSE, yeniden baglanma, plan calisma alani, kirpma, a11y)
  urunun degeri degil, arayuzun altyapisina harcanan isti.
- **Derleme/veri/React bagimliliklari.** `vite`, `react-dom`,
  `@tanstack/react-virtual`, `@vitejs/plugin-react` — hepsi yalnizca
  arayuz icindi.

Sonuc: urun **terminal aracidir**; arayuz onu daha guzel gosteren bir
kabuktan ibarettir. Kabuk ise urunun cekirdegi degildir.

---

## 2. Ne silindi (geri alinabilir: git)

| Silinen | Notlar |
|---|---|
| `web/` (24 dosya) | React 19 + Vite arayuzu: `App.tsx`, `components/*` (13), `util/*`, `i18n.tsx`, `labels.ts`, `styles.css`, `index.html`, `tsconfig.json` |
| `vite.config.ts` | HMR gelistirme sunucusu + `/api` proxy |
| `src/actions/desktop-shortcut.ts` | Masaustu `.lnk` olusturan/kaldiran kod (T40) |
| `src/core/contract.ts` → `DesktopShortcutView` | Kisa yol sozlesmesi |
| `src/web/server.ts` → `/api/shortcut/desktop` | Kisa yol rotalari (3 adet) |
| `package.json` → `ui:web`, `build:web`, `dev`, `dev:api`, `prepack` | Vite scriptleri |
| `package.json` → devDependencies | `vite`, `@vitejs/plugin-react`, `@types/react-dom`, `@tanstack/react-virtual` silindi. **`@types/react` KALDI**: Ink terminal arayüzü (`src/ui/*.tsx`) React kullanıyor |
| `package.json` → dependency `react-dom` | Yalnizca tarayici arayuzu kullanirdi (`react` kaldi: Ink bunu kullanir) |
| `dist/web/` | Derleme ciktilari |

Masaustundeki gercek kisayol (`%USERPROFILE%\Desktop\Residue.lnk`) de
silindi. **Baskasinin kisayollari dokunulmadi** (kod yolu da ayni
disiplini uygulardi: yalnizca "bizim" olan silinir).

## 3. Ne kaldi (motor — yeniden yapim bunun uzerine kurulacak)

| Katman | Dosyalar | Durum |
|---|---|---|
| **Cekirdek motor** | `src/core/*.ts` — `cluster-query`, `selection-scope`, `scan-summary`, `cli-inventory-query`, `findings-query`, `plan-summary`, `target-map`, `evidence-text`, `approval`, `target-commands`, `cli-command-text`, `plan-clock`, `selection` | **Korundu.** Saf TS; node builtin importu YOK. |
| **Servis katmani** | `src/services/*` (Scan/Delete/CliInventory/CliRemoval/CliRepair/CliQuarantine + `errors`, `ids`) | **Korundu.** HTTP/SSE bilmez; olaylari `emit` ile disari verir. |
| **Sozlesme** | `src/core/contract.ts` | **Korundu.** API'nin gidis-gelis tipleri. |
| **HTTP/SSE adaptoru** | `src/web/server.ts` + `src/web/http.ts` | **Korundu, basliga donusturuldu.** `createApiServer()` / `runApi()`; statik dosya sunmaz, Vite derlemez. |
| **Kalici durum** | `src/store/scan-cache.ts`, `src/store/settings.ts` | **Korundu.** CLI de kullanir (`clean` "tarama bayatti" isareti yazar). |
| **Terminal arayuzu** | `src/ui/` (Ink 8) | **Korundu.** `residue ui` → TUI. |
| **CLI komutlari** | `src/commands/*` | **Korundu.** `scan`, `clean`, `inventory`, `repair`, `quarantine`, `explain`, `undo`, `log`, `rules`, `doctor`, `status`. |

### 3.1 Davranış değişiklikleri (2.0.0)

| Önce | Sonra |
|---|---|
| `residue` → tarayıcı arayüzünü açar | `residue` → **yardım metnini** basar (hiçbir şey başlatmaz) |
| `residue ui` → web | `residue ui` → **Ink terminal arayüzü** |
| `residue ui --web` | kaldırıldı (`--tui` geriye uyumluluk olarak kabul edilir) |
| — | **`residue api [--port n]`** → başsız HTTP/SSE API (127.0.0.1, token'li) |
| `residue ui --browser edge` | kaldırıldı (tarayıcı açma kodu silindi) |
| `residue status` gösterir | aynı |

---

## 4. Öğrenilenler (yeniden yapımda TEKRARLAMA)

1. **Karar mantigi arayuzde olmaz.** T43b denetimi web'de ~190 satır iş
   mantığı buldu; hepsi `src/core/`e taşındı. **Arayuz yalnizca gosterir.**
   Yeni kural eklerken once motora yaz.
2. **Motor tek "query.ts" degil, sorumluluk siniflari olur.** God class
   yazmak yasak (AGENTS.md kural 12). Her sinif tek is yapar.
3. **Arayuzun kendi dogrulama mantigi olmaz.** Onay ifadeleri (`TASI`,
   `SIL`, `ONAR`, `KARANTINA`, `BOŞALT`), filtreler, siralama, secim ozeti
   **tek kaynaktan** gelir (`src/core/approval.ts`, `cluster-query.ts`,
   `plan-clock.ts` ...).
   Istemci sabit literal gondermez; sunucu dogrular.
4. **Sanal liste + tampon olmadan 100+ kume yavaslar.** Yeniden yapilirsa
   sanal liste (`@tanstack/react-virtual` veya dengi) ve SSE tamponu
   (120 ms + rAF) ilk günden tasarlanir.
5. **SSE yeniden baglanmasi olmadan "tarama dondu" sanilir.** `Last-Event-ID`
   + sunucu tamponu (2000 olay) ilk günden gelir.
6. **Iki onay ayri tutulur.** Disk plani ve CLI kaldirma plani ayri onay
   ister; birlesik gorunum salt okunur olur.
7. **Nuke All yoktur.** Toplu eylem yalniz **plan** uretir; uygulama icin
   ayrica yazili onay gerekir.
8. **Tema ve yogunluk bir tercih, dogru/yanlis degil.** Arayuzun varligi
   bile bir urun karari; "yokken de urun calisiyor" olmali.

---

## 5. Yeniden yapim icin mimari (onerilen)

```
web/                     React/Vite (YENIDEN OLUSUR)
  src/api.ts             tek API istemcisi (token yonetimi)
  src/ui/                yalniz GOSTERIM bileşenleri
src/web/server.ts        HTTP/SSE adaptoru (VAR — degistirme)
src/services/           is mantigi (VAR — degistirme)
src/core/contract.ts     sozlesme (VAR — sadece ekle)
src/core/*.ts            motor siniflari (VAR — sadece ekle)
```

Kurallar (AGENTS.md 11-13, 18):

- `src/` → `src/web/` baglasi **sifir**; motor HTTP bilmez.
- Arayuz karar mantigi **icermez**; motoru cagirir.
- Istemci **yol gondermez**; yalniz kume anahtari secer.
- Her yeni davranis icin once `src/core/` + test, sonra arayuz.

### 5.1 Ilk teslim edilecek isler (P0)

| # | Is | Kabul kriteri |
|---|---|---|
| P0 | Arayuz kabugu: yerlesik duzen, koyu tema, TR/EN | Terminal ve genis ekran arasinda kirpma yok |
| P0 | `GET /api/meta` + `GET /api/latest` ile doldurma | Tarama sonucu ekranda; yenileme sonrasi korunur |
| P0 | Kume listesi (ilk 25 + `--all`), `ClusterQuery` ile | Siralama/arama motorun ayni sonucunu verir |
| P0 | Onay duvari: `ApprovalRules.phrase` | Orta/yuksek riskte kasaya taşımada `TASI`, kalıcı silmede `SIL` yazılır; küçük harf kabul edilmez (mevcut kural) |
| P0 | Plan ekrani: kume anahtariyla calisma alani | Plandan cikarma basliga gore degil **anahtara** gore calisir |
| P1 | Sanal liste + SSE tamponu + "N yeni oge" rozeti | 100+ kume akici kalir |
| P1 | Kasa ekrani + geri yukleme | `GET /api/vault`, `POST /api/vault/restore` |
| P2 | Ayarlar (tarama onbellegi, surum kontrolu) | `GET/PUT /api/settings` |
| P2 | Birlesik gorunum (disk + CLI) | `GET /api/findings` (salt okunur) |
| P3 | Klavye-oncelikli gezinme + a11y denetimi | TUS/sekme/masaustu okunabilir |

**Yapilmayacaklar:** React'tan vazgecmiyoruz (motor saf TS; arayuz
teknolojisi serbest), ama **yeni bagimlilik ancak gerekceyle** eklenir.

---

## 6. Ilgili belgeler (arsiv)

- `docs/UI-REDESIGN-3COL.md` — 3 sutunlu konsol tasarimi (P0-P5 tamamlandi,
  P6 acik kalmisti). **Arsiv:** arayuz sokuldu.
- `docs/WEB-UX-PLAN.md` — Web UX fazlari 1-2 (Faz 3-8 yapilmadi).
  **Arsiv.**
- `docs/HANDOVER-2026-10-21b.md` — motor/ayur ayrimi denetimi (T43b).
  **Gecerli:** motor tasarimi hala ayakta.

## 7. Riskler

| Risk | Durum |
|---|---|
| Motor "ölü kod" gibi görünebilir | Bilerek korundu: `residue api` ile **canli** ve test edilebilir |
| Servis katmani yalniz API tarafından kullanilir | API + `scratch/test-*.ts` ile her zaman dogrulanir |
| `src/core/contract.ts` literal'leri (`'KARANTINA'`) tek kaynak degil | T43b'nin acik riski; yeniden yapimda tip ihraci ile baglanmali |
| Bagimlilik yuku | Arayuz yokken `react` (Ink) + `tsx` + `typescript` yalniz — minimum |
