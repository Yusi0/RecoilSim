import * as fs from 'fs';

const paths = JSON.parse(fs.readFileSync('scratch/all_modifier_paths.json', 'utf8'));

interface PathAnalysis {
  path: string;
  count: number;
  category: string;
  isGameplay: boolean;
  targetProperty: string;
  resolverSupported: boolean;
  uiDisplayed: boolean;
  notes: string;
  sampleAttachments: string[];
}

const analysisList: PathAnalysis[] = [];

for (const item of paths) {
  const p = item.path;
  const pLower = p.toLowerCase();
  
  let category = 'other';
  let isGameplay = false;
  let targetProperty = p;
  let resolverSupported = false;
  let uiDisplayed = false;
  let notes = '';

  // 1. Recoil
  if (pLower.startsWith('recoil.') || pLower === 'recoil') {
    category = 'recoil';
    isGameplay = true;
    targetProperty = 'WeaponRecoilSprings / RecoilProfile';
    resolverSupported = true; // Compiled by ModifierEngine and summarized in recoilSummary
    uiDisplayed = true;      // Shown in Recoil Dynamics box
    notes = 'Recoil impulse / spring parameters';
  }
  // 2. Damage
  else if (pLower.startsWith('damage0') || pLower.startsWith('damage1') || pLower.startsWith('damagegraph')) {
    category = 'damage';
    isGameplay = true;
    targetProperty = 'DamageGraph / Falloff';
    resolverSupported = true;
    uiDisplayed = true;
    notes = 'Close/far damage falloff';
  }
  // 3. Multipliers
  else if (pLower === 'multhead' || pLower === 'multtorso' || pLower === 'truemultipliers.1' || pLower === 'truemultipliers.2' || pLower === 'truemultipliers') {
    category = 'damage_multiplier';
    isGameplay = true;
    targetProperty = 'Head / Torso Multipliers';
    resolverSupported = true;
    uiDisplayed = true;
    notes = 'Body part damage multipliers';
  }
  // 4. Firerate / RPM / Firemodes
  else if (pLower === 'firerate' || pLower === 'rpm' || pLower.startsWith('firemodes') || pLower === 'burst' || pLower === 'autoburst') {
    category = 'firerate_firemodes';
    isGameplay = true;
    targetProperty = 'Weapon Fire Controller';
    resolverSupported = true;
    uiDisplayed = true;
    notes = 'Rate of fire and select-fire modes';
  }
  // 5. Magazine / Reserve
  else if (pLower === 'magsize' || pLower === 'sparerounds' || pLower === 'reserveammo' || pLower === 'chamber') {
    category = 'magazine_reserve';
    isGameplay = true;
    targetProperty = 'Ammo Capacity';
    resolverSupported = true;
    uiDisplayed = true;
    notes = 'Magazine capacity and reserve ammo';
  }
  // 6. Ballistics (Speed, Penetration, Suppression)
  else if (pLower === 'bulletspeed' || pLower === 'bulletspreadgraph' || pLower === 'penetrationdepth' || pLower === 'penetration' || pLower === 'suppression') {
    category = 'ballistics';
    isGameplay = true;
    targetProperty = 'Ballistics Physics';
    resolverSupported = pLower !== 'suppression';
    uiDisplayed = pLower === 'bulletspeed' || pLower === 'penetrationdepth' || pLower === 'penetration';
    notes = pLower === 'suppression' ? 'Camera shake inflicted on enemy' : 'Muzzle velocity & cover penetration';
  }
  // 7. Movement / Mobility
  else if (pLower === 'walkspeed' || pLower === 'sprintspeed' || pLower === 'aimwalkspeedmult' || pLower === 'aimwalkspeed') {
    category = 'mobility';
    isGameplay = true;
    targetProperty = 'Player Movement Controller';
    resolverSupported = true;
    uiDisplayed = true;
    notes = 'Walking, sprinting, and ADS movement speed';
  }
  // 8. Handling (Aim, Equip, Timing)
  else if (pLower === 'aimspeed' || pLower === 'equipspeed' || pLower === 'equiptime' || pLower === 'unequipspeed' || pLower === 'unequiptime' || pLower === 'magnifyspeed' || pLower === 'unmagnifyspeed' || pLower === 'unaimspeed' || pLower === 'unsprintspeed') {
    category = 'handling';
    isGameplay = true;
    targetProperty = 'Weapon Handling Controller';
    resolverSupported = pLower === 'aimspeed' || pLower === 'equipspeed';
    uiDisplayed = pLower === 'aimspeed' || pLower === 'equipspeed';
    notes = 'ADS transition speed, weapon swap timing';
  }
  // 9. Sway / Spread / Hipfire Accuracy
  else if (pLower.startsWith('hipfirespread') || pLower.startsWith('sightspread') || pLower.startsWith('hipfirestability') || pLower.startsWith('sightstability') || pLower.startsWith('simplesway') || pLower.startsWith('sway') || pLower.startsWith('aimsway') || pLower === 'choke' || pLower === 'spread') {
    category = 'accuracy_sway';
    isGameplay = true;
    targetProperty = 'Spread / Sway Controller';
    resolverSupported = false; // Currently not mapped to explicit delta in changes
    uiDisplayed = false;       // Currently not shown in statItems
    notes = 'Hipfire cone, ADS spread recovery, breathing sway';
  }
  // 10. Ammo / Weapon Type Identity
  else if (pLower === 'ammotype' || pLower === 'casetype' || pLower === 'caliber' || pLower === 'type' || pLower === 'displayname') {
    category = 'identity';
    isGameplay = true;
    targetProperty = 'Weapon/Ammo Classification';
    resolverSupported = true;
    uiDisplayed = true;
    notes = 'Caliber name, weapon conversion name';
  }
  // 11. Reload
  else if (pLower.includes('reload') || pLower.startsWith('altreload') || pLower.startsWith('forcereload') || pLower.startsWith('uniquereload') || pLower.includes('pullbolt')) {
    category = 'reload';
    isGameplay = true;
    targetProperty = 'Reload Animation Controller';
    resolverSupported = true;
    uiDisplayed = true;
    notes = 'Reload duration multiplier, stage timings, sequence presets';
  }
  // 12. Visual / Audio / Parts / Cosmetic
  else if (pLower.includes('part') || pLower.includes('node') || pLower.includes('transparency') || pLower.includes('color') || pLower.includes('laser') || pLower.includes('flash') || pLower.includes('sound') || pLower.includes('optic') || pLower.includes('sight') || pLower.includes('cam') || pLower.includes('anim') || pLower.includes('mesh') || pLower.includes('offset')) {
    category = 'cosmetic_visual';
    isGameplay = false;
    targetProperty = 'Render / Audio / ViewModel';
    resolverSupported = false;
    uiDisplayed = false;
    notes = 'Attachment 3D model, sound effects, reticle optics, muzzle flash visuals';
  } else {
    category = 'misc';
    isGameplay = false;
    targetProperty = 'Unknown / Metadata';
    resolverSupported = false;
    uiDisplayed = false;
    notes = 'Unclassified metadata';
  }

  analysisList.push({
    path: p,
    count: item.count,
    category,
    isGameplay,
    targetProperty,
    resolverSupported,
    uiDisplayed,
    notes,
    sampleAttachments: item.attachments
  });
}

