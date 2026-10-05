const fs = require('fs');

const w16 = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17 = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));
const patchText = fs.readFileSync('c:/Users/choez/OneDrive/바탕 화면/11.17.0.txt', 'utf8');

const map16 = {};
for (const cat in w16) for (const w of w16[cat]) map16[w.name] = w;

const map17 = {};
for (const cat in w17) for (const w of w17[cat]) map17[w.name] = w;

// Find all unique attachments with modifier differences
const attDiffsByName = {};

for (const name in map16) {
  if (!map17[name]) continue;
  const atts16 = map16[name].attachments || {};
  const atts17 = map17[name].attachments || {};

  for (const slot in atts16) {
    if (!atts17[slot]) continue;
    for (const aName in atts16[slot]) {
      if (!atts17[slot][aName]) continue;
      const m16 = JSON.stringify(atts16[slot][aName].attachmentModifiers || {});
      const m17 = JSON.stringify(atts17[slot][aName].attachmentModifiers || {});
      if (m16 !== m17) {
        if (!attDiffsByName[aName]) {
          attDiffsByName[aName] = {
            name: aName,
            slots: new Set(),
            sampleWeapon: name,
            mod16: atts16[slot][aName].attachmentModifiers,
            mod17: atts17[slot][aName].attachmentModifiers,
            count: 0
          };
        }
        attDiffsByName[aName].slots.add(slot);
        attDiffsByName[aName].count++;
      }
    }
  }
}

console.log('Total unique attachment names with modifier differences:', Object.keys(attDiffsByName).length);

// Check each against patch notes
const inPatchNotes = [];
const notInPatchNotes = [];

for (const aName in attDiffsByName) {
  const item = attDiffsByName[aName];
  // Simple check in patch notes
  const upper = aName.toUpperCase();
  const found = patchText.toUpperCase().includes(upper);
  item.inPatch = found;
  if (found) inPatchNotes.push(item);
  else notInPatchNotes.push(item);
}

console.log('Modified attachments mentioned in patch notes:', inPatchNotes.length);
console.log('Modified attachments NOT mentioned directly by exact name in patch notes:', notInPatchNotes.length);

console.log('\n--- Sample in patch notes (first 25): ---');
for (const item of inPatchNotes.slice(0, 25)) {
  console.log(`- ${item.name} (${[...item.slots].join(', ')} on ${item.count} weapons)`);
}

console.log('\n--- Sample NOT in patch notes by exact name (first 25): ---');
for (const item of notInPatchNotes.slice(0, 25)) {
  console.log(`- ${item.name} (${[...item.slots].join(', ')} on ${item.count} weapons)`);
}
