import crypto from 'crypto';
import { NormalizedWeapon, RawAttachment, RawAttachmentModifiers, RawModifierItem } from '../data/WeaponData';
import { NormalizedAttachment, NormalizedModifier } from '../data/AttachmentData';

export interface ParseResult {
    weapons: Map<string, NormalizedWeapon>;
    attachments: Map<string, NormalizedAttachment>;
    warnings: string[];
    stats: {
        totalWeaponsParsed: number;
        totalUniqueAttachmentVariants: number;
        commonAttachmentCount: number;
        weaponSpecificAttachmentCount: number;
    };
}

export class WeaponsParser {
    private warnings: string[] = [];

    /**
     * Parses raw weapons.json content into normalized WeaponData and AttachmentData.
     * @param rawWeaponsJson Raw parsed JSON object from data/raw/weapons.json
     */
    public parse(rawWeaponsJson: any): ParseResult {
        this.warnings = [];
        const weapons = new Map<string, NormalizedWeapon>();
        const attachmentVariantMap = new Map<string, NormalizedAttachment>(); // variantHashKey -> NormalizedAttachment

        // Temporary tracking to distinguish common vs weapon-specific attachments
        // attName -> Map<hash, { variant: NormalizedAttachment, weapons: Set<string> }>
        const attNameVariantsMap = new Map<string, Map<string, { attachment: NormalizedAttachment; weaponIds: Set<string> }>>();

        if (!rawWeaponsJson || typeof rawWeaponsJson !== 'object') {
            this.addWarning('Root JSON is not a valid object or is empty.');
            return this.buildResult(weapons, attachmentVariantMap);
        }

        const categories = Object.keys(rawWeaponsJson);
        for (const category of categories) {
            const rawCategory = rawWeaponsJson[category];
            if (!rawCategory || (typeof rawCategory !== 'object' && !Array.isArray(rawCategory))) {
                this.addWarning(`Category '${category}' is not an array or object. Skipping.`);
                continue;
            }

            const rawWeaponList = Array.isArray(rawCategory) ? rawCategory : Object.values(rawCategory);

            for (let idx = 0; idx < rawWeaponList.length; idx++) {
                const rawW = rawWeaponList[idx];
                if (!rawW || typeof rawW !== 'object') {
                    this.addWarning(`Invalid weapon entry in category '${category}' at index ${idx}`);
                    continue;
                }

                const name = rawW.name || rawW.displayName;
                if (!name) {
                    this.addWarning(`Weapon missing name in category '${category}' at index ${idx}`);
                    continue;
                }

                const weaponId = this.sanitizeId(name);
                const displayName = rawW.displayName || name;

                // Extract Base Weapon Stats
                const stats: NormalizedWeapon['stats'] = {};
                const baseStatKeys = [
                    'damage0', 'damage1', 'range0', 'range1',
                    'multhead', 'multtorso', 'rpm', 'magsize',
                    'chamber', 'sparerounds', 'walkspeed', 'pelletcount',
                    'exclusiveUnlock', 'superTester', 'rank', 'grantable'
                ];

                for (const key of baseStatKeys) {
                    if (rawW[key] !== undefined) {
                        stats[key] = rawW[key];
                    }
                }

                // Copy any additional custom/non-attachment stat keys if present
                for (const k of Object.keys(rawW)) {
                    if (k !== 'attachments' && k !== 'name' && k !== 'displayName' && k !== 'description' && !(k in stats)) {
                        stats[k] = rawW[k];
                    }
                }

                const attachmentSlots: Record<string, string[]> = {};

                // Process Attachments
                if (rawW.attachments && typeof rawW.attachments === 'object') {
                    for (const slotName of Object.keys(rawW.attachments)) {
                        if (slotName.startsWith('_')) continue; // Skip metadata like _version

                        const slotObj = rawW.attachments[slotName];
                        if (!slotObj || typeof slotObj !== 'object') {
                            this.addWarning(`Weapon '${name}' slot '${slotName}' is not a valid object.`);
                            continue;
                        }

                        attachmentSlots[slotName] = [];

                        for (const attName of Object.keys(slotObj)) {
                            if (attName.startsWith('_')) continue;

                            const rawAtt: RawAttachment = slotObj[attName];
                            if (!rawAtt || typeof rawAtt !== 'object') {
                                this.addWarning(`Weapon '${name}' -> Slot '${slotName}' -> Attachment '${attName}' is not an object.`);
                                continue;
                            }

                            const rawIsArray = Array.isArray(rawAtt.attachmentModifiers || rawAtt.modifiers);
                            const { normalizedModifiers, emptyModifierTypes } = this.extractModifiers(name, slotName, attName, rawAtt);
                            const variantHash = this.computeModifierHash(attName, slotName, normalizedModifiers, emptyModifierTypes, rawIsArray);

                            if (!attNameVariantsMap.has(attName)) {
                                attNameVariantsMap.set(attName, new Map());
                            }
                            const variantMap = attNameVariantsMap.get(attName)!;

                            let variantEntry = variantMap.get(variantHash);
                            if (!variantEntry) {
                                const variantId = `${this.sanitizeId(attName)}_${variantHash.substring(0, 8)}`;
                                const normAttachment: NormalizedAttachment = {
                                    id: variantId,
                                    name: attName,
                                    displayName: rawAtt.displayname || attName,
                                    slot: slotName,
                                    info: rawAtt.info,
                                    unlockKills: rawAtt.unlockkills,
                                    isCommon: false, // will be evaluated at post-processing
                                    variantHash,
                                    compatibleWeaponIds: [],
                                    emptyModifierTypes: emptyModifierTypes.length > 0 ? emptyModifierTypes : undefined,
                                    rawIsArray: rawIsArray ? true : undefined,
                                    modifiers: normalizedModifiers
                                };

                                variantEntry = { attachment: normAttachment, weaponIds: new Set() };
                                variantMap.set(variantHash, variantEntry);
                            }

                            variantEntry.weaponIds.add(weaponId);
                            attachmentSlots[slotName].push(variantEntry.attachment.id);
                        }
                    }
                }

                const normalizedWeapon: NormalizedWeapon = {
                    id: weaponId,
                    name,
                    displayName,
                    category,
                    stats,
                    attachmentSlots
                };

                weapons.set(weaponId, normalizedWeapon);
            }
        }

        // Post-processing: Evaluate isCommon & finalize attachments map
        for (const [attName, variantMap] of attNameVariantsMap.entries()) {
            const isSingleVariant = variantMap.size === 1;
            for (const [hash, entry] of variantMap.entries()) {
                const normAtt = entry.attachment;
                normAtt.compatibleWeaponIds = Array.from(entry.weaponIds);
                // If there's only 1 variant across ALL weapons that use this attachment name, mark as common
                normAtt.isCommon = isSingleVariant && normAtt.compatibleWeaponIds.length > 1;

                attachmentVariantMap.set(normAtt.id, normAtt);
            }
        }

        return this.buildResult(weapons, attachmentVariantMap);
    }

