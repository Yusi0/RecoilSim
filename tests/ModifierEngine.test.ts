import fs from 'fs';
import path from 'path';
import { WeaponsParser } from '../src/core/parser/WeaponsParser';
import { ModifierEngine, ModifierEngineResult } from '../src/core/modifier/ModifierEngine';
import { NormalizedAttachment } from '../src/core/data/AttachmentData';
import { NormalizedWeapon } from '../src/core/data/WeaponData';

describe('ModifierEngine Verification Suite (PF Semantics)', () => {
    let c25BaseData: any;
    let c25Normalized: NormalizedWeapon;
    let attachmentMap: Map<string, NormalizedAttachment>;
    let engine: ModifierEngine;

    beforeAll(() => {
        const rawFilePath = path.join(__dirname, '../data/raw/weapons.json');
        const rawDetailPath = path.join(__dirname, '../data/raw/weapon-details/c25.json');

        const rawWeaponsData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));
        const parser = new WeaponsParser();
        const parseResult = parser.parse(rawWeaponsData);

        c25Normalized = parseResult.weapons.get('c25')!;
        attachmentMap = parseResult.attachments;

        // Base C25 detail JSON as base weapon data
        c25BaseData = JSON.parse(fs.readFileSync(rawDetailPath, 'utf-8'));
        engine = new ModifierEngine();
    });

    test('1. Immutability: Base WeaponData is not mutated during compilation', () => {
        const originalCopy = JSON.parse(JSON.stringify(c25BaseData));
        const compensator = Array.from(attachmentMap.values()).find(a => a.name === 'Compensator')!;

        const result = engine.compileModifiers(c25BaseData, [compensator]);

        expect(c25BaseData).toEqual(originalCopy);
        expect(result.compiledData).not.toBe(c25BaseData);
    });

    test('2. C25 + Compensator: Relative multipliers on nested recoil paths', () => {
        const compensator = Array.from(attachmentMap.values()).find(a => a.name === 'Compensator')!;
        expect(compensator).toBeDefined();

        const result: ModifierEngineResult = engine.compileModifiers(c25BaseData, [compensator]);

        // Verify Trace is populated
        expect(result.trace.length).toBeGreaterThan(0);
        const relativeTraces = result.trace.filter(t => t.stage === 'relativeMultipliers');
        expect(relativeTraces.length).toBeGreaterThan(0);

        // Verification of specific path: recoil.aimCameraBody.x[1][3] (Lua 1-based: x[1][3] -> JS: x[0][2])
        // Base value in C25 detail: 1.92
        // Compensator value: 0.15 relativeMultiplier -> factor = (1 + 0.15) / 1 = 1.15
        // Expected = 1.92 * 1.15 = 2.208
        const originalVal = c25BaseData.recoil.aimCameraBody.x[0][2];
        const compiledVal = result.compiledData.recoil.aimCameraBody.x[0][2];
        expect(compiledVal).toBeCloseTo(originalVal * 1.15, 5);

        // Verification of negative relativeMultiplier: recoil.aimCameraBody.y[1][4] (value: -0.5)
        // Base value: 0.24
        // Factor = 1 / (1 + 0.5) = 2 / 3
        // Expected = 0.24 * (2/3) = 0.16
        const originalY = c25BaseData.recoil.aimCameraBody.y[0][3];
        const compiledY = result.compiledData.recoil.aimCameraBody.y[0][3];
        expect(compiledY).toBeCloseTo(originalY * (1 / 1.5), 5);
    });

    test('3. C25 + Handstop: Table Inserters with priority and absolutePriority', () => {
        const handstop = Array.from(attachmentMap.values()).find(a => a.name === 'Handstop')!;
        expect(handstop).toBeDefined();

        const result = engine.compileModifiers(c25BaseData, [handstop]);

        // Handstop inserts into transparencyModAbsolute underrail
        expect(result.compiledData.transparencymodabsolute).toBeDefined();
        expect(result.compiledData.transparencymodabsolute.Underrail).toBe(0);

        const insertTrace = result.trace.find(t => t.stage === 'tableInserters');
        expect(insertTrace).toBeDefined();
        expect(insertTrace?.operation).toContain('INSERT');
    });

    test('4. C25 + R2 Suppressor: Multiple modifier types (setters + trueMultipliers)', () => {
        const r2 = Array.from(attachmentMap.values()).find(a => a.name === 'R2 Suppressor')!;
        expect(r2).toBeDefined();

        const result = engine.compileModifiers(c25BaseData, [r2]);

        // 1. Setters verification
        expect(result.compiledData.hideflash).toBe(true);
        expect(result.compiledData.hideminimap).toBe(true);
        expect(result.compiledData.hiderange).toBe(100);

        const setterTrace = result.trace.filter(t => t.stage === 'setters');
        expect(setterTrace.length).toBeGreaterThanOrEqual(3);

        // 2. True multipliers verification on recoil.aimRotation.x[1][3] (JS: x[0][2])
        // Base: 0.25 (or value in c25BaseData.recoil.aimRotation.x[0][2])
        // R2 value: 0.95
        const origRotationX = c25BaseData.recoil.aimRotation.x[0][2];
        const compiledRotationX = result.compiledData.recoil.aimRotation.x[0][2];
        expect(compiledRotationX).toBeCloseTo(origRotationX * 0.95, 5);

        const trueMultTrace = result.trace.filter(t => t.stage === 'trueMultipliers');
        expect(trueMultTrace.length).toBeGreaterThan(0);
    });

    test('5. Setter Priority Semantics: Absolute priority vs Priority vs Sequence order', () => {
        const mockBase = { testProp: 'base' };
        const mockAttLowPriority: NormalizedAttachment = {
            id: 'low_att',
            name: 'Low Att',
            slot: 'Other',
            isCommon: true,
            variantHash: 'h1',
            compatibleWeaponIds: ['c25'],
            modifiers: [
                {
                    type: 'setters',
                    indexPath: ['testProp'],
                    value: 'low_priority_val',
                    priority: 1,
                    extra: { absolutePriority: 10 }
                }
            ]
        };

        const mockAttHighPriority: NormalizedAttachment = {
            id: 'high_att',
            name: 'High Att',
            slot: 'Other',
            isCommon: true,
            variantHash: 'h2',
            compatibleWeaponIds: ['c25'],
            modifiers: [
                {
                    type: 'setters',
                    indexPath: ['testProp'],
                    value: 'high_priority_val',
                    priority: 1,
                    extra: { absolutePriority: 20 }
                }
            ]
        };

        // Even if low priority attachment comes AFTER high priority, high absolutePriority must win
        const result = engine.compileModifiers(mockBase, [mockAttHighPriority, mockAttLowPriority]);

        expect(result.compiledData.testProp).toBe('high_priority_val');
        const setTrace = result.trace.find(t => t.stage === 'setters');
        expect(setTrace?.afterValue).toBe('high_priority_val');
    });

    test('6. Multiple Modifiers on Same Path: Combining relative multipliers', () => {
        const mockBase = { recoilStat: 100 };
        const att1: NormalizedAttachment = {
            id: 'a1',
            name: 'Att 1',
            slot: 'Other',
            isCommon: true,
            variantHash: 'h1',
            compatibleWeaponIds: ['c25'],
            modifiers: [
                { type: 'relativeMultipliers', indexPath: ['recoilStat'], value: 0.2 }
            ]
        };
        const att2: NormalizedAttachment = {
            id: 'a2',
            name: 'Att 2',
            slot: 'Other',
            isCommon: true,
            variantHash: 'h2',
            compatibleWeaponIds: ['c25'],
            modifiers: [
                { type: 'relativeMultipliers', indexPath: ['recoilStat'], value: 0.3 }
            ]
        };
        const att3: NormalizedAttachment = {
            id: 'a3',
            name: 'Att 3',
            slot: 'Other',
            isCommon: true,
            variantHash: 'h3',
            compatibleWeaponIds: ['c25'],
            modifiers: [
                { type: 'relativeMultipliers', indexPath: ['recoilStat'], value: -0.2 }
            ]
        };

        // Relative mult rule: posSum = 0.2 + 0.3 = 0.5, negSum = 0.2
        // Factor = (1 + 0.5) / (1 + 0.2) = 1.5 / 1.2 = 1.25
        // Expected = 100 * 1.25 = 125
        const result = engine.compileModifiers(mockBase, [att1, att2, att3]);

        expect(result.compiledData.recoilStat).toBeCloseTo(125, 5);
        expect(result.trace.length).toBe(1);
        expect(result.trace[0].operation).toContain('posSum=0.5');
    });

    test('7. Array indexPath and Negative insertIndex (-1)', () => {
        const cantedSight = Array.from(attachmentMap.values()).find(a => a.name === 'Canted Animu Sight');
        expect(cantedSight).toBeDefined();

        const mockBaseWithAltaim = {
            altaimdata: []
        };

        const result = engine.compileModifiers(mockBaseWithAltaim, [cantedSight!]);

        expect(result.compiledData.altaimdata).toBeDefined();
        expect(result.compiledData.altaimdata.length).toBe(1);
        expect(result.compiledData.altaimdata[0].zoom).toBe(1.15);

        const insertTrace = result.trace.find(t => t.stage === 'tableInserters');
        expect(insertTrace).toBeDefined();
        expect(insertTrace?.operation).toContain('index: -1');
    });

    test('8. Implementation Regression Fixture: C25 + R2 Suppressor + Compensator + Handstop combined trace', () => {
        const compensator = Array.from(attachmentMap.values()).find(a => a.name === 'Compensator')!;
        const handstop = Array.from(attachmentMap.values()).find(a => a.name === 'Handstop')!;
        const r2 = Array.from(attachmentMap.values()).find(a => a.name === 'R2 Suppressor')!;

        const result = engine.compileModifiers(c25BaseData, [r2, compensator, handstop]);

        expect(result.compiledData).toBeDefined();
        expect(result.trace.length).toBeGreaterThan(10);
        
        // 4 cutoff warnings are expected because C25 only has 1 recoil array tier for aimRotation.y/x,
        // but Compensator targets tier 2 (indexPath index 2), which triggers PF debugWarn("indexPath cut off early")
        expect(result.warnings.length).toBe(4);
        expect(result.warnings[0]).toContain('indexPath cut off early');

        // Verify 9-stage order in trace
        const stagesInTrace = result.trace.map(t => t.stage);
        const firstSetterIndex = stagesInTrace.indexOf('setters');
        const firstInserterIndex = stagesInTrace.indexOf('tableInserters');
        const firstRelIndex = stagesInTrace.indexOf('relativeMultipliers');
        const firstTrueIndex = stagesInTrace.indexOf('trueMultipliers');

        expect(firstSetterIndex).toBeLessThan(firstInserterIndex);
        expect(firstInserterIndex).toBeLessThan(firstRelIndex);
        expect(firstRelIndex).toBeLessThan(firstTrueIndex);
    });

    test('9. Independent Reference Verification: C25 Combined loadout vs StatModifiers.lua independent formula reference', () => {
        const referencePath = path.join(__dirname, '../data/reference/c25_independent_reference.json');
        const independentRef = JSON.parse(fs.readFileSync(referencePath, 'utf-8'));

        const compensator = Array.from(attachmentMap.values()).find(a => a.name === 'Compensator')!;
        const handstop = Array.from(attachmentMap.values()).find(a => a.name === 'Handstop')!;
        const r2 = Array.from(attachmentMap.values()).find(a => a.name === 'R2 Suppressor')!;

        const result = engine.compileModifiers(c25BaseData, [r2, compensator, handstop]);

        // Compare key values independently computed from StatModifiers.lua formulas
        const refValues = independentRef.keyVerificationValues;
        
        // Combined aimCameraBody.x[0][2] = 2.0976
        expect(result.compiledData.recoil.aimCameraBody.x[0][2]).toBeCloseTo(refValues.combined_aimCameraBody_x_0_2, 5);
        
        // R2 bulletspeed = 2537.5
        expect(result.compiledData.bulletspeed).toBeCloseTo(refValues.r2_bulletspeed, 5);

        // Handstop transparencymodabsolute.Underrail = 0
        expect(result.compiledData.transparencymodabsolute.Underrail).toBe(refValues.handstop_transparencymodabsolute_underrail);

        // R2 hideflash = true
        expect(result.compiledData.hideflash).toBe(refValues.r2_hideflash);
    });

    test('10. Independent Reference Verification: Compensator individual formulas', () => {
        const referencePath = path.join(__dirname, '../data/reference/c25_independent_reference.json');
        const independentRef = JSON.parse(fs.readFileSync(referencePath, 'utf-8'));

        const compensator = Array.from(attachmentMap.values()).find(a => a.name === 'Compensator')!;
        const result = engine.compileModifiers(c25BaseData, [compensator]);

        // Compensator relativeMultiplier: 1.92 * 1.15 = 2.208
        expect(result.compiledData.recoil.aimCameraBody.x[0][2]).toBeCloseTo(independentRef.keyVerificationValues.compensator_aimCameraBody_x_0_2, 5);
        // Compensator relativeMultiplier: 0.24 * (1/1.5) = 0.16
        expect(result.compiledData.recoil.aimCameraBody.y[0][3]).toBeCloseTo(independentRef.keyVerificationValues.compensator_aimCameraBody_y_0_3, 5);
        // Compensator relativeMultiplier: -0.25 / 1.12 = -0.2232142857...
        expect(result.compiledData.recoil.aimRotation.y[0][2]).toBeCloseTo(independentRef.keyVerificationValues.compensator_aimRotation_y_0_2, 5);
    });

    test('11. Independent Reference Verification: R2 Suppressor individual formulas', () => {
        const referencePath = path.join(__dirname, '../data/reference/c25_independent_reference.json');
        const independentRef = JSON.parse(fs.readFileSync(referencePath, 'utf-8'));

        const r2 = Array.from(attachmentMap.values()).find(a => a.name === 'R2 Suppressor')!;
        const result = engine.compileModifiers(c25BaseData, [r2]);

        // R2 trueMultiplier: 0.2 * 0.95 = 0.19
        expect(result.compiledData.recoil.aimRotation.x[0][2]).toBeCloseTo(independentRef.keyVerificationValues.r2_aimRotation_x_0_2, 5);
        // R2 bulletspeed: 2500 * 1.015 = 2537.5
        expect(result.compiledData.bulletspeed).toBeCloseTo(independentRef.keyVerificationValues.r2_bulletspeed, 5);
        // R2 hideflash = true
        expect(result.compiledData.hideflash).toBe(true);
    });

    test('12. Independent Reference Verification: Handstop individual formulas', () => {
        const referencePath = path.join(__dirname, '../data/reference/c25_independent_reference.json');
        const independentRef = JSON.parse(fs.readFileSync(referencePath, 'utf-8'));

        const handstop = Array.from(attachmentMap.values()).find(a => a.name === 'Handstop')!;
        const result = engine.compileModifiers(c25BaseData, [handstop]);

        // Handstop inserter: transparencymodabsolute.Underrail = 0
        expect(result.compiledData.transparencymodabsolute.Underrail).toBe(independentRef.keyVerificationValues.handstop_transparencymodabsolute_underrail);
    });
});
