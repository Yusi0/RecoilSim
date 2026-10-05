import { NormalizedWeapon, NormalizedAttachment } from '../data';
import { ModifierEngine, ModifierEngineResult, UnappliedModifierInfo } from '../modifier/ModifierEngine';

export interface SelectedAttachments {
    Optics?: string;
    Barrel?: string;
    Underbarrel?: string;
    Other?: string;
    Ammo?: string;
    [slot: string]: string | undefined;
}

export interface CompiledWeaponResult {
    compiledWeaponData: any;
    modifierEngineResult: ModifierEngineResult;
    displayName: string;
    unappliedModifiers: UnappliedModifierInfo[];
}

export class WeaponCompiler {
    public static readonly ATTACHMENT_SLOT_ORDER = [
        'Optics',
        'Barrel',
        'Underbarrel',
        'Other',
        'Ammo'
    ] as const;

    private modifierEngine: ModifierEngine;

    constructor(modifierEngine?: ModifierEngine) {
        this.modifierEngine = modifierEngine || new ModifierEngine();
    }

    public compileWeapon(
        weapon: NormalizedWeapon,
        selectedAttachments: SelectedAttachments,
        attachmentMap: Map<string, NormalizedAttachment>,
        baseWeaponData: any
    ): CompiledWeaponResult {
        // Deep clone base data to maintain 100% immutability of input
        const baseDataCopy = JSON.parse(JSON.stringify(baseWeaponData));
        const activeAttachments: NormalizedAttachment[] = [];

        // 1. Gather attachments in strict PF slot order: Optics, Barrel, Underbarrel, Other, Ammo
        for (const slotName of WeaponCompiler.ATTACHMENT_SLOT_ORDER) {
            const attName = selectedAttachments[slotName];
            if (!attName || attName === '' || attName === 'DEFAULT') continue;

            const variantIds = weapon.attachmentSlots[slotName] || [];
            let matchingAttachment: NormalizedAttachment | undefined;

            for (const vId of variantIds) {
                const att = attachmentMap.get(vId);
                if (att && att.name.toLowerCase() === attName.toLowerCase()) {
                    matchingAttachment = att;
                    break;
                }
            }

            if (matchingAttachment) {
                // Clone attachment to avoid mutating cached normalized objects
                const attCopy: NormalizedAttachment = JSON.parse(JSON.stringify(matchingAttachment));

                // Altaimdata post-processing (ContentUtils.lua:240-248)
                for (const mod of attCopy.modifiers) {
                    if (mod.indexPath.length === 1 && mod.indexPath[0] === 'altaimdata' && mod.value) {
                        if (mod.type === 'setters' && Array.isArray(mod.value)) {
                            for (const item of mod.value) {
                                if (typeof item === 'object' && item !== null) {
                                    item.name = attName;
                                }
                            }
                        } else if (mod.type === 'tableInserters' && typeof mod.value === 'object' && mod.value !== null) {
                            mod.value.name = attName;
                        }
                    }
                }

                activeAttachments.push(attCopy);
            }
        }

        // 2. Compile modifiers via ModifierEngine
        const engineResult = this.modifierEngine.compileModifiers(baseDataCopy, activeAttachments);
        const compiledData = engineResult.compiledData;

        // 3. Post-Processing matching ContentUtils.compileWeaponData

        // 3.1 Sparerounds & Magsize rounding (ContentUtils.lua:283-289)
        if (typeof compiledData.sparerounds === 'number') {
            compiledData.sparerounds = Math.round(compiledData.sparerounds);
        }
        if (typeof compiledData.magsize === 'number') {
            compiledData.magsize = Math.round(compiledData.magsize);
        }

        // 3.2 Damage Graph post-processing (ContentUtils.lua:291-304)
        if (Array.isArray(compiledData.damageGraph) && compiledData.damageGraph.length > 0) {
            compiledData.damageGraph.sort((a: any, b: any) => (a.distance ?? 0) - (b.distance ?? 0));
            if (compiledData.damageGraph[0].distance > 0) {
                compiledData.damageGraph.unshift({
                    distance: 0,
                    damage: compiledData.damageGraph[0].damage
                });
            }
        }

        // 3.3 Animation mods merge (ContentUtils.lua:306-312)
        if (compiledData.animationmods && typeof compiledData.animationmods === 'object') {
            if (!compiledData.animations) compiledData.animations = {};
            for (const animGroup of Object.keys(compiledData.animationmods)) {
                if (!compiledData.animations[animGroup]) {
                    compiledData.animations[animGroup] = {};
                }
                const modsGroup = compiledData.animationmods[animGroup];
                if (typeof modsGroup === 'object' && modsGroup !== null) {
                    Object.assign(compiledData.animations[animGroup], modsGroup);
                }
            }
        }

        // 3.4 Display Name resolution (ContentUtils.lua:47-105 getWeaponDisplayName)
        let displayName = compiledData.displayname || weapon.displayName || weapon.name;

        return {
            compiledWeaponData: compiledData,
            modifierEngineResult: engineResult,
            displayName,
            unappliedModifiers: engineResult.unappliedModifiers
        };
    }
}
