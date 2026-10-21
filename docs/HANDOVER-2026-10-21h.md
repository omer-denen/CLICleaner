# Devir belgesi — 21.10.2026 · 2.2.0 arayüz (M5: cila + yayın hazırlığı)

> **Konum:** `C:\Users\Code\source\repos\residue-cleaner`
> **Durum:** M0–M5 tamam; sürüm **2.2.0** (yerel). Tag/publish **kullanıcı
> onayı bekliyor.**
> **Test:** `npm test` **92/92**; `npm run smoke` **34/34**;
> `npm run smoke:package` temiz; typecheck (src + web) temiz;
> `build:web` **111.65 KB gzip** JS + 4.74 KB gzip CSS.
>
> Önceki belge: `docs/HANDOVER-2026-10-21g.md` (M4).

---

## 1. Oturumun talebi

Kullanıcı: **"kaldığımız yerden devam et"**, ardından **"ego browser da
işlemleri görsem"**. AGENTS.md sıradaki iş: **T44 / D4 — M5: cila + yayın**.

Bağlayıcı kurallar:

1. Klavye-only tur: `Tab`, `Enter`, `Esc`, `Space`, `/`.
2. a11y: etiket, odak halkası, kontrast, `role="alert"`.
3. Headless smoke + paket smoke.
4. Tarayıcı doğrulaması **ego-browser** (kural 19).
5. **Tag/publish kullanıcı onayı olmadan yapılmaz.**

---

## 2. Klavye ve erişilebilirlik

### 2.1 Klavye katmanı (`web/src/App.tsx`)

- **"İçeriğe geç"** (`a.skip-link` → `main#main`); `main` `tabIndex={-1}`.
- **Rail:** roving tabindex; `↑ ↓ Home End`; aktif öğe `aria-current="page"`.
- **`/`** → ekranın `[data-search]` alanına odak + metni seçer. Yazı
  alanındayken kısayol çalışmaz (literal `/` yazılır).
- **`?`** → kısayol penceresi. `role="dialog"`, `aria-modal`, `aria-labelledby`,
  odak tuzağı (`Tab`/`Shift+Tab`), `Esc`, arka plana tıklama; kapanınca odak
  açan öğeye döner. Topbar'da `?` düğmesi (`aria-keyshortcuts="?"`).
- **`Esc`** → açık pencereyi kapatır; değilse odaktaki alandan çıkar.
- **Satırlar:** `role="row"` (geçersizdi) kaldırıldı. Başlık artık
  `button.row-open`:
  - `aria-label="Ayrıntıyı aç: <ad>"`
  - `aria-current="true"` (açık satır)
  - `Tab` onay kutusu → `Space` seçim → `Tab` satır eylemi → `Enter` panel.
- **"Listeye geç"** bağlantıları: `#cluster-list` (Disk), `#cli-list`
  (Araçlar). Pazarlıksız 2 adımda listeye giriş.

### 2.2 a11y

- `:focus-visible` halkası: rail, satır eylemi, bağlantı, tüm form alanları.
- Canlı seçim duyurusu: `role="status"` + `aria-live="polite"` (Disk,
  Araçlar). Ölçüldü: `6 seçili · 5.5 GB` → `7 seçili · 15.4 GB`.
- Tarama çubuğu `role="progressbar"` (`aria-valuemin/max/now`).
- Risk noktası `role="img"` + `aria-label`.
- Tüm hata banner'ları `role="alert"` (9 dosya).
- `main[aria-busy]`; `prefers-reduced-motion` tüm animasyonları kapatır.
- `--faint` `#5d6b7c` → `#74839a` (koyu zeminde ~4.9:1).
- Sabit `aria-label="profile"` → TR/EN `disk.filter.profile`.

### 2.3 Stil

- `.skip-link`, `.skip-inline`, `.sr-only`, `.row-open`, `.shortcuts*`,
  `kbd`, odak halkaları, azaltılmış hareket bloğu.

