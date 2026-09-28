import { NormalizedAttachment, NormalizedModifier } from '../data/AttachmentData';

export interface ModifierTraceEntry {
    stage: string;
    attachmentId: string;
    attachmentName: string;
    indexPath: string;
    operation: string;
    beforeValue: any;
    afterValue: any;
}

export interface ModifierEngineResult {
    compiledData: any;
    trace: ModifierTraceEntry[];
    warnings: string[];
    unconfirmedSemanticsNotes: string[];
}

interface TargetLocation {
    parent: any;
    key: string | number;
    pathString: string;
}

export class ModifierEngine {
    public static readonly MODIFIER_STAGE_ORDER = [
        'setters',
        'adders',
        'tableInserters',
        'tableRemovers',
        'relativeMultipliers',
        'trueMultipliers',
        'tableRelativeMultipliers',
        'tableTrueMultipliers',
        'functionMods'
    ] as const;

    public compileModifiers(
        baseData: any,
        attachments: NormalizedAttachment[]
    ): ModifierEngineResult {
        const compiledData = JSON.parse(JSON.stringify(baseData));
        const trace: ModifierTraceEntry[] = [];
        const warnings: string[] = [];
        const unconfirmedSemanticsNotes: string[] = [];

        // Filter valid attachments and gather modifiers in sequence
        const validAttachments = attachments.filter(a => a && Array.isArray(a.modifiers));

        for (const stage of ModifierEngine.MODIFIER_STAGE_ORDER) {
            switch (stage) {
                case 'setters':
                    this.applySetters(compiledData, validAttachments, trace, warnings);
                    break;
                case 'adders':
                    this.applyAdders(compiledData, validAttachments, trace, warnings);
                    break;
                case 'tableInserters':
                    this.applyInserters(compiledData, validAttachments, trace, warnings);
                    break;
                case 'tableRemovers':
                    this.applyRemovers(compiledData, validAttachments, trace, warnings);
                    break;
                case 'relativeMultipliers':
                case 'tableRelativeMultipliers':
                    this.applyRelativeMultipliers(compiledData, validAttachments, stage, trace, warnings);
                    break;
                case 'trueMultipliers':
                case 'tableTrueMultipliers':
                    this.applyTrueMultipliers(compiledData, validAttachments, stage, trace, warnings);
                    break;
                case 'functionMods':
                    this.applyFunctionMods(compiledData, validAttachments, trace, warnings, unconfirmedSemanticsNotes);
                    break;
            }
        }

        return {
            compiledData,
            trace,
            warnings,
            unconfirmedSemanticsNotes
        };
    }

    private getEffectivePath(mod: NormalizedModifier): (string | number)[] {
        const extra = mod.extra || {};
        if (!extra.valueIndex) {
            return mod.indexPath;
        }

        const path = [...mod.indexPath];
        if (extra.indexList) {
            path.push(extra.indexList);
        } else {
            // Wildcard / default all
            path.push('*');
        }
        path.push(extra.valueIndex);
        return path;
    }

    private resolveKey(parent: any, seg: string | number): (string | number)[] {
        if (typeof seg === 'number' && seg < 0) {
            const len = Array.isArray(parent) ? parent.length : Object.keys(parent).length;
            const resolved = len + 1 + seg;
            return [Array.isArray(parent) ? resolved - 1 : resolved];
        }

        if (typeof seg === 'number' && Array.isArray(parent)) {
            // PF Lua 1-based array index converted to JS 0-based index
            return [seg - 1];
        }

        if (Array.isArray(seg)) {
            const result: (string | number)[] = [];
            for (const item of seg) {
                result.push(...this.resolveKey(parent, item));
            }
            return result;
        }

        if (seg === '*') {
            if (Array.isArray(parent)) {
                return parent.map((_, i) => i);
            } else if (typeof parent === 'object' && parent !== null) {
                return Object.keys(parent);
            }
        }

        return [seg];
    }

