export interface RawModifierItem {
    indexPath: (string | number)[];
    value?: any;
    priority?: number;
    insertIndex?: string | number;
    [key: string]: any;
}

export interface RawAttachmentModifiers {
    setters?: RawModifierItem[];
    relativeMultipliers?: RawModifierItem[];
    trueMultipliers?: RawModifierItem[];
    adders?: RawModifierItem[];
    tableInserters?: RawModifierItem[];
    tableTrueMultipliers?: RawModifierItem[];
    trueMultiplier?: RawModifierItem[];
    tableRemovers?: RawModifierItem[];
    [key: string]: RawModifierItem[] | undefined;
}

export interface RawAttachment {
    unlockkills?: number;
    info?: string;
    displayname?: string;
    node?: string;
    attachmentModifiers?: RawAttachmentModifiers;
    modifiers?: RawAttachmentModifiers;
    [key: string]: any;
}

export interface NormalizedWeapon {
    id: string;
    name: string;
    displayName: string;
    category: string;
    stats: {
        damage0?: number;
        damage1?: number;
        range0?: number;
        range1?: number;
        multhead?: number;
        multtorso?: number;
        rpm?: number;
        magsize?: number;
        chamber?: number;
        sparerounds?: number;
        walkspeed?: number;
        pelletcount?: number;
        [key: string]: any;
    };
    attachmentSlots: Record<string, string[]>; // slotName -> array of attachmentVariantIds
}
