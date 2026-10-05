import * as path from 'path';
import { AttachmentEffectResolver } from '../src/core/compiler/AttachmentEffectResolver';

describe('AttachmentEffectResolver Regression & Verification Suite', () => {
    let resolver: AttachmentEffectResolver;

    beforeAll(() => {
        resolver = AttachmentEffectResolver.createDefault(path.resolve(__dirname, '..'));
    });

    test('1. MTS-570 on MTS-569: Resolves all gameplay stats from global attachment module', () => {
        const result = resolver.resolveAttachmentForWeapon(
            { id: 'mts_570_conversion_086fac7b', name: 'MTS-570 Conversion', slot: 'Ammo', compatibleWeaponIds: ['mts_569'] },
            'mts_569'
        );

        expect(result.status).toBe('RESOLVED');
        expect(result.provenance).toBe('VERIFIED_GLOBAL_MODULE + WEAPON_OVERRIDE');
        expect(result.changes.ammoType?.to).toBe('9x39mm SP');
        expect(result.changes.displayName?.to).toBe('MTS-570');
        expect(result.changes.damage?.from).toBe('95 → 47');
        expect(result.changes.damage?.to).toBe('66.5 → 39.9');
        expect(result.changes.rpm?.to).toBe('263 / 69');
        expect(result.changes.reserveAmmo?.to).toBe(60);
        expect(result.changes.multHead?.to).toBe(2.25);
        expect(result.changes.multTorso?.to).toBe(1.26);
        expect(result.changes.bulletSpeed?.to).toBe(1067);
        expect(result.changes.penetration?.to).toBe(1.5);
        expect(result.changes.recoilSummary).toContain('34 recoil parameters');
        expect(result.rawModifierCount).toBe(13);
        expect(result.resolvedModifierCount).toBe(71);
    });

    test('2. Heavy Buffer on M231: Resolves RPM conversion (-83%)', () => {
        const result = resolver.resolveAttachmentForWeapon(
            { id: 'heavy_buffer_fccda4ec', name: 'Heavy Buffer', slot: 'Other', compatibleWeaponIds: ['m231'] },
            'm231'
        );

        expect(result.status).toBe('RESOLVED');
        expect(result.changes.rpm?.from).toBe('1225');
        expect(result.changes.rpm?.to).toBe('200');
        expect(result.changes.recoilSummary).toBeDefined();
    });

    test('3. AR 20 Tact Conversion on C25: Resolves Caliber & Magazine capacity changes', () => {
        const result = resolver.resolveAttachmentForWeapon(
            { id: 'ar_20_tact_conversion_8cadf7c4', name: 'AR 20 Tact Conversion', slot: 'Ammo', compatibleWeaponIds: ['c25'] },
            'c25'
        );

        expect(result.status).toBe('RESOLVED');
        expect(result.changes.ammoType?.to).toBe('.20 Tactical');
        expect(result.changes.magSize?.from).toBe(30);
        expect(result.changes.magSize?.to).toBe(20);
        expect(result.changes.reserveAmmo?.to).toBe(100);
        expect(result.changes.bulletSpeed?.to).toBe(3077);
    });

    test('4. .223 Remington on MK12 SPR: Resolves ammo & 30-round magazine', () => {
        const result = resolver.resolveAttachmentForWeapon(
            { id: '223_remington_98449be8', name: '.223 Remington', slot: 'Ammo', compatibleWeaponIds: ['mk12_spr'] },
            'mk12_spr'
        );

        expect(result.status).toBe('RESOLVED');
        expect(result.changes.ammoType?.to).toBe('5.56x45mm M855A1');
        expect(result.changes.magSize?.from).toBe(20);
        expect(result.changes.magSize?.to).toBe(30);
        expect(result.changes.recoilSummary).toContain('80 recoil parameters');
    });

    test('5. 6.5 Grendel on C8A2: Resolves in-game Lua place module override', () => {
        const result = resolver.resolveAttachmentForWeapon(
            { id: 'ar_7_62x39_conversion_c5833a25', name: 'AR 7.62x39 Conversion', slot: 'Ammo', compatibleWeaponIds: ['c8a2'] },
            'c8a2'
        );

        expect(result.status).toBe('RESOLVED');
        expect(result.provenance).toBe('OVERRIDE_in-game-module');
        expect(result.changes.ammoType?.to).toBe('6.5mm Grendel');
        expect(result.changes.magSize?.to).toBe(20);
        expect(result.changes.damage?.to).toBe('34.2 → 18');
        expect(result.changes.recoilSummary).toContain('60 recoil parameters');
    });

    test('6. SA58 .243 Conversion: 11.17 new conversion resolved from provisional API', () => {
        const result = resolver.resolveAttachmentForWeapon(
            { id: 'sa58_243_conversion_bdf9edfb', name: 'SA58 .243 Conversion', slot: 'Ammo', compatibleWeaponIds: ['sa58_spr'] },
            'sa58_spr'
        );

        expect(result.status).toBe('RESOLVED');
        expect(result.changes.ammoType?.to).toBe('.243 Win.');
        expect(result.changes.bulletSpeed?.to).toBe(3350);
        expect(result.changes.recoilSummary).toBeDefined();
    });

    test('7. Uzi Light Bolt: 11.17 new RPM mutator resolved', () => {
        const result = resolver.resolveAttachmentForWeapon(
            { id: 'uzi_light_bolt_94f24fc0', name: 'Uzi Light Bolt', slot: 'Other', compatibleWeaponIds: ['uzi'] },
            'uzi'
        );

        expect(result.status).toBe('RESOLVED');
        expect(result.changes.rpm?.from).toBe('600');
        expect(result.changes.rpm?.to).toBe('780');
        expect(result.changes.recoilSummary).toBeDefined();
    });

    test('8. HK416A5 .300 Conversion: Explicitly flagged as UNVERIFIED pending place dump', () => {
        const result = resolver.resolveAttachmentForWeapon(
            { id: 'hk416a5_300_conversion_edc421a5', name: 'HK416A5 .300 Conversion', slot: 'Ammo', compatibleWeaponIds: ['hk416a5'] },
            'hk416a5'
        );

        expect(result.status).toBe('UNVERIFIED');
        expect(result.provenance).toBe('UNVERIFIED_PENDING_PLACE_DUMP');
        expect(result.unverifiedReason).toContain('Core gameplay stats missing');
    });

    test('9. Fast Mag & Extended Magazine: Resolves reload time multipliers with delta percentages', () => {
        // Fast Mag: 0.88 (-12% reload time)
        const fastMag = resolver.resolveAttachmentForWeapon(
            { id: 'fast_mag_41e0f157', name: 'Fast Mag', slot: 'Other', compatibleWeaponIds: ['mcx_virtus'] },
            'mcx_virtus'
        );
        expect(fastMag.status).toBe('RESOLVED');
        expect(fastMag.changes.reloadEffects?.hasReloadEffects).toBe(true);
        expect(fastMag.changes.reloadEffects?.standard?.timescale?.timeFactor).toBe(0.88);
        expect(fastMag.changes.reloadEffects?.standard?.timescale?.deltaPercent).toBe('-12%');
        expect(fastMag.changes.reloadEffects?.tactical?.timescale?.timeFactor).toBe(0.92);
        expect(fastMag.changes.reloadEffects?.tactical?.timescale?.deltaPercent).toBe('-8%');

        // Extended Magazine: 1.15 (+15% reload time)
        const extMag = resolver.resolveAttachmentForWeapon(
            { id: 'extended_magazine_06142feb', name: 'Extended Magazine', slot: 'Other', compatibleWeaponIds: ['aug_a3'] },
            'aug_a3'
        );
        expect(extMag.status).toBe('RESOLVED');
        expect(extMag.changes.reloadEffects?.hasReloadEffects).toBe(true);
        expect(extMag.changes.reloadEffects?.standard?.timescale?.timeFactor).toBe(1.15);
        expect(extMag.changes.reloadEffects?.standard?.timescale?.deltaPercent).toBe('+15%');
    });

    test('10. Reduced Magazine: Resolves -6% reload time reduction', () => {
        const redMag = resolver.resolveAttachmentForWeapon(
            { id: 'reduced_magazine_749d7cfe', name: 'Reduced Magazine', slot: 'Other', compatibleWeaponIds: ['hk416a5'] },
            'hk416a5'
        );
        expect(redMag.status).toBe('RESOLVED');
        expect(redMag.changes.reloadEffects?.standard?.timescale?.timeFactor).toBe(0.94);
        expect(redMag.changes.reloadEffects?.standard?.timescale?.deltaPercent).toBe('-6%');
    });

    test('11. Groza 5.45 & MTS-570: Resolves animation-specific reload stage modifiers', () => {
        // Groza 5.45
        const groza = resolver.resolveAttachmentForWeapon(
            { id: 'groza_5_45_conversion_e1bc57b6', name: 'Groza 5.45 Conversion', slot: 'Ammo', compatibleWeaponIds: ['groza_1'] },
            'groza_1'
        );
        expect(groza.changes.reloadEffects?.hasReloadEffects).toBe(true);
        expect(groza.changes.reloadEffects?.animationMods).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ stage: 'tacticalreload', timescale: 0.55 }),
                expect.objectContaining({ stage: 'reload', timescale: 0.55 })
            ])
        );

        // MTS-570 Conversion
        const mts570 = resolver.resolveAttachmentForWeapon(
            { id: 'mts_570_conversion_086fac7b', name: 'MTS-570 Conversion', slot: 'Ammo', compatibleWeaponIds: ['mts_569'] },
            'mts_569'
        );
        expect(mts570.changes.reloadEffects?.hasReloadEffects).toBe(true);
        expect(mts570.changes.reloadEffects?.animationMods).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ stage: 'pullbolt', timescale: 0.3, resettime: 0.35 }),
                expect.objectContaining({ stage: 'reloadstage', timescale: 0.28 })
            ])
        );
    });

    test('12. AR 20 Tact & AKU 9mm: Resolves alternative reload sequences (altreload)', () => {
        // AR 20 Tact: Default -> short
        const ar20 = resolver.resolveAttachmentForWeapon(
            { id: 'ar_20_tact_conversion_8cadf7c4', name: 'AR 20 Tact Conversion', slot: 'Ammo', compatibleWeaponIds: ['c25'] },
            'c25'
        );
        expect(ar20.changes.reloadEffects?.hasReloadEffects).toBe(true);
        expect(ar20.changes.reloadEffects?.alternativeSequence?.reload?.to).toBe('short');
        expect(ar20.changes.reloadEffects?.alternativeSequence?.reload?.note).toBe('Sequence-specific');

        // AKU 9mm: Default -> extended
        const aku9 = resolver.resolveAttachmentForWeapon(
            { id: 'aku_9mm_conversion_b01d7102', name: 'AKU 9mm Conversion', slot: 'Ammo', compatibleWeaponIds: ['aku12'] },
            'aku12'
        );
        expect(aku9.changes.reloadEffects?.hasReloadEffects).toBe(true);
        expect(aku9.changes.reloadEffects?.alternativeSequence?.reload?.to).toBe('extended');
        expect(aku9.changes.reloadEffects?.alternativeSequence?.reload?.note).toBe('Sequence-specific');
    });

    test('13. M16A2 Buffer Stock on Colt ACR: Resolves correct RPM semantics (650 → 850, RPM Δ +200)', () => {
        const m16a2 = resolver.resolveAttachmentForWeapon(
            { id: 'm16a2_buffer_stock_0f020b80', name: 'M16A2 Buffer Stock', slot: 'Other', compatibleWeaponIds: ['colt_acr'] },
            'colt_acr'
        );
        expect(m16a2.status).toBe('RESOLVED');
        expect(m16a2.changes.rpm?.from).toBe('650');
        expect(m16a2.changes.rpm?.to).toBe('850');
        expect(m16a2.profile?.recommendationFeatures?.rpmDelta).toBe(200);
        expect(m16a2.changes.damage?.from).toBe('22 → 14');
        expect(m16a2.changes.damage?.to).toBe('19.8 → 12.6');
    });

    test('14. Heavy Buffer on Colt SMG 635: Resolves correct single-stage RPM modifier (1000 → 800, RPM Δ -200)', () => {
        const coltHb = resolver.resolveAttachmentForWeapon(
            { id: 'heavy_buffer_6081456c', name: 'Heavy Buffer', slot: 'Other', compatibleWeaponIds: ['colt_smg_635'] },
            'colt_smg_635'
        );
        expect(coltHb.status).toBe('RESOLVED');
        expect(coltHb.changes.rpm?.from).toBe('1000');
        expect(coltHb.changes.rpm?.to).toBe('800');
        expect(coltHb.profile?.recommendationFeatures?.rpmDelta).toBe(-200);
    });
});

