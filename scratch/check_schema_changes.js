const fs = require('fs');

const w16 = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17 = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));

// Check infolist vs info conversion
let infolistCount16 = 0, infolistCount17 = 0;
let infoCount16 = 0, infoCount17 = 0;

for (const cat in w16) {
  for (const w of w16[cat]) {
    for (const slot in w.attachments) {
      for (const a in w.attachments[slot]) {
        const item = w.attachments[slot][a];
        if (item.infolist !== undefined) infolistCount16++;
        if (typeof item.info === 'string') infoCount16++;
      }
    }
  }
}

for (const cat in w17) {
  for (const w of w17[cat]) {
    for (const slot in w.attachments) {
      for (const a in w.attachments[slot]) {
        const item = w.attachments[slot][a];
        if (item.infolist !== undefined) infolistCount17++;
        if (typeof item.info === 'string') infoCount17++;
      }
    }
  }
}

console.log('11.16: infolist count =', infolistCount16, '| info string count =', infoCount16);
console.log('11.17: infolist count =', infolistCount17, '| info string count =', infoCount17);

// Check if any indexPath schema changed in attachmentModifiers
let pathTypes16 = new Set(), pathTypes17 = new Set();
for (const cat in w16) {
  for (const w of w16[cat]) {
    for (const slot in w.attachments) {
      for (const a in w.attachments[slot]) {
        const mods = w.attachments[slot][a].attachmentModifiers;
        if (!mods) continue;
        for (const mType in mods) {
          if (!Array.isArray(mods[mType])) continue;
          for (const m of mods[mType]) {
            if (m.indexPath) {
              pathTypes16.add(m.indexPath.map(p => Array.isArray(p) ? 'array' : typeof p).join('.'));
            }
          }
        }
      }
    }
  }
}

for (const cat in w17) {
  for (const w of w17[cat]) {
    for (const slot in w.attachments) {
      for (const a in w.attachments[slot]) {
        const mods = w.attachments[slot][a].attachmentModifiers;
        if (!mods) continue;
        for (const mType in mods) {
          if (!Array.isArray(mods[mType])) continue;
          for (const m of mods[mType]) {
            if (m.indexPath) {
              pathTypes17.add(m.indexPath.map(p => Array.isArray(p) ? 'array' : typeof p).join('.'));
            }
          }
        }
      }
    }
  }
}

console.log('Path schema variants in 11.16:', pathTypes16.size);
console.log('Path schema variants in 11.17:', pathTypes17.size);
const newPathTypes = [...pathTypes17].filter(p => !pathTypes16.has(p));
console.log('New path types in 11.17:', newPathTypes);
