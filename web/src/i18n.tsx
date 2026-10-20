import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * Arayuz dili.
 *
 * Anahtar olarak TURKCE metnin kendisi kullanilir; sozluk yalnizca
 * EN karsiligini tutar. Boylece eksik ceviri sessizce Turkce'ye duser
 * ve yeni metin eklemek icin anahtar uretmek gerekmez.
 *
 * NOT: Sunucudan gelen karar/kanit metinleri cekirdekte Turkce
 * uretilir; bu katman yalnizca arayuz kromunu cevirir.
 */

export type Lang = 'tr' | 'en';

export type TFn = (tr: string, vars?: Record<string, string | number>) => string;

const LANG_KEY = 'clicleaner.lang';

const EN: Record<string, string> = {
  // --- topbar ---
  'kanıt görünür, silme onaylı': 'evidence first, deletion approved',
  'Yeniden tara': 'Rescan',
  İncele: 'Inspect',
  'İncele (tara ve kanıtları göster)': 'Inspect (scan and show evidence)',
  'İnceleniyor…': 'Inspecting…',
  'Disk incelemesi': 'Disk inspection',
  'Diskini tarar, hangi klasörün ne olduğunu kanıtlarıyla gösterir; hiçbir şeyi sen onaylamadan silmez.':
    "Scans your disk and shows what each folder is with evidence; it deletes nothing without your approval.",
  'Hiçbir şey sen onaylamadan silinmez.': 'Nothing is deleted without your approval.',
  'Son sonucu göster': 'Show last result',
  'Son inceleme: {date}': 'Last inspection: {date}',
  'Son inceleme: {date} · {bytes} · {clusters} küme':
    'Last inspection: {date} · {bytes} · {clusters} clusters',
  'Kurulu CLI\'ları incelemek için "İncele"ye bas; hiçbir şey silinmez.':
    'Press "Inspect" to review installed CLIs; nothing is deleted.',
  'Geri dönüşüm': 'Recycle Bin',
  'Kalıcı sil': 'Delete permanently',
  'Geri dönüşüm kutusuna taşınır; geri alınabilir': 'Moves to the Recycle Bin; reversible',
  'Kalıcı silme; geri alınamaz': 'Permanent deletion; irreversible',
  Disk: 'Disk',
  "CLI'lar": 'CLIs',
  Kapat: 'Close',
  'Dil': 'Language',
  'Silme modu': 'Deletion mode',

  // --- proje taramasi (--root) ---
  'İncele (tüm yapıyı tara)': 'Inspect (scan the whole system)',
  'Projeyi Tara': 'Scan a project',
  'Projeyi tara (klasör seç ve tara)': 'Scan a project (choose a folder and scan)',
  'Proje klasörü seç': 'Choose the project folder',
  'Seçilen klasörün doğrudan alt klasörleri taranacak (proje kökünü seçin).':
    'The direct subfolders of the selected folder are scanned (choose the project root).',
  'Yükleniyor...': 'Loading...',
  'Alt klasör yok': 'No subfolders',
  'Üst klasör': 'Parent folder',
  'İptal': 'Cancel',
  'Seç ve Tara': 'Select and scan',
  'Proje taraması salt rapordur; silme hedefi üretilmez.':
    'A project scan is report-only; it never produces delete targets.',
  'Git tarafından takip edilen yollar atlandı (tracked dosyalar silinmez).':
    'Git-tracked paths were skipped (tracked files are never deleted).',
  'Git tarafından takip edilen yollar atlandı': 'Git-tracked paths were skipped',

  // --- overlay ---
  'Plan hazırlanıyor…': 'Preparing plan…',
  'Seçilen kümeler ve silinecek yollar doğrulanıyor.': 'Verifying the selected clusters and delete paths.',

  // --- summary ---
  Taranan: 'Scanned',
  Silinebilir: 'Reclaimable',
  Seçili: 'Selected',
  Kararlar: 'Decisions',
  '{files} dosya · {clusters} küme': '{files} files · {clusters} clusters',
  'yeniden üretilebilir veya kullanılamaz': 'reproducible or unusable',
  '{clusters} küme · {targets} hedef': '{clusters} clusters · {targets} targets',
  '{n} küme': '{n} clusters',
  '{rec} önerilen · {ask} doğrulama · {ro} rapor': '{rec} recommended · {ask} verify · {ro} report',

  // --- toolbar ---
  'Ara: başlık, anahtar, yol…': 'Search: title, key, path…',
  Tümü: 'All',
  Önerilen: 'Recommended',
  Doğrulama: 'Verify',
  Rapor: 'Report',
  Korunuyor: 'Protected',
  'Görünenleri seç': 'Select visible',
  'Seçimi temizle': 'Clear selection',

  // --- sections ---
  'Yeniden üretilebilir; varsayılan olarak seçili.': 'Reproducible; selected by default.',
  'Silmeden önce içeriği incelemen gerekiyor.': 'Review the content before deleting.',
  'Otomatik silinmez; yalnızca raporlanır.': 'Never deleted automatically; report only.',
  'Korunuyor.': 'Protected.',

  // --- empty ---
  'Taranacak klasör bulunamadı.': 'No folders found to scan.',
  'Aramanla eşleşen küme yok.': 'No cluster matches your search.',

  // --- actionbar ---
  '{bytes} seçili · {clusters} küme · {targets} hedef':
    '{bytes} selected · {clusters} clusters · {targets} targets',
  'seçili · {clusters} küme · {targets} hedef':
    'selected · {clusters} clusters · {targets} targets',
  'Planla ve onayla': 'Plan and confirm',

  // --- done ---
  Tamamlandı: 'Done',
  '{bytes} boşaltıldı': '{bytes} freed',
  '{n} dosya/klasör işlendi': '{n} files/folders processed',
  '· {n} atlandı': '· {n} skipped',
  '· {n} hata': '· {n} errors',
  'Kalıcı silindi; geri alınamaz.': 'Permanently deleted; irreversible.',
  'Geri dönüşüm kutusunda. Geri almak için Geri Dönüşüm Kutusu’nu aç veya {cmd} kullan.':
    'In the Recycle Bin. To undo, open the Recycle Bin or use {cmd}.',
  'Günlük:': 'Journal:',
  'Yeni tarama': 'New scan',
  'Geri Dönüşüm Kutusu’nu aç': 'Open Recycle Bin',

  // --- progress ---
  'Dizinler taranıyor…': 'Scanning directories…',
  '{done}/{total} dizin · {bytes} ölçüldü': '{done}/{total} directories · {bytes} measured',
  'Tarama süresi cihazınızın hızına bağlıdır; ilk tarama daha uzun sürebilir.':
    'Scan time depends on your device speed; the first scan may take longer.',
  'Taramayı iptal et': 'Cancel scan',
  'Tarama iptal edildi.': 'Scan cancelled.',
  'Taranacak dizinler': 'Directories to scan',
  Bulunanlar: 'Found',
  'Dizin listesi hazırlanıyor…': 'Preparing directory list…',
  'Henüz bulunan yok; dizinler tarandıkça burada listelenir.':
    'Nothing found yet; results appear here as directories are scanned.',
  'Aynı uygulamanın parçaları tarama sonunda birleştirilir.':
    'Parts of the same app are merged when the scan finishes.',
  'İptal ediliyor…': 'Cancelling…',
  'Temizleniyor…': 'Cleaning…',
  '{index}/{total} hedef · %{pct} · {bytes} boşaltıldı': '{index}/{total} targets · {pct}% · {bytes} freed',
  '· bu hedef {n} saniyedir işleniyor': '· this target has been processing for {n}s',
  '{n} atlandı': '{n} skipped',
  '{n} hata': '{n} errors',
  'Büyük klasörlerde bu işlem dakikalar sürebilir; pencereyi kapatma.':
    'For large folders this may take minutes; do not close the window.',

  // --- confirm dialog ---
  'Silme onayı': 'Delete confirmation',
  'KALICI SİLME': 'PERMANENT DELETE',
  'Geri dönüşüm kutusu': 'Recycle Bin',
  '{clusters} küme, {targets} hedef, toplam {bytes}.': '{clusters} clusters, {targets} targets, {bytes} total.',
  'Kalıcı silme geri alınamaz. Emin değilsen “Geri dönüşüm kutusu” modunu kullan.':
    'Permanent deletion cannot be undone. If unsure, use “Recycle Bin” mode.',
  'Dosyalar geri dönüşüm kutusuna taşınır; yanlış karar verirsen geri alabilirsin.':
    'Files move to the Recycle Bin; if you change your mind, you can undo.',
  '{n} küme orta veya yüksek riskli. Silmenin sonucunu yukarıda okudun mu?':
    '{n} clusters are medium or high risk. Did you read what deletion means above?',
  '{n} yüksek riskli kümenin ne kaybettireceğini okudum ve yine de silmek istiyorum.':
    'I read what the {n} high-risk clusters would cost and still want to delete.',
  'Onaylamak için {phrase} yaz:': 'Type {phrase} to confirm:',
  Vazgeç: 'Cancel',
  'Başlatılıyor…': 'Starting…',
  'Kalıcı olarak sil': 'Delete permanently',
  Temizle: 'Clean',
  'klasörün tamamı': 'entire folder',
  'yalnızca {n}+ gün eski dosyalar': 'only files older than {n} days',

  // --- cluster row ---
  'kümesini seç': 'select cluster',
  'seçilemez': 'not selectable',
  kilitli: 'locked',
  'Ne?': 'What?',
  'Silersem ne olur?': 'What if I delete it?',
  'Neden bu karar?': 'Why this decision?',
  'Silmeden önce': 'Before deleting',
  Kanıtlar: 'Evidence',
  'sahip:': 'owner:',
  'Silinecek yollar': 'Delete paths',
  'İç parçalar': 'Sub-parts',
  'Birleştirilen parçalar ({n})': 'Merged parts ({n})',
  '{n} dosya': '{n} files',
  'silinebilir: {bytes}': 'reclaimable: {bytes}',
  'son hareket: {date}': 'last change: {date}',

  // --- token screen ---
  'Web arayüzü her başlatmada rastgele bir bağlantı üretir. Terminalde yazan adresi açtıysan bu adımı atlayabilirsin; olmadıysa tokeni buraya yapıştır.':
    'The web UI generates a random link on each start. If you opened the address printed in the terminal you can skip this; otherwise paste the token here.',
  Bağlan: 'Connect',
  'Bağlantıyı yeniden üretmek için terminalde {cmd} komutunu çalıştır.':
    'To generate a new link, run {cmd} in the terminal.',

  // --- labels ---
  'Paket önbelleği': 'Package cache',
  'Ortam havuzu': 'Runtime pool',
  'Model deposu': 'Model store',
  'GPU runtime': 'GPU runtime',
  'Ajan çalışma alanı': 'Agent workspace',
  'Uygulama önbelleği': 'App cache',
  'Editör uzantı deposu': 'Editor extension store',
  'Sürümlü uygulama deposu': 'Versioned app store',
  'Geçici dosyalar': 'Temporary files',
  'Çökme dökümleri': 'Crash dumps',
  'Güncelleyici artığı': 'Updater leftover',
  'Global paket kurulumu': 'Global package install',
  'Editör çalışma alanı': 'Editor workspace',
  'Proje çalışma alanı': 'Project workspace',
  'Proje bağımlılığı': 'Project dependency',
  'Kullanıcı verisi': 'User data',
  'Sanal disk': 'Virtual disk',
  Tanımlanamayan: 'Unidentified',
  Güvenli: 'Safe',
  Düşük: 'Low',
  Orta: 'Medium',
  Yüksek: 'High',
  'Yeniden üretilebilir': 'Regenerable',
  Belirsiz: 'Uncertain',
  'Güven: yüksek': 'Confidence: high',
  'Güven: orta': 'Confidence: medium',
  'Güven: düşük': 'Confidence: low',

  // --- CLI view (yeni sekme) ---
  'Kurulu CLI envanteri': 'Installed CLI inventory',
  'Kullanılmayan komutları, kurulum kaynağını ve son kullanım kanıtını gösterir; hiçbir şey silmez.':
    'Shows unused commands, install source and last-use evidence; deletes nothing.',
  'Envanteri tara': 'Scan inventory',
  'Envanteri yenile': 'Refresh inventory',
  Yenile: 'Refresh',
  'Atıl eşiği (gün)': 'Idle threshold (days)',
  'Araç': 'Tool',
  'Kaynak': 'Source',
  'Sürüm': 'Version',
  'Son sinyal': 'Last signal',
  'Boyut': 'Size',
  'Durum': 'Status',
  'Atıl': 'Idle',
  'Yakında': 'Recent',
  'Korunan': 'Protected',
  'Bilinmiyor': 'Unknown',
  'Yedekle (durum klasörleri)': 'Back up (state folders)',
  'Seçilenleri planla': 'Plan selected',
  'Kaldırma planı': 'Removal plan',
  '{n} araç seçildi': '{n} tools selected',
  'Yedek': 'Backup',
  'Yedek yok': 'No backup',
  'Kaldırma komutu': 'Uninstall command',
  'Geri kurulum komutu': 'Reinstall command',
  'Kaldırma sonrası onarım': 'Post-removal repair',
  'Onaylamak için SIL yaz:': 'Type SIL to confirm:',
  'Planı uygula': 'Apply plan',
  'Envanter taranıyor…': 'Scanning inventory…',
  'Kurulu CLI envanterini incele': 'Review installed CLI inventory',
  'Kurulu araçları, atıllık kanıtlarını ve kaldırma planlarını görün. Hiçbir şey silinmez.':
    'See installed tools, idle evidence and removal plans. Nothing is deleted.',
  "Kurulu CLI'lar taranıyor; bu işlem biraz zaman alabilir…":
    'Scanning installed CLIs; this may take a little while…',
  'Envanter iptal edildi.': 'Inventory cancelled.',
  'Envanter bağlantısı koptu.': 'Inventory connection lost.',
  '{n} araç bulundu; liste canlı güncelleniyor.':
    '{n} tools found; the list is updating live.',
  'Hiçbir şey silinmez; önce plan gösterilir.': 'Nothing is deleted; the plan is shown first.',
  'Kaldırma paket yöneticisinin kendisiyle yapılmalı.': 'Removal must use the package manager itself.',
  'Kaldırma paket yöneticisinin kendisiyle yapılır; kurulum klasörü elle silinmez.':
    'Removal runs the package manager uninstall; the install folder is never deleted by hand.',
  bağımsız: 'standalone',

  // --- CLI cakisma (ayni komutu iki paket sagliyor) ---
  'Aynı komutun birden fazla kurulumu': 'Multiple installations of the same command',
  "Aynı komutu iki paket sağlıyor. Shim'in gösterdiği aktif kurulum korunur; gölgede kalan eski paket kaldırılabilir.":
    'Two packages provide the same command. The active installation (the one the shim points to) is kept; the shadowed old package can be removed.',
  Aktif: 'Active',
  Gölgede: 'Shadowed',
  'Eski sürümü planla': 'Plan removal of the old version',

  // --- T17: shim sorunlari + PATH golgeleme ---
  'Shim sorunları': 'Shim issues',
  'Shim ağı ile kurulumlar tutarsız. Bu liste yalnızca kanıttır; hiçbir shim silinmez.':
    'The shim network and installations are inconsistent. This list is evidence only; no shim is deleted.',
  'Öksüz shim': 'Orphan shim',
  'Shim yok': 'Missing shim',
  'Boş scope': 'Empty scope',
  'PATH gölgeleme': 'PATH shadowing',
  "Aynı komut PATH'te birden fazla kez var; yalnızca ilki çalışır.":
    'The same command appears more than once on PATH; only the first one runs.',
  Çalışır: 'Active',

  // --- bozuk / yarim kurulum onarimi ---
  'Bozuk / yarım kurulumlar': 'Broken / partial installations',
  'Bin dosyası stub kalmış; kurulum betiği engellenmiş olabilir. Onarım paket yöneticisinin kendisiyle yapılır.':
    'The bin file is a stub; the install script may have been blocked. Repair uses the package manager itself.',
  Bozuk: 'Broken',
  Onar: 'Repair',
  'Kurulum onarımı': 'Installation repair',
  ONARIM: 'REPAIR',
  'Paket yöneticisi paketi yeniden kuracak ve kurulum betiklerini çalıştıracak.':
    'The package manager will reinstall the package and run its install scripts.',
  'Onaylamak için ONAR yaz:': 'Type ONAR to confirm:',
  'Onarımı uygula': 'Apply repair',
  'Onarım tamamlandı.': 'Repair completed.',

  // --- T19: karantina (paket yoneticisi olmayan bagimsiz araclar) ---
  'Bağımsız araçlar (paket yöneticisi yok)': 'Standalone tools (no package manager)',
  "Silinmek yerine karantinaya alınır: komut PATH'ten düşer, durum klasörleriniz yerinde kalır, geri dönüş adımları kasaya yazılır.":
    'Quarantined instead of deleted: the command leaves PATH, your state folders stay in place, and restore steps are written to the vault.',
  'Karantinaya al': 'Quarantine',
  Karantina: 'Quarantine',
  KARANTINA: 'KARANTINA',
  "Shim dosyaları kasaya taşınır (komut PATH'ten düşer); durum klasörleri kasaya kopyalanır, verileriniz yerinde kalır. Geri dönüş adımları RESTORE.md'ye yazılır.":
    'Shim files are moved to the vault (the command leaves PATH); state folders are copied to the vault and your data stays in place. Restore steps are written to RESTORE.md.',
  'Taşınacak shim': 'Shim to move',
  'Kopyalanacak durum klasörü': 'State folder to copy',
  'Onaylamak için KARANTINA yaz:': 'Type KARANTINA to confirm:',
  'Karantinayı uygula': 'Apply quarantine',
  'Karantina tamamlandı.': 'Quarantine completed.',

  // --- disk listesi: sekmeler, siralama, tamamlandi ---
  Kategoriler: 'Categories',
  'Tüm kategoriler': 'All categories',
  'Daha fazla göster ({n})': 'Show more ({n})',
  Sırala: 'Sort',
  'Boyut (büyük → küçük)': 'Size (largest → smallest)',
  'Risk (yüksek → güvenli)': 'Risk (high → safe)',
  'Son hareket (yeni → eski)': 'Last activity (newest → oldest)',
  'Ad (A → Z)': 'Name (A → Z)',
  'Tarama tamamlandı': 'Scan complete',
  '{n} küme · {duration}s': '{n} clusters · {duration}s',
  tarandı: 'scanned',
  silinebilir: 'reclaimable',
  Tamam: 'OK',
};

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const LangContext = createContext<Ctx>({
  lang: 'tr',
  setLang: () => {},
  t: (s) => s,
});

function readStoredLang(): Lang {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    if (v === 'en' || v === 'tr') return v;
  } catch {
    /* yoksay */
  }
  return 'tr';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      /* yoksay */
    }
  }, []);

  const t = useCallback<TFn>(
    (tr, vars) => {
      let s = lang === 'en' ? (EN[tr] ?? tr) : tr;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      }
      return s;
    },
    [lang],
  );

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useI18n(): Ctx {
  return useContext(LangContext);
}
