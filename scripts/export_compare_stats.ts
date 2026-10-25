/**
 * Exports the stats the pf-archive `:::compare` block needs.
 *
 *   npx ts-node --project tsconfig.json scripts/export_compare_stats.ts [--out <dir>] [--slots Ammo,Barrel]
 *
 * Writes, per version (11.17, 11.16):
 *   <out>/<version>/weapons.json          every weapon's base stats (read once by the page)
 *   <out>/<version>/variants/<id>.json    that weapon's attachments of the chosen slots, as changes vs the base
 * plus <out>/versions.json. Variants are computed with the game's modifier engine from the canonical data.
 */
import * as fs from 'fs';
import * as path from 'path';
import { WeaponCompiler } from '../src/core/compiler/WeaponCompiler';
import { compileVariants, normalizeName, weaponRecord, type VariantRecord, type WeaponRecord } from '../src/export/compareStats';

const ROOT = path.resolve(__dirname, '..');
const VERSIONS: Array<{ label: string; dir: string; note: string }> = [
    { label: '11.17', dir: '11.17-provisional', note: '11.17 provisional: handling stats are inherited from 11.16 for most weapons' },
    { label: '11.16', dir: '11.16', note: '11.16 verified dump' },
];

function argument(name: string, fallback: string): string {
    const at = process.argv.indexOf(`--${name}`);
    return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const OUT = path.resolve(argument('out', path.join(ROOT, '..', 'pf-archive', 'public', 'data', 'compare')));
const SLOTS = argument('slots', 'Ammo').split(',').map((s) => s.trim()).filter(Boolean);

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file: string, data: unknown) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
};

interface Index {
    version: string;
    note: string;
    generatedAt: string;
    variantSlots: string[];
    /** weapon ids that have a variants/<id>.json */
    withVariants: string[];
    weapons: Record<string, WeaponRecord & { aliases: string[] }>;
}

function exportVersion(version: { label: string; dir: string; note: string }) {
    const base = path.join(ROOT, 'data', 'canonical', version.dir);
    const weapons = readJson(path.join(base, 'weapons.json'));
    const attachments = readJson(path.join(base, 'attachments.json'));
    const compiler = new WeaponCompiler();

    const index: Index = {
        version: version.label,
        note: version.note,
        generatedAt: new Date().toISOString(),
        variantSlots: SLOTS,
        withVariants: [],
        weapons: {},
    };
    const aliasOwner = new Map<string, string>();
    const dir = path.join(OUT, version.label);
    fs.rmSync(path.join(dir, 'variants'), { recursive: true, force: true });

    let variantCount = 0;
    let skipped = 0;
    for (const entry of Object.values<any>(weapons)) {
        const detailPath = path.join(base, 'weapon_details', `${entry.id}.json`);
        if (!fs.existsSync(detailPath)) continue;
        const detail = readJson(detailPath);

        // Weapons a damage table makes sense for: they have a damage curve and a fire rate
        const record = weaponRecord(entry, detail);
        if (!record.stats.damageGraph.length || record.stats.rpm === null) {
            skipped++;
            continue;
        }

        const aliases = [...new Set([record.name, record.gameName, record.id].map(normalizeName).filter(Boolean))];
        for (const alias of aliases) {
            const owner = aliasOwner.get(alias);
            if (owner && owner !== record.id) console.warn(`  alias "${alias}" is used by both ${owner} and ${record.id}`);
            else aliasOwner.set(alias, record.id);
        }
        index.weapons[record.id] = { ...record, aliases };

        const variants: VariantRecord[] = compileVariants(entry, detail, attachments, SLOTS, compiler);
        if (variants.length) {
            index.withVariants.push(record.id);
            variantCount += variants.length;
            writeJson(path.join(dir, 'variants', `${record.id}.json`), { weaponId: record.id, variants });
        }
    }

    writeJson(path.join(dir, 'weapons.json'), index);
    console.log(`${version.label}: ${Object.keys(index.weapons).length} weapons (skipped ${skipped} without damage/rpm), ${variantCount} variants in ${index.withVariants.length} files`);
    return { label: version.label, note: version.note, weapons: Object.keys(index.weapons).length };
}

const summary = VERSIONS.map(exportVersion);
writeJson(path.join(OUT, 'versions.json'), { default: VERSIONS[0].label, versions: summary });
console.log(`written to ${OUT}`);
