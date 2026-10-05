const fs = require('fs');
const w16 = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17 = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));
const wIngame = JSON.parse(fs.readFileSync('data/in-game-modules/weapon_database.json', 'utf8'));

const map16 = {};
for (const cat in w16) for (const w of w16[cat]) map16[w.name] = w;

const map17 = {};
for (const cat in w17) for (const w of w17[cat]) map17[w.name] = w;

function extractStats(wIn) {
  if (!wIn) return {};
  const res = {
    walkspeed: wIn.walkspeed,
    multhead: wIn.multhead,
    multtorso: wIn.multtorso,
    rpm: wIn.firerate,
    magsize: wIn.magsize,
    chamber: wIn.chamber,
    sparerounds: wIn.sparerounds,
    displayName: wIn.displayName
  };
  if (wIn.damageGraph && Array.isArray(wIn.damageGraph)) {
    if (wIn.damageGraph[0]) res.damage0 = wIn.damageGraph[0].damage;
    if (wIn.damageGraph[1]) {
      res.range0 = wIn.damageGraph[1].distance;
      if (wIn.damageGraph.length === 2) {
        res.damage1 = wIn.damageGraph[1].damage;
      }
    }
    if (wIn.damageGraph[2]) {
      res.damage1 = wIn.damageGraph[2].damage;
      res.range1 = wIn.damageGraph[2].distance;
    }
  }
  return res;
}

const names = ['G36K', 'JURY', 'GROZA-1', 'KAC SRR', 'SA58 OSW', 'SPARKLER', 'G36C', 'FAL PARA SHORTY', 'KRISS VECTOR', 'VSS VINTOREZ', 'BREN 2 PPS', 'SL-8', 'SA58 SPR', 'MG3KWS', 'FALO 50.41', 'KORD-R', 'MG36', '1858 NEW ARMY', 'SPAS-12', 'MCX SPEAR', 'FAL 50.63 PARA', 'BREN 2 BR', 'BEOWULF ECR', 'K2', 'G38', 'G36', 'M1911', 'HARDBALLER'];

for (const name of names) {
  const inStats = extractStats(wIngame[name]);
  const a16 = map16[name];
  const a17 = map17[name];
  console.log('=== Weapon: ' + name + ' ===');
  for (const k of ['damage0', 'damage1', 'range0', 'range1', 'multhead', 'multtorso', 'rpm', 'walkspeed', 'sparerounds', 'magsize', 'displayName']) {
    if (a16[k] !== a17[k]) {
      console.log('  ' + k + ': API_16=' + a16[k] + ' | Ingame_16=' + inStats[k] + ' | API_17=' + a17[k]);
    }
  }
}
