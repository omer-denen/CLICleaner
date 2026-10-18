/**
 * Kural listesi.
 *
 * Burada gosterilen sey "uygulama adlari" degil, KANIT -> KARAR
 * donusum kurallaridir. Kaynakta tek bir uygulama adi gecmez; bu
 * yuzden yeni bir arac ciktiginda burada degisiklik gerekmez.
 */

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};

interface RuleDoc {
  id: string;
  when: string;
  becomes: string;
  verdict: string;
  color: string;
}

const RULES: RuleDoc[] = [
  // --- guvenli silinenler ---
  {
    id: 'cachedir-tag',
    when: 'Klasorde CACHEDIR.TAG dosyasi varsa',
    becomes: 'paket onbellegi',
    verdict: 'ONERILEN — yeniden indirilir',
    color: C.green,
  },
  {
    id: 'cacache-store',
    when: 'Klasor adi _cacache / pkgs / repodata / archives ise',
    becomes: 'paket onbellegi',
    verdict: 'ONERILEN — yeniden indirilir',
    color: C.green,
  },
  {
    id: 'npm-lock',
    when: 'package-lock.json veya _npx varsa',
    becomes: 'paket onbellegi',
    verdict: 'ONERILEN',
    color: C.green,
  },
  {
    id: 'temp-path',
    when: 'Yol %TEMP% ile basliyorsa',
    becomes: 'gecici dosyalar',
    verdict: 'ONERILEN — sadece 3+ gun eski dosyalar',
    color: C.green,
  },
  {
    id: 'crash-dump',
    when: 'Icinde .dmp / .mdmp varsa',
    becomes: 'cokme dokumleri',
    verdict: 'ONERILEN — hata ayiklama gecmisi kaybolur',
    color: C.green,
  },
  {
    id: 'updater-dir',
    when: 'Klasor adi -updater / updater ile bitiyorsa',
    becomes: 'guncelleyici artigi',
    verdict: 'ONERILEN',
    color: C.green,
  },
  {
    id: 'electron-cache',
    when: 'Cache / GPUCache / Code Cache alt klasoru varsa',
    becomes: 'masaustu uygulama onbellegi',
    verdict: 'ONERILEN — sadece onbellek klasorleri, ayarlar korunur',
    color: C.green,
  },
  {
    id: 'editor-extensions',
    when: 'extensions/ + extensions.json varsa',
    becomes: 'editor uzanti deposu',
    verdict: 'ONERILEN — yalnizca kullanilmayan ESKI surumler',
    color: C.green,
  },
  {
    id: 'app-versions',
    when: 'app-<surum> kardesleri + Update.exe varsa',
    becomes: 'surumlu uygulama deposu',
    verdict: 'ONERILEN — yalnizca eski surum klasorleri, guncel surum kalir',
    color: C.green,
  },

  // --- bilesik degerlendirme ---
  {
    id: 'cuda-no-gpu',
    when: 'cuDNN/cuBLAS/onnxruntime_providers_cuda.dll VEYA logda "Device: CPU"',
    becomes: 'kullanilamayan GPU runtime',
    verdict: 'ONERILEN — makinede GPU yoksa',
    color: C.cyan,
  },
  {
    id: 'gpu-model-cpu-device',
    when: 'Model yolu gpu/cuda/trt/rtx iceriyor VEYA cihaz CPU',
    becomes: 'GPU model varyanti',
    verdict: 'ONERILEN — CPU modelleri dururken gereksiz',
    color: C.cyan,
  },
  {
    id: 'model-store',
    when: 'model.onnx / tokenizer.json / log: model katalogu',
    becomes: 'model deposu',
    verdict: 'SADECE bilesik parcalar — CPU modelleri korunur',
    color: C.cyan,
  },
  {
    id: 'env-pool',
    when: 'pyvenv.cfg / conda-meta / envs/ / site-packages',
    becomes: 'ortam havuzu',
    verdict: 'DOGRULAMA — 90+ gun eskiyse',
    color: C.yellow,
  },
  {
    id: 'agent-workspace',
    when: 'sessions/ + skills/ + memories/ VEYA ajan gunlugu',
    becomes: 'AI ajan calisma alani',
    verdict: 'DOGRULAMA — oturum gecmisi kaybolur',
    color: C.yellow,
  },
  {
    id: 'skill-store',
    when: 'skills/ icinde SKILL.md VEYA .skill-lock.json varsa',
    becomes: 'AI ajan beceri deposu',
    verdict: 'DOGRULAMA — ogrenilmis beceriler kaybolur',
    color: C.yellow,
  },

  // --- asla otomatik silinmez ---
  {
    id: 'vdisk',
    when: 'Icinde .vhd / .vhdx varsa',
    becomes: 'sanal disk (WSL / Docker / VM)',
    verdict: 'KORUNUR — WSL dagitimi bozulur',
    color: C.red,
  },
  {
    id: 'sdk-install',
    when: 'Icinde sdk/ + shared/ + tools/ varsa',
    becomes: 'SDK kurulumu',
    verdict: 'KORUNUR — projeler derlenmez',
    color: C.red,
  },
  {
    id: 'vpn-config',
    when: 'Icinde .ovpn / vpn yapilandirmasi varsa',
    becomes: 'kullanici verisi',
    verdict: 'KORUNUR — VPN ayarlari silinir',
    color: C.red,
  },
  {
    id: 'unclassified',
    when: 'Yukaridaki hicbir isaret bulunamadi',
    becomes: 'tanimlanamayan klasor',
    verdict: 'DOGRULAMA — icerik gozden gecirilmeli',
    color: C.yellow,
  },
];

export function runRules(): void {
  console.log(`\n${C.bold}CLICleaner kurallari${C.reset}`);
  console.log(`${C.gray}Hicbir uygulama adi kuralda gecmez; yalnizca kanit turleri kullanilir.${C.reset}\n`);

  const groups = [
    { title: 'Guvenle temizlenir', items: RULES.filter((r) => r.verdict.startsWith('ONERILEN') && r.id !== 'model-store') },
    { title: 'Bilesik degerlendirme', items: RULES.filter((r) => r.id === 'model-store' || r.id.startsWith('cuda') || r.id.startsWith('gpu')) },
    { title: 'Dikkat gerektirir', items: RULES.filter((r) => r.verdict.startsWith('DOGRULAMA') && r.id !== 'unclassified') },
    { title: 'Asla otomatik silinmez', items: RULES.filter((r) => r.verdict.startsWith('KORUNUR')) },
    { title: 'Kanit yetersiz', items: RULES.filter((r) => r.id === 'unclassified') },
  ];

  for (const g of groups) {
    if (g.items.length === 0) continue;
    console.log(`${C.bold}${g.title}${C.reset}`);
    for (const r of g.items) {
      console.log(`  ${r.color}*${C.reset} ${C.cyan}${r.id}${C.reset}`);
      console.log(`    ${C.gray}kosul  :${C.reset} ${r.when}`);
      console.log(`    ${C.gray}sonuc  :${C.reset} ${r.becomes}`);
      console.log(`    ${r.color}${r.verdict}${C.reset}`);
    }
    console.log('');
  }

  console.log(`${C.gray}Kendi kuralin eklemek icin: rules.local.ts${C.reset}\n`);
}