    private collectTargets(
        rootObj: any,
        indexPath: (string | number)[],
        warnings: string[]
    ): TargetLocation[] {
        const targets: TargetLocation[] = [];

        if (!indexPath || indexPath.length === 0) {
            warnings.push('empty indexPath provided');
            return targets;
        }

        const recurse = (currentObj: any, segmentIndex: number, currentPathStr: string) => {
            if (currentObj === undefined || currentObj === null) {
                return;
            }

            const seg = indexPath[segmentIndex];
            const resolvedKeys = this.resolveKey(currentObj, seg);
            const isLast = segmentIndex === indexPath.length - 1;

            for (const key of resolvedKeys) {
                const stepPathStr = currentPathStr ? `${currentPathStr}.${key}` : `${key}`;

                if (isLast) {
                    targets.push({
                        parent: currentObj,
                        key,
                        pathString: stepPathStr
                    });
                } else {
                    const nextObj = currentObj[key];
                    if (typeof nextObj === 'object' && nextObj !== null) {
                        recurse(nextObj, segmentIndex + 1, stepPathStr);
                    } else {
                        warnings.push(`indexPath cut off early at '${stepPathStr}' (segment index ${segmentIndex})`);
                    }
                }
            }
        };

        recurse(rootObj, 0, '');
        return targets;
    }

    private applySetters(
        rootObj: any,
        attachments: NormalizedAttachment[],
        trace: ModifierTraceEntry[],
        warnings: string[]
    ) {
        // Map target location key -> winning setter item
        interface SetterCandidate {
            entry: NormalizedModifier;
            attachmentId: string;
            attachmentName: string;
            sequence: number;
            target: TargetLocation;
            absPriority: number;
            relPriority: number;
        }

        const targetMap = new Map<any, Map<string | number, SetterCandidate>>();
        let sequenceCounter = 0;

        for (const att of attachments) {
            for (const mod of att.modifiers) {
                if (mod.type !== 'setters') continue;
                sequenceCounter++;

                const targets = this.collectTargets(rootObj, mod.indexPath, warnings);
                const absPriority = mod.extra?.absolutePriority ?? 0;
                const relPriority = mod.priority ?? 0;

                for (const target of targets) {
                    let parentMap = targetMap.get(target.parent);
                    if (!parentMap) {
                        parentMap = new Map<string | number, SetterCandidate>();
                        targetMap.set(target.parent, parentMap);
                    }

                    const existing = parentMap.get(target.key);
                    const candidate: SetterCandidate = {
                        entry: mod,
                        attachmentId: att.id,
                        attachmentName: att.name,
                        sequence: sequenceCounter,
                        target,
                        absPriority,
                        relPriority
                    };

                    if (!existing) {
                        parentMap.set(target.key, candidate);
                    } else {
                        // Compare priority rules:
                        // 1. absolutePriority (higher wins)
                        // 2. priority (higher wins)
                        // 3. sequence (later wins if priority equal)
                        let isHigher = false;
                        if (candidate.absPriority !== existing.absPriority) {
                            isHigher = candidate.absPriority > existing.absPriority;
                        } else if (candidate.relPriority !== existing.relPriority) {
                            isHigher = candidate.relPriority > existing.relPriority;
                        } else {
                            isHigher = candidate.sequence > existing.sequence;
                        }

                        if (isHigher) {
                            parentMap.set(target.key, candidate);
                        }
                    }
                }
            }
        }

        // Apply winning setters
        for (const parentMap of targetMap.values()) {
            for (const cand of parentMap.values()) {
                const { parent, key, pathString } = cand.target;
                const beforeVal = parent[key];
                const rawValue = cand.entry.value;
                const afterVal = typeof rawValue === 'object' && rawValue !== null ? JSON.parse(JSON.stringify(rawValue)) : rawValue;

                parent[key] = afterVal;

                trace.push({
                    stage: 'setters',
                    attachmentId: cand.attachmentId,
                    attachmentName: cand.attachmentName,
                    indexPath: pathString,
                    operation: `SET (priority: abs=${cand.absPriority}, rel=${cand.relPriority})`,
                    beforeValue: beforeVal,
                    afterValue: afterVal
                });
            }
        }
    }

