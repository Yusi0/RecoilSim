import * as fs from 'fs';
import * as path from 'path';

const attsPath = path.resolve('data/canonical/11.17-provisional/attachments.json');
const attDbPath = path.resolve('data/in-game-modules/attachment_database.json');
const overridesPath = path.resolve('data/in-game-modules/attachment_overrides.json');
const candsPath = path.resolve('data/classifier_candidates_11_17.json');

const atts = JSON.parse(fs.readFileSync(attsPath, 'utf8'));
const attDb = fs.existsSync(attDbPath) ? JSON.parse(fs.readFileSync(attDbPath, 'utf8')) : {};
const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')).modules || {} : {};
const cands = JSON.parse(fs.readFileSync(candsPath, 'utf8'));

interface PathInfo {
  count: number;
  attachments: Set<string>;
  types: Set<string>;
  sampleValues: any[];
}

const pathMap = new Map<string, PathInfo>();

function recordPath(p: string, attName: string, type: string, val: any) {
  if (!p) return;
  if (!pathMap.has(p)) {
    pathMap.set(p, { count: 0, attachments: new Set(), types: new Set(), sampleValues: [] });
  }
  const entry = pathMap.get(p)!;
  entry.count++;
  if (entry.attachments.size < 5) entry.attachments.add(attName);
  entry.types.add(type);
  if (entry.sampleValues.length < 3) entry.sampleValues.push(val);
}

// 1. Canonical attachments
for (const [id, a] of Object.entries(atts as Record<string, any>)) {
  for (const m of (a.modifiers || [])) {
    const p = m.indexPath ? m.indexPath.join('.') : '';
    recordPath(p, a.name || id, m.type, m.value);
    if (p === 'animationmods' && typeof m.value === 'object' && m.value !== null) {
      for (const [k, v] of Object.entries(m.value)) {
        recordPath('animationmods.' + k, a.name || id, m.type, v);
      }
    }
  }
}

// 2. In-game module attachment_database
for (const [attName, data] of Object.entries(attDb as Record<string, any>)) {
  if (data.attachmentModifiers) {
    for (const [mType, list] of Object.entries(data.attachmentModifiers)) {
      if (Array.isArray(list)) {
        for (const m of list) {
          const p = m.indexPath ? m.indexPath.join('.') : '';
          recordPath(p, attName, mType, m.value);
          if (p === 'animationmods' && typeof m.value === 'object' && m.value !== null) {
            for (const [k, v] of Object.entries(m.value)) {
              recordPath('animationmods.' + k, attName, mType, v);
            }
          }
        }
      }
    }
  }
}

// 3. Overrides
for (const [modKey, mod] of Object.entries(overrides as Record<string, any>)) {
  if (mod.modifiers) {
    for (const m of mod.modifiers) {
      const p = m.indexPath ? m.indexPath.join('.') : '';
      recordPath(p, mod.attachmentName || modKey, m.type, m.value);
    }
  }
}

console.log('Total distinct modifier paths found:', pathMap.size);

const sortedPaths = [...pathMap.entries()].sort((a, b) => b[1].count - a[1].count);

fs.writeFileSync('scratch/all_modifier_paths.json', JSON.stringify(
  sortedPaths.map(([p, d]) => ({
    path: p,
    count: d.count,
    types: [...d.types],
    attachments: [...d.attachments],
    sampleValues: d.sampleValues
  })),
  null,
  2
), 'utf8');

console.log('Saved scratch/all_modifier_paths.json');
