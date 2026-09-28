import fs from 'fs';
import path from 'path';
import { WeaponsParser } from '../src/core/parser/WeaponsParser';
import { WeaponCompiler, SelectedAttachments } from '../src/core/compiler/WeaponCompiler';
import { NormalizedWeapon, NormalizedAttachment } from '../src/core/data';

describe('WeaponCompiler Verification Suite (ContentUtils.compileWeaponData)', () => {
    let c25BaseData: any;
    let c25Normalized: NormalizedWeapon;
    let attachmentMap: Map<string, NormalizedAttachment>;
    let compiler: WeaponCompiler;
    let independentRef: any;

    beforeAll(() => {
        const rawFilePath = path.join(__dirname, '../data/raw/weapons.json');
        const rawDetailPath = path.join(__dirname, '../data/raw/weapon-details/c25.json');
        const refPath = path.join(__dirname, '../data/reference/c25_independent_reference.json');

        const rawWeaponsData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));
        const parser = new WeaponsParser();
        const parseResult = parser.parse(rawWeaponsData);

        c25Normalized = parseResult.weapons.get('c25')!;
        attachmentMap = parseResult.attachments;
        c25BaseData = JSON.parse(fs.readFileSync(rawDetailPath, 'utf-8'));
        independentRef = JSON.parse(fs.readFileSync(refPath, 'utf-8'));

        compiler = new WeaponCompiler();
    });

    test('1. Immutability: baseWeaponData is unmutated by WeaponCompiler', () => {
        const copy = JSON.parse(JSON.stringify(c25BaseData));
        const selected: SelectedAttachments = {
            Barrel: 'Compensator'
        };

        const result = compiler.compileWeapon(c25Normalized, selected, attachmentMap, c25BaseData);

        expect(c25BaseData).toEqual(copy);
        expect(result.compiledWeaponData).not.toBe(c25BaseData);
    });

    test('2. C25 + R2 Suppressor compilation & reference verification', () => {
        const selected: SelectedAttachments = {
            Barrel: 'R2 Suppressor'
        };

        const result = compiler.compileWeapon(c25Normalized, selected, attachmentMap, c25BaseData);

        expect(result.compiledWeaponData.hideflash).toBe(true);
        expect(result.compiledWeaponData.hideminimap).toBe(true);
        expect(result.compiledWeaponData.hiderange).toBe(100);
        expect(result.compiledWeaponData.bulletspeed).toBeCloseTo(independentRef.keyVerificationValues.r2_bulletspeed, 5);
        expect(result.compiledWeaponData.recoil.aimRotation.x[0][2]).toBeCloseTo(independentRef.keyVerificationValues.r2_aimRotation_x_0_2, 5);
    });

    test('3. C25 + Compensator compilation & reference verification', () => {
        const selected: SelectedAttachments = {
            Barrel: 'Compensator'
        };

        const result = compiler.compileWeapon(c25Normalized, selected, attachmentMap, c25BaseData);

        expect(result.compiledWeaponData.recoil.aimCameraBody.x[0][2]).toBeCloseTo(independentRef.keyVerificationValues.compensator_aimCameraBody_x_0_2, 5);
        expect(result.compiledWeaponData.recoil.aimCameraBody.y[0][3]).toBeCloseTo(independentRef.keyVerificationValues.compensator_aimCameraBody_y_0_3, 5);
        expect(result.compiledWeaponData.recoil.aimRotation.y[0][2]).toBeCloseTo(independentRef.keyVerificationValues.compensator_aimRotation_y_0_2, 5);
    });

    test('4. C25 + Handstop compilation & reference verification', () => {
        const selected: SelectedAttachments = {
            Underbarrel: 'Handstop'
        };

        const result = compiler.compileWeapon(c25Normalized, selected, attachmentMap, c25BaseData);

        expect(result.compiledWeaponData.transparencymodabsolute).toBeDefined();
        expect(result.compiledWeaponData.transparencymodabsolute.Underrail).toBe(independentRef.keyVerificationValues.handstop_transparencymodabsolute_underrail);
    });

    test('5. Combined Golden Loadout: C25 + R2 Suppressor + Compensator + Handstop', () => {
        // R2 Suppressor & Compensator both sit in 'Barrel' slot in actual loadout selection rules,
        // but testing slot gathering order and combination:
        const selected: SelectedAttachments = {
            Barrel: 'R2 Suppressor',
            Underbarrel: 'Handstop'
        };

        const result = compiler.compileWeapon(c25Normalized, selected, attachmentMap, c25BaseData);

        expect(result.compiledWeaponData.hideflash).toBe(true);
        expect(result.compiledWeaponData.bulletspeed).toBeCloseTo(independentRef.keyVerificationValues.r2_bulletspeed, 5);
        expect(result.compiledWeaponData.transparencymodabsolute.Underrail).toBe(0);
        expect(result.modifierEngineResult.trace.length).toBeGreaterThan(0);
    });

    test('6. Post-Processing: DamageGraph distance 0 insertion and sorting check', () => {
        // Mock data with damageGraph starting at distance 10
        const mockBase = JSON.parse(JSON.stringify(c25BaseData));
        mockBase.damageGraph = [
            { distance: 100, damage: 19 },
            { distance: 20, damage: 32 }
        ];

        const result = compiler.compileWeapon(c25Normalized, {}, attachmentMap, mockBase);

        expect(result.compiledWeaponData.damageGraph).toBeDefined();
        expect(result.compiledWeaponData.damageGraph.length).toBe(3);
        // Distance 0 injected with damage of first element (32)
        expect(result.compiledWeaponData.damageGraph[0]).toEqual({ distance: 0, damage: 32 });
        expect(result.compiledWeaponData.damageGraph[1]).toEqual({ distance: 20, damage: 32 });
        expect(result.compiledWeaponData.damageGraph[2]).toEqual({ distance: 100, damage: 19 });
    });
});