    private applyAdders(
        rootObj: any,
        attachments: NormalizedAttachment[],
        trace: ModifierTraceEntry[],
        warnings: string[]
    ) {
        for (const att of attachments) {
            for (const mod of att.modifiers) {
                if (mod.type !== 'adders') continue;
                const targets = this.collectTargets(rootObj, mod.indexPath, warnings);

                for (const target of targets) {
                    const { parent, key, pathString } = target;
                    const beforeVal = parent[key];
                    const numVal = typeof mod.value === 'number' ? mod.value : 0;
                    const baseNum = typeof beforeVal === 'number' ? beforeVal : 0;
                    const afterVal = baseNum + numVal;

                    parent[key] = afterVal;

                    trace.push({
                        stage: 'adders',
                        attachmentId: att.id,
                        attachmentName: att.name,
                        indexPath: pathString,
                        operation: `ADD ${numVal}`,
                        beforeValue: beforeVal,
                        afterValue: afterVal
                    });
                }
            }
        }
    }

    private applyInserters(
        rootObj: any,
        attachments: NormalizedAttachment[],
        trace: ModifierTraceEntry[],
        warnings: string[]
    ) {
        // Inserters sorted by priority ascending
        interface InserterCandidate {
            att: NormalizedAttachment;
            mod: NormalizedModifier;
            sequence: number;
            absPriority: number;
            relPriority: number;
        }

        const inserters: InserterCandidate[] = [];
        let seq = 0;

        for (const att of attachments) {
            for (const mod of att.modifiers) {
                if (mod.type !== 'tableInserters') continue;
                seq++;
                inserters.push({
                    att,
                    mod,
                    sequence: seq,
                    absPriority: mod.extra?.absolutePriority ?? 0,
                    relPriority: mod.priority ?? 0
                });
            }
        }

        // Priority descending sort (matching StatModifiers.lua getPriorityAscending: high priority runs first)
        inserters.sort((a, b) => {
            if (a.absPriority !== b.absPriority) return b.absPriority - a.absPriority;
            if (a.relPriority !== b.relPriority) return b.relPriority - a.relPriority;
            return a.sequence - b.sequence; // earlier sequence first if priority equal
        });

        for (const cand of inserters) {
            const { att, mod } = cand;
            const targets = this.collectTargets(rootObj, mod.indexPath, warnings);

            for (const target of targets) {
                const { parent, key, pathString } = target;
                if (parent[key] === undefined || parent[key] === null) {
                    parent[key] = Array.isArray(mod.indexPath[mod.indexPath.length - 1]) ? [] : {};
                }

                const targetContainer = parent[key];
                const rawVal = mod.value;
                const valToInsert = typeof rawVal === 'object' && rawVal !== null ? JSON.parse(JSON.stringify(rawVal)) : rawVal;
                const beforeVal = JSON.parse(JSON.stringify(targetContainer));

                const overrideIndex = mod.extra?.overrideIndex;
                const insertIndex = mod.insertIndex;

                if (overrideIndex !== undefined) {
                    targetContainer[overrideIndex] = valToInsert;
                } else if (insertIndex !== undefined) {
                    if (typeof insertIndex === 'string' && isNaN(Number(insertIndex))) {
                        targetContainer[insertIndex] = valToInsert;
                    } else {
                        const numIndex = Number(insertIndex);
                        let jsIndex: number;
                        if (numIndex > 0) {
                            jsIndex = numIndex - 1;
                        } else if (numIndex === 0) {
                            warnings.push(`Invalid Lua 1-based insertIndex: 0 at '${pathString}'. Standard Lua table insertion requires 1-based indexing.`);
                            jsIndex = 0;
                        } else {
                            const arrLen = Array.isArray(targetContainer) ? (targetContainer.length === 0 ? 1 : targetContainer.length) : 1;
                            const resolvedLua = arrLen + 1 + numIndex;
                            jsIndex = Math.max(0, resolvedLua - 1);
                        }

                        if (Array.isArray(targetContainer)) {
                            const safeIndex = Math.max(0, Math.min(jsIndex, targetContainer.length));
                            targetContainer.splice(safeIndex, 0, valToInsert);
                        } else {
                            targetContainer[numIndex] = valToInsert;
                        }
                    }
                } else {
                    if (Array.isArray(targetContainer)) {
                        targetContainer.push(valToInsert);
                    }
                }

                trace.push({
                    stage: 'tableInserters',
                    attachmentId: att.id,
                    attachmentName: att.name,
                    indexPath: pathString,
                    operation: `INSERT (${insertIndex !== undefined ? `index: ${insertIndex}` : 'push'})`,
                    beforeValue: beforeVal,
                    afterValue: JSON.parse(JSON.stringify(targetContainer))
                });
            }
        }
    }