    private extractModifiers(weaponName: string, slotName: string, attName: string, rawAtt: RawAttachment): { normalizedModifiers: NormalizedModifier[]; emptyModifierTypes: string[] } {
        const rawMods: RawAttachmentModifiers = rawAtt.attachmentModifiers || rawAtt.modifiers || {};
        const normalized: NormalizedModifier[] = [];
        const emptyTypes: string[] = [];

        for (const modType of Object.keys(rawMods)) {
            const items = rawMods[modType];
            if (!Array.isArray(items)) {
                this.addWarning(`Weapon '${weaponName}' -> Att '${attName}' -> Modifier type '${modType}' is not an array.`);
                continue;
            }

            if (items.length === 0) {
                emptyTypes.push(modType);
                continue;
            }

            for (const item of items) {
                if (!item || typeof item !== 'object') {
                    this.addWarning(`Weapon '${weaponName}' -> Att '${attName}' -> Modifier type '${modType}' contains non-object item.`);
                    continue;
                }

                if (!item.indexPath || !Array.isArray(item.indexPath)) {
                    this.addWarning(`Weapon '${weaponName}' -> Att '${attName}' -> Modifier item missing array indexPath.`);
                    continue;
                }

                const mod: NormalizedModifier = {
                    type: modType,
                    indexPath: item.indexPath
                };
                if (item.value !== undefined) mod.value = item.value;
                if (item.priority !== undefined) mod.priority = item.priority;
                if (item.insertIndex !== undefined) mod.insertIndex = item.insertIndex;

                // Store extra unexpected properties if any
                const knownKeys = new Set(['indexPath', 'value', 'priority', 'insertIndex']);
                const extraKeys = Object.keys(item).filter(k => !knownKeys.has(k));
                if (extraKeys.length > 0) {
                    mod.extra = {};
                    extraKeys.forEach(k => { mod.extra![k] = item[k]; });
                }

                normalized.push(mod);
            }
        }

        return { normalizedModifiers: normalized, emptyModifierTypes: emptyTypes };
    }

    private computeModifierHash(attName: string, slotName: string, modifiers: NormalizedModifier[], emptyModifierTypes: string[] = [], rawIsArray: boolean = false): string {
        const payload = JSON.stringify({
            attName,
            slotName,
            rawIsArray,
            emptyTypes: emptyModifierTypes.sort(),
            modifiers: modifiers.map(m => ({
                t: m.type,
                p: m.indexPath,
                v: m.value,
                pr: m.priority,
                ii: m.insertIndex,
                ex: m.extra
            }))
        });

        return crypto.createHash('sha256').update(payload).digest('hex');
    }

    private sanitizeId(name: string): string {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    private addWarning(msg: string) {
        this.warnings.push(msg);
    }

    private buildResult(weapons: Map<string, NormalizedWeapon>, attachments: Map<string, NormalizedAttachment>): ParseResult {
        let commonCount = 0;
        let specificCount = 0;

        for (const att of attachments.values()) {
            if (att.isCommon) {
                commonCount++;
            } else {
                specificCount++;
            }
        }

        return {
            weapons,
            attachments,
            warnings: this.warnings,
            stats: {
                totalWeaponsParsed: weapons.size,
                totalUniqueAttachmentVariants: attachments.size,
                commonAttachmentCount: commonCount,
                weaponSpecificAttachmentCount: specificCount
            }
        };
    }
}