---

## 3. Duman testleri

### 3.1 `npm run smoke`

`scripts/smoke-web.mjs` — boş portta `ui --web` başlatır.

| Kontrol | Sonuç |
|---|---|
| `GET /` + `div#root` + `text/html` | 200 |
| Çerez `HttpOnly`, `SameSite=Strict` | var |
| HTML'de `residue_token` / `token=` | **yok** |
| Statik JS (hash'li) | 200 |
| Tokensız `/api/meta` | **401** |
| Yabancı `Host` | **403** |
| 17 okuma ucu (meta, dashboard, disk, latest, update, scan/status, findings, settings, env, projects/roots, graph, schedules, catchup, history, recover, vault, cli/view) | **200** |
| `projects/discover` köksüz | **400** (yol uydurulmaz) |
| `POST /api/plan` boş seçim | **400** |
| `POST /api/schedules` onaysız | **400** |
| `POST /api/vault/purge` yanlış ifade | **400** |
| `POST /api/env/apply` plansız | **404** |
| `POST /api/execute` geçersiz plan | 4xx |

`--base=http://127.0.0.1:<port>` ile çalışan sunucuya karşı da koşar.

### 3.2 `npm run smoke:package`

`scripts/smoke-package.mjs`:

1. `npm pack` → `residue-cleaner-2.x.x.tgz`
2. Geçici klasöre `npm install <tarball>`
3. Paketlenmiş `node bin/residue.mjs ui --web --no-browser`
4. `smoke-web.mjs --base=…` (aynı 34 kontrol)
5. Sunucu kapatılır, geçici klasör silinir.

Gerçek çıktı: **paket smoke temiz** (2.2.0 tarball; 46 paket, `dist/web`
dahil).

### 3.3 Mevcut testler

- `npm test` **92/92**.
- `tests/shell-boundary.test.ts`: `web/src` node builtin'i, servis/aksiyon
  katmanı veya çekirdek karar sınıflarını import edemez (M5 değişiklikleri
  bu sınırı aşmadı).

---

## 4. Gerçek tarayıcı turu (ego-browser)

- Space 6: Genel Bakış, skip link, `/` arama (`uv` → 1 sonuç), `?` diyaloğu,
  canlı seçim (6 → 20), satır detayı. Space kapandıktan sonra Space 7.
- Space 7: Planlar (`Kural oluştur` **pasif**, `PLANLA` duvarı), Ayarlar
  (güncelleme modu kapalı; `/api/update` isteği **0**).
- Görseller:
  - `scratch/ego-m5-01-dashboard.png`
  - `scratch/ego-m5-02-skip-link.png`
  - `scratch/ego-m5-03-disk-search.png`
  - `scratch/ego-m5-04-shortcuts.png`
  - `scratch/ego-m5-05-row-detail.png`
  - `scratch/ego-m5-06-skip-list.png`
  - `scratch/ego-m5-07-row-detail.png`
  - `scratch/ego-m5-08-schedules.png`
  - `scratch/ego-m5-09-settings.png`
- **Gerçek silme, plan çalıştırma, env yazımı yapılmadı.**

---

## 5. Sürüm ve yayın

- `package.json` + `package-lock.json`: **2.2.0**.
- `CHANGELOG.md`: `## [2.2.0] - 2026-10-21`; M5 maddeleri eklendi.
- `README.md` + `README.en.md`: 2.0.0'daki "yalnızca terminal" notu
  düzeltildi; **"Tarayıcı arayüzü (2.2.0)" / "Browser UI (2.2.0)"** bölümü
  (ekranlar, çerez token, klavye, iki aşamalı onay, opt-in güncelleme) ve
  yeni SSS maddeleri eklendi.
- **Yayınlandı (21.10.2026):**
  - `npm publish` → `residue-cleaner@2.2.0`, dist-tag `latest`.
  - Yayınlanan paket ayrı klasöre kuruldu (46 paket); `dist/web` içinde.
  - Paketlenmiş `ui --web` **:4411** üzerinde çalıştırıldı ve
    `smoke-web --base` **34/34 temiz**.
  - `npx residue-cleaner@2.2.0 --version` (temiz klasör) → `2.2.0`.
  - `git tag v2.2.0`; `main` + tag GitHub'a gönderildi (commit `982ac77`).
- **Kalan (elle):** GitHub Release sayfaları — `v2.2.0` ve daha önce
  açılmamış `v2.1.0`. `gh` CLI kurulu değil; başlık = tag adı (AGENTS 17).
- **Not:** `npm publish` çıktısı `bin[residue] ... was invalid` uyarısı
  verdi; bu yalnızca `./bin/...` → `bin/...` normalizasyonudur, yayınlanan
  manifestte `bin` **korunmuştur** (kurulumla doğrulandı). Bir sonraki
  sürümde `package.json` doğrudan `bin/...` yazılarak uyarı susturulabilir.
- Doğrudan tarball URL'i (`/-/residue-cleaner-2.2.0.tgz`) yayından sonraki
  ilk dakikalarda 404 döndü; `npm install` ve `npx` paketi **normal indirdi**
  (kayıt CDN kenarı gecikmesi). Bu oturumda ek işlem gerekmedi.

---

## 6. Açık riskler

1. **Gerçek plan çalıştırma** hâlâ test edilmedi (yalnız önizleme).
2. **Kural düzenleme** ucu yok (sil + yeniden oluştur).
3. **`npx residue-cleaner@2.2.0`** yalnız yayından sonra denenebilir; paket
   smoke yerel tarball ile aynı yolu doğruladı.
4. **T54** (eski CLICleaner kalıntıları) planlı; M5 kapsamı değil.
5. GitHub Release `v2.1.0` hâlâ elle açılmadı.
6. Sunucu `:4399` oturumluk; oturum kapanınca durur.

---

## 7. Dosya haritası (bu oturum)

| Dosya | Değişiklik |
|---|---|
| `web/src/App.tsx` | Skip link, rail ok tuşları, `/`, `?`, odak tuzağı, `aria-busy` |
| `web/src/screens/Disk.tsx` | `row-open` düğmesi, liste skip link, `progressbar`, canlı seçim |
| `web/src/screens/Tools.tsx` | `row-open`, liste skip link, canlı seçim |
| `web/src/screens/Projects.tsx` | `data-search` |
| `web/src/screens/{Env,Graph,PlanScreen,Schedules,Projects,Settings,Tools,Vault}.tsx` | `role="alert"` hata banner'ları |
| `web/src/i18n.ts` | Klavye/a11y anahtarları (TR + EN) |
| `web/src/styles.css` | Skip link, sr-only, odak halkası, kısayol penceresi, kontrast, azaltılmış hareket |
| `scripts/smoke-web.mjs` | **YENİ** — headless HTTP smoke |
| `scripts/smoke-package.mjs` | **YENİ** — pack + install + smoke |
| `package.json` | 2.2.0; `smoke`, `smoke:package` |
| `CHANGELOG.md` | `[2.2.0]` + M5 maddeleri |
| `README.md` | 2.2.0 arayüz notu |
| `docs/T44-PLAN.md`, `SESSION_LOG.md`, `AGENTS.md`, `state.json` | Durum |

---

## 8. Sonraki oturumun ilk adımları

1. **Oku:** `AGENTS.md` → `SESSION_LOG.md` (en üst M5) → bu belge.
2. **Doğrula:** `git status`, `npm run typecheck`, `npm test`,
   `npm run build:web`, `npm run smoke`.
3. **GitHub Release sayfalarını elle aç:** `v2.2.0` ve `v2.1.0`
   (başlık = tag adı).
4. **Sonra:** T30 (global AI artıkları) → T37 (yarım güncelleme artıkları)
   → T54 (eski CLICleaner kalıntıları, ayrı onay).