    private applyRemovers(
        rootObj: any,
        attachments: NormalizedAttachment[],
        trace: ModifierTraceEntry[],
        warnings: string[]
    ) {
        for (const att of attachments) {
            for (const mod of att.modifiers) {
                if (mod.type !== 'tableRemovers') continue;
                const targets = this.collectTargets(rootObj, mod.indexPath, warnings);

                for (const target of targets) {
                    const { parent, key, pathString } = target;
                    const container = parent[key];
                    if (!container || typeof container !== 'object') continue;

                    const beforeVal = JSON.parse(JSON.stringify(container));
                    const removeIndex = mod.extra?.removeIndex;

                    if (removeIndex !== undefined) {
                        const list = Array.isArray(removeIndex) ? removeIndex : [removeIndex];
                        const arrayIndicesToRemove: number[] = [];
                        const stringKeysToRemove: string[] = [];

                        for (const rItem of list) {
                            if (typeof rItem === 'number' || !isNaN(Number(rItem))) {
                                const num = Number(rItem);
                                if (Array.isArray(container)) {
                                    const len = container.length;
                                    const resolvedLua = num >= 0 ? num : len + 1 + num;
                                    arrayIndicesToRemove.push(resolvedLua - 1);
                                }
                            } else {
                                stringKeysToRemove.push(String(rItem));
                            }
                        }

                        // Remove array indices descending
                        arrayIndicesToRemove.sort((a, b) => b - a);
                        const removedUnique = Array.from(new Set(arrayIndicesToRemove));

                        if (Array.isArray(container)) {
                            for (const idx of removedUnique) {
                                if (idx >= 0 && idx < container.length) {
                                    container.splice(idx, 1);
                                }
                            }
                        }

                        for (const skey of stringKeysToRemove) {
                            delete container[skey];
                        }
                    }

                    trace.push({
                        stage: 'tableRemovers',
                        attachmentId: att.id,
                        attachmentName: att.name,
                        indexPath: pathString,
                        operation: 'REMOVE',
                        beforeValue: beforeVal,
                        afterValue: JSON.parse(JSON.stringify(container))
                    });
                }
            }
        }
    }

    private applyRelativeMultipliers(
        rootObj: any,
        attachments: NormalizedAttachment[],
        stageType: 'relativeMultipliers' | 'tableRelativeMultipliers',
        trace: ModifierTraceEntry[],
        warnings: string[]
    ) {
        // Group values per target
        const groupMap = new Map<any, Map<string | number, { values: number[]; target: TargetLocation; atts: string[] }>>();

        for (const att of attachments) {
            for (const mod of att.modifiers) {
                if (mod.type !== stageType) continue;
                const path = this.getEffectivePath(mod);
                const targets = this.collectTargets(rootObj, path, warnings);

                for (const target of targets) {
                    let pMap = groupMap.get(target.parent);
                    if (!pMap) {
                        pMap = new Map();
                        groupMap.set(target.parent, pMap);
                    }
                    let group = pMap.get(target.key);
                    if (!group) {
                        group = { values: [], target, atts: [] };
                        pMap.set(target.key, group);
                    }
                    const numVal = typeof mod.value === 'number' ? mod.value : 0;
                    group.values.push(numVal);
                    group.atts.push(att.name);
                }
            }
        }

        // Apply relative formula: factor = (1 + posSum) / (1 + negSum)
        for (const pMap of groupMap.values()) {
            for (const group of pMap.values()) {
                const { parent, key, pathString } = group.target;
                const beforeVal = parent[key];

                let posSum = 0;
                let negSum = 0;
                for (const v of group.values) {
                    if (v > 0) posSum += v;
                    else if (v < 0) negSum += -v;
                }

                const factor = (1 + posSum) / (1 + negSum);

                if (typeof parent[key] === 'number') {
                    parent[key] = parent[key] * factor;
                } else if (Array.isArray(parent[key])) {
                    for (let i = 0; i < parent[key].length; i++) {
                        if (typeof parent[key][i] === 'number') {
                            parent[key][i] *= factor;
                        }
                    }
                }

                trace.push({
                    stage: stageType,
                    attachmentId: group.atts.join(', '),
                    attachmentName: group.atts.join(', '),
                    indexPath: pathString,
                    operation: `RELATIVE_MULT (posSum=${posSum}, negSum=${negSum}, factor=${factor.toFixed(6)})`,
                    beforeValue: beforeVal,
                    afterValue: parent[key]
                });
            }
        }
    }

