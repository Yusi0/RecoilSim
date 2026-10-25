/**
 * Imports original in-game recoil tables (copied from Weapon Labs as Lua text) into RecoilSim.
 *
 *   node scripts/import_weapon_labs_recoil.js            # imports every "11.17 guns/*.txt"
 *
 * For each file it
 *   1. parses the `gunData.recoil[...]` Lua tables (argument order: damping, speed, mean, variance;
 *      recovery tables are {damping, speed} layers plus `delay`),
 *   2. stores the result in data/overrides/weapon_recoil_overrides.json (the source of truth that
 *      build_canonical_datasets.js re-applies, so a rebuild does not wipe it), and
 *   3. writes it into data/canonical/11.17-provisional/weapon_details/<id>.json.
 *
 * The file name (e.g. "Rattler.txt") is matched to a weapon by its display name in the canonical
 * weapons.json. Nothing is estimated: a file that does not parse completely is rejected.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GUNS_DIR = path.join(ROOT, '11.17 guns');
const CANONICAL_DIR = path.join(ROOT, 'data/canonical/11.17-provisional');
const OVERRIDES_PATH = path.join(ROOT, 'data/overrides/weapon_recoil_overrides.json');

const SOURCE = 'Weapon Labs (original in-game gunData.recoil), provided by the user';
const GROUPS_PER_WEAPON = 16;
const AXES = ['x', 'y', 'z'];

/** Parses the Lua text of one weapon into the JSON shape used by the weapon detail files. */
function parseWeaponLabsRecoil(text, label = 'input') {
    const recoil = {};
    const groupRe = /gunData\.recoil\["(\w+)"\]\s*=\s*\{([\s\S]*?)\n\}/g;
    let match;
    while ((match = groupRe.exec(text))) {
        const [, group, body] = match;
        const isRecovery = /Recovery$/.test(group);
        const axes = {};

        for (const line of body.split('\n')) {
            const axisMatch = /^\s*\["([xyz])"\]\s*=\s*(\{.*\});?\s*$/.exec(line);
            if (!axisMatch) continue;
            const [, axis, table] = axisMatch;
            const layers = [...table.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1].split(',').map((n) => Number(n.trim())));
            const expected = isRecovery ? 2 : 4;
            if (!layers.length || layers.some((l) => l.length !== expected || l.some((n) => !Number.isFinite(n)))) {
                throw new Error(`${label}: ${group}.${axis} has a layer that is not ${expected} numbers: ${table}`);
            }
            if (isRecovery) {
                const delay = /delay\s*=\s*([-\d.]+)/.exec(table);
                if (!delay) throw new Error(`${label}: ${group}.${axis} has no delay`);
                axes[axis] = { a: layers, t: 'mixed', d: { delay: Number(delay[1]) } };
            } else {
                axes[axis] = layers;
            }
        }

        for (const axis of AXES) {
            if (!axes[axis]) throw new Error(`${label}: ${group} is missing axis ${axis}`);
        }
        recoil[group] = axes;
    }

    const count = Object.keys(recoil).length;
    if (count !== GROUPS_PER_WEAPON) {
        throw new Error(`${label}: expected ${GROUPS_PER_WEAPON} recoil groups, parsed ${count}`);
    }
    return recoil;
}

/** Finds the canonical weapon id whose display name matches the file name ("Rattler" -> mcx_rattler). */
function resolveWeaponId(fileBase, weapons) {
    const want = fileBase.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hits = Object.values(weapons).filter((w) => {
        const names = [w.id, w.name, w.displayName].map((n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
        return names.includes(want);
    });
    if (hits.length !== 1) {
        throw new Error(`"${fileBase}" matches ${hits.length} weapons in canonical weapons.json (need exactly 1)`);
    }
    return hits[0].id;
}

function main() {
    const weapons = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'weapons.json'), 'utf8'));
    const files = fs.readdirSync(GUNS_DIR).filter((f) => f.toLowerCase().endsWith('.txt'));
    if (!files.length) throw new Error(`no .txt files in ${GUNS_DIR}`);

    fs.mkdirSync(path.dirname(OVERRIDES_PATH), { recursive: true });
    const overrides = fs.existsSync(OVERRIDES_PATH) ? JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8')) : {};
    const today = new Date().toISOString().slice(0, 10);

    for (const file of files) {
        const base = path.basename(file, path.extname(file));
        const id = resolveWeaponId(base, weapons);
        const recoil = parseWeaponLabsRecoil(fs.readFileSync(path.join(GUNS_DIR, file), 'utf8'), file);

        overrides[id] = { source: SOURCE, file: `11.17 guns/${file}`, imported: today, recoil };

        const detailPath = path.join(CANONICAL_DIR, 'weapon_details', `${id}.json`);
        const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
        const was = detail.recoil ? 'had recoil' : 'recoil was null';
        applyOverride(detail, overrides[id]);
        fs.writeFileSync(detailPath, JSON.stringify(detail, null, 2));
        console.log(`${file.padEnd(14)} -> ${id.padEnd(12)} (${was}) | aimCameraBody.x layers: ${recoil.aimCameraBody.x.length}`);
    }

    fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2) + '\n');
    console.log(`overrides written: ${path.relative(ROOT, OVERRIDES_PATH)} (${Object.keys(overrides).length} weapons)`);
}

/** Same edit the canonical builder makes, so both paths give identical files. */
function applyOverride(detail, override) {
    detail.recoil = override.recoil;
    detail._provenance = { ...detail._provenance, recoil_springs: 'WEAPON_LABS_ORIGINAL' };
    // top-level on purpose: the builder rewrites _provenance but keeps other keys
    detail.recoil_source = { source: override.source, file: override.file, date: override.imported };
}

module.exports = { parseWeaponLabsRecoil, resolveWeaponId, applyOverride, SOURCE };

if (require.main === module) main();
