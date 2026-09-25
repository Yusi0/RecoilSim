import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WeaponsParser } from '../src/core/parser/WeaponsParser';

function sanitizeId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function canonicalJson(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
        return '[' + obj.map(canonicalJson).join(',') + ']';
    }
    const sortedKeys = Object.keys(obj).sort();
    return '{' + sortedKeys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

describe('WeaponsParser Raw to Normalized Lossless Verification', () => {
    const rawFilePath = path.join(__dirname, '../data/raw/weapons.json');
    const rawData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));

    const parser = new WeaponsParser();
    const result = parser.parse(rawData);

    test('1. Weapon count & Category count verification', () => {
        let totalRawWeapons = 0;
        for (const cat of Object.keys(rawData)) {
            const list = Array.isArray(rawData[cat]) ? rawData[cat] : Object.values(rawData[cat]);
            totalRawWeapons += list.filter((w: any) => w && typeof w === 'object').length;
        }
        expect(result.weapons.size).toBe(totalRawWeapons);
        expect(result.weapons.size).toBe(416);
    });

    test('2. Weapon identity & uniqueness verification', () => {
        const weaponIds = new Set<string>();
        for (const [id, w] of result.weapons.entries()) {
            expect(weaponIds.has(id)).toBe(false); // No duplicate IDs
            weaponIds.add(id);
            expect(w.id).toBe(id);
            expect(w.name).toBeTruthy();
            expect(w.category).toBeTruthy();
        }
    });

    test('3. Weapon base stats verification (C25 & sample weapons)', () => {
        const c25 = result.weapons.get('c25');
        expect(c25).toBeDefined();
        expect(c25?.stats.damage0).toBe(32);
        expect(c25?.stats.damage1).toBe(19);
        expect(c25?.stats.range0).toBe(70);
        expect(c25?.stats.range1).toBe(130);
        expect(c25?.stats.rpm).toBe(800);
        expect(c25?.stats.magsize).toBe(30);
    });

    test('4, 5, 6, 7, 8, 10. Attachment modifier preservation, indexPaths & Round-Trip', () => {
        let checkedModifiersCount = 0;

        for (const cat of Object.keys(rawData)) {
            const list = Array.isArray(rawData[cat]) ? rawData[cat] : Object.values(rawData[cat]);
            for (const w of list) {
                if (!w || !w.attachments) continue;
                const weaponId = sanitizeId(w.name || w.displayName);
                const normW = result.weapons.get(weaponId)!;

                for (const slotName of Object.keys(w.attachments)) {
                    if (slotName.startsWith('_')) continue;
                    const slotObj = w.attachments[slotName];

                    for (const attName of Object.keys(slotObj)) {
                        if (attName.startsWith('_')) continue;
                        const rawAtt = slotObj[attName];

                        const variantIds = normW.attachmentSlots[slotName] || [];
                        let normAtt = null;
                        for (const vId of variantIds) {
                            const candidate = result.attachments.get(vId);
                            if (candidate && candidate.name === attName) {
                                normAtt = candidate;
                                break;
                            }
                        }
                        expect(normAtt).not.toBeNull();

                        // Verify round-trip canonical JSON equality
                        const rawMods = rawAtt.attachmentModifiers || rawAtt.modifiers || {};
                        let rebuiltNormModsObj: any = normAtt!.rawIsArray ? [] : {};

                        if (!normAtt!.rawIsArray) {
                            if (normAtt!.emptyModifierTypes) {
                                for (const empType of normAtt!.emptyModifierTypes) {
                                    rebuiltNormModsObj[empType] = [];
                                }
                            }

                            for (const mod of normAtt!.modifiers) {
                                checkedModifiersCount++;
                                if (!rebuiltNormModsObj[mod.type]) rebuiltNormModsObj[mod.type] = [];
                                const item: any = { indexPath: mod.indexPath };
                                if (mod.value !== undefined) item.value = mod.value;
                                if (mod.priority !== undefined) item.priority = mod.priority;
                                if (mod.insertIndex !== undefined) item.insertIndex = mod.insertIndex;
                                if (mod.extra) Object.assign(item, mod.extra);

                                rebuiltNormModsObj[mod.type].push(item);
                            }
                        }

                        expect(canonicalJson(rawMods)).toBe(canonicalJson(rebuiltNormModsObj));
                    }
                }
            }
        }

        expect(checkedModifiersCount).toBe(381789);
    });

    test('9. Known cases verification', () => {
        expect(result.weapons.has('c25')).toBe(true);
        expect(result.weapons.has('ef88')).toBe(true);

        const knownAttachments = ['Compensator', 'Handstop', 'R2 Suppressor'];
        for (const name of knownAttachments) {
            let found = false;
            for (const att of result.attachments.values()) {
                if (att.name.toLowerCase() === name.toLowerCase()) {
                    found = true;
                    expect(att.modifiers.length).toBeGreaterThan(0);
                    break;
                }
            }
            expect(found).toBe(true);
        }
    });
});