    private applyTrueMultipliers(
        rootObj: any,
        attachments: NormalizedAttachment[],
        stageType: 'trueMultipliers' | 'tableTrueMultipliers',
        trace: ModifierTraceEntry[],
        warnings: string[]
    ) {
        // Group values per target
        const groupMap = new Map<any, Map<string | number, { values: number[]; target: TargetLocation; atts: string[] }>>();

        for (const att of attachments) {
            for (const mod of att.modifiers) {
                if (mod.type !== stageType) continue;
                const path = this.getEffectivePath(mod);
                const targets = this.collectTargets(rootObj, path, warnings);

                for (const target of targets) {
                    let pMap = groupMap.get(target.parent);
                    if (!pMap) {
                        pMap = new Map();
                        groupMap.set(target.parent, pMap);
                    }
                    let group = pMap.get(target.key);
                    if (!group) {
                        group = { values: [], target, atts: [] };
                        pMap.set(target.key, group);
                    }
                    const numVal = typeof mod.value === 'number' ? mod.value : 1;
                    group.values.push(numVal);
                    group.atts.push(att.name);
                }
            }
        }

        // Apply true multiplier formula: product = prod(values)
        for (const pMap of groupMap.values()) {
            for (const group of pMap.values()) {
                const { parent, key, pathString } = group.target;
                const beforeVal = parent[key];

                let product = 1;
                for (const v of group.values) {
                    product *= v;
                }

                if (typeof parent[key] === 'number') {
                    parent[key] = parent[key] * product;
                } else if (Array.isArray(parent[key])) {
                    for (let i = 0; i < parent[key].length; i++) {
                        if (typeof parent[key][i] === 'number') {
                            parent[key][i] *= product;
                        }
                    }
                }

                trace.push({
                    stage: stageType,
                    attachmentId: group.atts.join(', '),
                    attachmentName: group.atts.join(', '),
                    indexPath: pathString,
                    operation: `TRUE_MULT (product=${product.toFixed(6)})`,
                    beforeValue: beforeVal,
                    afterValue: parent[key]
                });
            }
        }
    }

    private applyFunctionMods(
        rootObj: any,
        attachments: NormalizedAttachment[],
        trace: ModifierTraceEntry[],
        warnings: string[],
        unconfirmedSemanticsNotes: string[]
    ) {
        for (const att of attachments) {
            for (const mod of att.modifiers) {
                if (mod.type !== 'functionMods') continue;

                if (typeof mod.value === 'function') {
                    const targets = this.collectTargets(rootObj, mod.indexPath, warnings);
                    for (const target of targets) {
                        const beforeVal = target.parent[target.key];
                        mod.value(rootObj, target.key, target.parent, target.parent[target.key]);
                        trace.push({
                            stage: 'functionMods',
                            attachmentId: att.id,
                            attachmentName: att.name,
                            indexPath: target.pathString,
                            operation: 'EXECUTE_FUNCTION',
                            beforeValue: beforeVal,
                            afterValue: target.parent[target.key]
                        });
                    }
                } else {
                    const note = `TODO / Needs Verification: Attachment '${att.name}' (${att.id}) contains static functionMods descriptor (indexPath: ${JSON.stringify(mod.indexPath)}). Non-executable in static JSON without Lua VM context.`;
                    unconfirmedSemanticsNotes.push(note);
                    trace.push({
                        stage: 'functionMods',
                        attachmentId: att.id,
                        attachmentName: att.name,
                        indexPath: mod.indexPath.join('.'),
                        operation: 'SKIPPED_STATIC_DESCRIPTOR',
                        beforeValue: undefined,
                        afterValue: undefined
                    });
                }
            }
        }
    }
}