fs.writeFileSync('scratch/modifier_path_analysis.json', JSON.stringify(analysisList, null, 2), 'utf8');

const summaryByCategory: Record<string, { totalPaths: number; totalCount: number; isGameplay: boolean; sample: string[] }> = {};
for (const a of analysisList) {
  if (!summaryByCategory[a.category]) {
    summaryByCategory[a.category] = { totalPaths: 0, totalCount: 0, isGameplay: a.isGameplay, sample: [] };
  }
  summaryByCategory[a.category].totalPaths++;
  summaryByCategory[a.category].totalCount += a.count;
  if (summaryByCategory[a.category].sample.length < 5) summaryByCategory[a.category].sample.push(a.path);
}

console.log('=== Modifier Summary by Category ===');
console.log(JSON.stringify(summaryByCategory, null, 2));

const gameplayGaps = analysisList.filter(a => a.isGameplay && (!a.resolverSupported || !a.uiDisplayed));
console.log(`\n=== Gameplay-affecting paths with Resolver/UI gaps: ${gameplayGaps.length} paths ===`);
for (const g of gameplayGaps.slice(0, 30)) {
  console.log(`- ${g.path.padEnd(30)} [cat: ${g.category}] count: ${g.count} | Res: ${g.resolverSupported}, UI: ${g.uiDisplayed} | ${g.notes}`);
}
