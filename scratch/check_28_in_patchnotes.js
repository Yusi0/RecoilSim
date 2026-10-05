const fs = require('fs');
const txt = fs.readFileSync('c:/Users/choez/OneDrive/바탕 화면/11.17.0.txt', 'utf8');

const names = ['G36K', 'JURY', 'GROZA-1', 'KAC SRR', 'SA58 OSW', 'SPARKLER', 'G36C', 'FAL PARA SHORTY', 'KRISS VECTOR', 'VSS VINTOREZ', 'BREN 2 PPS', 'SL-8', 'SA58 SPR', 'MG3KWS', 'FALO 50.41', 'KORD-R', 'MG36', '1858 NEW ARMY', 'SPAS-12', 'MCX SPEAR', 'FAL 50.63 PARA', 'BREN 2 BR', 'BEOWULF ECR', 'K2', 'G38', 'G36', 'M1911', 'HARDBALLER'];

const lines = txt.split('\n');

for (const name of names) {
  const matches = [];
  // search by name or common alias
  const patterns = [name];
  if (name === 'G36K') patterns.push('AR36K', 'STG-91K');
  if (name === 'G36C') patterns.push('AR36C', 'STG-91C');
  if (name === 'G36') patterns.push('AR36', 'STG-91');
  if (name === 'MG36') patterns.push('IAR36', 'MG91');
  if (name === 'SL-8') patterns.push('PL8', 'VG-98');
  if (name === 'BREN 2 PPS') patterns.push('VZ. 806 PPS', 'VZ.806 PPS');
  if (name === 'BREN 2 BR') patterns.push('VZ. 806 BR', 'VZ.806 BR');
  if (name === 'G38') patterns.push('M38A7', 'M38A5');

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    for (const pat of patterns) {
      if (l.toUpperCase().includes(pat.toUpperCase())) {
        matches.push({ lineNum: i + 1, text: l.trim() });
        break;
      }
    }
  }

  console.log(`\n================ Weapon: ${name} (Matches: ${matches.length}) ================`);
  for (const m of matches.slice(0, 8)) {
    console.log(`  Line ${m.lineNum}: ${m.text}`);
  }
  if (matches.length > 8) console.log(`  ... and ${matches.length - 8} more matches`);
}
