import { RawAttachment, RawAttachmentModifiers, RawModifierItem } from './WeaponData';

export interface NormalizedModifier {
    type: string; // e.g. 'setters', 'relativeMultipliers', 'trueMultipliers', 'adders', etc.
    indexPath: (string | number)[];
    value: any;
    priority?: number;
    insertIndex?: string | number;
    extra?: Record<string, any>;
}

export interface NormalizedAttachment {
    id: string; // unique ID: e.g. "full_stock#c25" or "red_laser#common"
    name: string; // original attachment name e.g. "Full Stock"
    displayName?: string;
    slot: string; // 'Optics' | 'Barrel' | 'Underbarrel' | 'Other' | 'Ammo' etc.
    info?: string;
    unlockKills?: number;
    isCommon: boolean; // whether this exact modifier set is shared across all weapons using this attachment name
    variantHash: string; // SHA256 or numeric hash of the modifier content
    compatibleWeaponIds: string[]; // List of weapon IDs compatible with this specific attachment variant
    emptyModifierTypes?: string[]; // Preserved empty modifier types like setters: []
    rawIsArray?: boolean; // Preserved when raw attachmentModifiers was an empty array []
    modifiers: NormalizedModifier[];
}

export { RawAttachment, RawAttachmentModifiers, RawModifierItem };
