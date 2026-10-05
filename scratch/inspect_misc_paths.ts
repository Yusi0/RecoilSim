import * as fs from 'fs';

const list = JSON.parse(fs.readFileSync('scratch/modifier_path_analysis.json', 'utf8'));
const misc = list.filter((x: any) => x.category === 'misc').sort((a: any, b: any) => b.count - a.count);

console.log('Total misc paths:', misc.length);
for (const m of misc) {
  console.log(`${m.path.padEnd(35)} count: ${String(m.count).padStart(5)} | samples: ${m.sampleAttachments.slice(0, 3).join(', ')}`);
}
