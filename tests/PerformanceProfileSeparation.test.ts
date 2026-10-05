import * as fs from 'fs';
import * as path from 'path';
import { AttachmentEffectResolver } from '../src/core/compiler/AttachmentEffectResolver';

describe('Performance Profile & Recoil Context Decoupling Test', () => {
    let resolver: AttachmentEffectResolver;
    let candidateIds: Set<string>;
    let candidatesList: any[];

    beforeAll(() => {
        resolver = AttachmentEffectResolver.createDefault(path.resolve(__dirname, '..'));
        const candFile = path.resolve(__dirname, '../data/classifier_candidates_11_17.json');
        if (fs.existsSync(candFile)) {
            candidatesList = JSON.parse(fs.readFileSync(candFile, 'utf8'));
            candidateIds = new Set(candidatesList.map(c => c.id));
        } else {
            candidatesList = [];
            candidateIds = new Set();
        }
    });

    describe('Candidate Pool Isolation (Ammo completely excluded from General Classifier)', () => {
        test('No Ammo attachment exists in the classifier candidate pool', () => {
            expect(candidatesList.length).toBeGreaterThan(0);
            const ammoCandidates = candidatesList.filter(c => c.slot === 'Ammo');
            expect(ammoCandidates).toEqual([]);
        });
    });

    describe('1. Ammo Attachments (Independent Ballistic/Performance Baseline, Excluded from Classifier)', () => {
        test('MTS-570 Conversion: Ammo Baseline = YES, General Classifier Candidate = NO', () => {
            const attId = 'mts_570_conversion_086fac7b';
            const result = resolver.resolveAttachmentForWeapon(
                { id: attId, name: 'MTS-570 Conversion', slot: 'Ammo', compatibleWeaponIds: ['mts_569'] },
                'mts_569'
            );

            expect(result.status).toBe('RESOLVED');
            const profile = result.profile!;
            expect(profile).toBeDefined();

            // Architecture verification
            expect(profile.isAmmoBaseline).toBe(true);
            expect(profile.isPerformanceBaseline).toBe(true);
            expect(profile.baselineLabel).toBe('Ammo Baseline');
            expect(profile.baselineType).toBe('CALIBER_CONVERSION');
            expect(candidateIds.has(attId)).toBe(false); // General Classifier Candidate = NO

            // Recommendation Features preserved
            expect(profile.recommendationFeatures.ammoConversion).toBe(true);
            expect(profile.recommendationFeatures.rpmDelta).toBe(53);
            expect(profile.recommendationFeatures.damageDelta?.close).toBe(-28.5);
            expect(profile.recoilContext).toBeNull(); // Not evaluated by classifier
        });

        test('Slugs: Ammo Baseline = YES, General Classifier Candidate = NO', () => {
            const attId = 'slugs_12_gauge_db687b32';
            const result = resolver.resolveAttachmentForWeapon(
                { id: attId, name: 'Slugs', slot: 'Ammo', compatibleWeaponIds: ['remington_870'] },
                'remington_870'
            );

            expect(result.status).toBe('RESOLVED');
            const profile = result.profile!;
            expect(profile).toBeDefined();

            // Architecture verification
            expect(profile.isAmmoBaseline).toBe(true);
            expect(profile.isPerformanceBaseline).toBe(true);
            expect(profile.baselineLabel).toBe('Ammo Baseline');
            expect(profile.baselineType).toBe('AMMO_BASELINE');
            expect(candidateIds.has(attId)).toBe(false); // General Classifier Candidate = NO

            // Recommendation Features: 8 -> 1 pellet, 1500 -> 2000 velocity
            expect(profile.recommendationFeatures.pelletCountDelta).toBe(-7);
            expect(profile.recommendationFeatures.bulletSpeedDelta).toBeGreaterThan(400);
            expect(profile.recoilContext).toBeNull();
        });

        test('.223 Remington: Ammo Baseline = YES, General Classifier Candidate = NO, recoilContext=null', () => {
            const attId = '223_remington_793f05cf';
            const rawAtt = {
                id: attId,
                name: '.223 Remington',
                slot: 'Ammo',
                compatibleWeaponIds: ['c25']
            };
            const profile = resolver.buildPerformanceProfile(rawAtt, 'c25', 'C25');

            expect(profile.isAmmoBaseline).toBe(true);
            expect(profile.isPerformanceBaseline).toBe(true);
            expect(profile.baselineLabel).toBe('Ammo Baseline');
            expect(candidateIds.has(attId)).toBe(false); // General Classifier Candidate = NO
            expect(profile.recoilContext).toBeNull(); // Formats independent baseline, not classified
        });

        test('AR .20 Tact Conversion: Ammo Baseline = YES, General Classifier Candidate = NO', () => {
            const attId = 'ar_20_tact_conversion_47341c5f';
            const result = resolver.resolveAttachmentForWeapon(
                { id: attId, name: '.20 Tactical Conversion', slot: 'Ammo', compatibleWeaponIds: ['c25'] },
                'c25'
            );

            const profile = result.profile!;
            expect(profile.isAmmoBaseline).toBe(true);
            expect(profile.isPerformanceBaseline).toBe(true);
            expect(profile.baselineLabel).toBe('Ammo Baseline');
            expect(profile.baselineType).toBe('CALIBER_CONVERSION');
            expect(candidateIds.has(attId)).toBe(false); // General Classifier Candidate = NO
        });
    });

    describe('2. Optics Attachments (Existing Weapon Baseline, recoilContext = false)', () => {
        test('Coyote Sight: Ammo Baseline = NO, Performance Baseline = NO, Existing Weapon Baseline = YES, recoilContext = false', () => {
            const rawAtt = {
                id: 'coyote_sight_bca5f1cb',
                name: 'Coyote Sight',
                slot: 'Optics',
                compatibleWeaponIds: ['c25'],
                modifiers: [
                    { type: 'setters', indexPath: ['sight'], value: 'SightMark' },
                    { type: 'setters', indexPath: ['zoom'], value: 1.3 },
                    { type: 'setters', indexPath: ['aimzdist'], value: 1 }
                ]
            };
            const profile = resolver.buildPerformanceProfile(rawAtt, 'c25', 'C25');

            expect(profile.isAmmoBaseline).toBe(false);
            expect(profile.isPerformanceBaseline).toBe(false);
            expect(profile.baselineLabel).toBe('Existing Weapon Baseline');
            expect(profile.recoilContext).toBe(false);
            expect(profile.recommendationFeatures.zoom).toBe(1.3);
        });

        test('TA01 Acog: Ammo Baseline = NO, Performance Baseline = NO, Existing Weapon Baseline = YES, recoilContext = false', () => {
            const rawAtt = {
                id: 'ta01_acog_9b95fc3b',
                name: 'TA01 Acog',
                slot: 'Optics',
                compatibleWeaponIds: ['c25'],
                modifiers: [
                    { type: 'setters', indexPath: ['sight'], value: 'SightMarkTAScope' },
                    { type: 'setters', indexPath: ['zoom'], value: 4 },
                    { type: 'trueMultipliers', indexPath: ['aimspeed'], value: 0.925 },
                    { type: 'tableInserters', indexPath: ['altaimdata'], value: { zoom: 1.2 } }
                ]
            };
            const result = resolver.resolveAttachmentForWeapon(rawAtt, 'c25');
            const profile = result.profile!;

            expect(profile.isAmmoBaseline).toBe(false);
            expect(profile.isPerformanceBaseline).toBe(false);
            expect(profile.baselineLabel).toBe('Existing Weapon Baseline');
            expect(profile.recoilContext).toBe(false);
            expect(profile.recommendationFeatures.zoom).toBe(4);
            expect(profile.recommendationFeatures.hasAltAim).toBe(true);
            expect(profile.recommendationFeatures.aimSpeedDelta).toBeLessThan(0); // slowed ADS
        });
    });

    describe('3. General Attachments (Magazines, Grips, Barrels - Existing Weapon Baseline)', () => {
        test('Extended Magazine has magazine & handling context, isPerformanceBaseline=false, recoilContext=false', () => {
            const result = resolver.resolveAttachmentForWeapon(
                { id: 'extended_magazine_06142feb', name: 'Extended Magazine', slot: 'Other', compatibleWeaponIds: ['aug_a3'] },
                'aug_a3'
            );

            const profile = result.profile!;
            expect(profile.isAmmoBaseline).toBe(false);
            expect(profile.isPerformanceBaseline).toBe(false);
            expect(profile.baselineLabel).toBe('Existing Weapon Baseline');
            expect(profile.recoilContext).toBe(false);

            // Recommendation features
            expect(profile.recommendationFeatures.magSizeDelta).toBe(12);
            expect(profile.recommendationFeatures.walkSpeedDelta).toBe(-0.7);
            expect(profile.recommendationFeatures.sprintSpeedDelta).toBe(-0.7);
            expect(profile.recommendationFeatures.reloadSpeedMultiplier).toBe(1.15);
        });

        test('Skeleton Grip has handling and recoil context, preserves recoil parameters', () => {
            const result = resolver.resolveAttachmentForWeapon(
                { id: 'skeleton_grip_a1050a4d', name: 'Skeleton Grip', slot: 'Underbarrel', compatibleWeaponIds: ['c25'] },
                'c25'
            );

            const profile = result.profile!;
            expect(profile.isAmmoBaseline).toBe(false);
            expect(profile.isPerformanceBaseline).toBe(false);
            expect(profile.baselineLabel).toBe('Existing Weapon Baseline');
            expect(profile.recommendationFeatures.recoilParamCount).toBeGreaterThan(0);
            expect(profile.recommendationFeatures.swayModified).toBe(true);
            expect(profile.recommendationFeatures.aimSpeedDelta).toBeGreaterThan(0); // faster ADS
        });

        test('Oil Filter exposes Radar Stealth and suppression reduction on Existing Weapon Baseline', () => {
            const result = resolver.resolveAttachmentForWeapon(
                { id: 'oil_filter_d69aa804', name: 'Oil Filter', slot: 'Barrel', compatibleWeaponIds: ['c25'] },
                'c25'
            );

            const profile = result.profile!;
            expect(profile.isAmmoBaseline).toBe(false);
            expect(profile.isPerformanceBaseline).toBe(false);
            expect(profile.baselineLabel).toBe('Existing Weapon Baseline');
            expect(profile.recommendationFeatures.specialMechanics).toContain('Radar Stealth (hideminimap)');
            expect(profile.recommendationFeatures.suppressionDelta).toBeLessThan(0);
            expect(profile.contexts.fireControl).toBe(false);
        });
    });

    describe('4. Fire-Control / Weapon Behavior Context (Automated & Decoupled)', () => {
        test('MP5K Burst Trigger Group has fireControlContext=true, but is NOT performance baseline', () => {
            const result = resolver.resolveAttachmentForWeapon(
                { id: 'mp5k_burst_trigger_group_16042b88', name: 'MP5K Burst Trigger Group', slot: 'Other', compatibleWeaponIds: ['mp5k'] },
                'mp5k'
            );
            const profile = result.profile!;

            // Fire-control behavior
            expect(profile.contexts.fireControl).toBe(true);
            expect(profile.recommendationFeatures.fireControlChanged).toBe(true);
            expect(profile.recommendationFeatures.fireModesChanged).toBe(true);
            expect(profile.recommendationFeatures.specialMechanics).toContain('Burst Lock');
            expect(profile.recommendationFeatures.fireControlMechanics?.some(m => m.includes('Burst Lock'))).toBe(true);

            // Stays on Existing Weapon Baseline (Decoupled from isPerformanceBaseline)
            expect(profile.isAmmoBaseline).toBe(false);
            expect(profile.isPerformanceBaseline).toBe(false);
            expect(profile.baselineLabel).toBe('Existing Weapon Baseline');
        });

        test('TCR Duplex Binary & SL8 Binary have fireControlContext=true', () => {
            const tcrRes = resolver.resolveAttachmentForWeapon(
                { id: 'tcr_duplex_binary_b8d10cf3', name: 'TCR Duplex Binary', slot: 'Other', compatibleWeaponIds: ['beowulf_tcr'] },
                'beowulf_tcr'
            );
            expect(tcrRes.profile!.contexts.fireControl).toBe(true);
            expect(tcrRes.profile!.recommendationFeatures.fireControlChanged).toBe(true);
            expect(tcrRes.profile!.recommendationFeatures.fireControlMechanics).toBeDefined();

            const sl8Res = resolver.resolveAttachmentForWeapon(
                { id: 'sl8_binary_d0115b68', name: 'SL8 Binary', slot: 'Other', compatibleWeaponIds: ['sl_8'] },
                'sl_8'
            );
            expect(sl8Res.profile!.contexts.fireControl).toBe(true);
            expect(sl8Res.profile!.recommendationFeatures.fireControlChanged).toBe(true);
        });

        test('Glock Switch has fireControlContext=true (burst switch + variable firerate)', () => {
            const result = resolver.resolveAttachmentForWeapon(
                { id: 'glock_switch_3032b966', name: 'Glock Switch', slot: 'Other', compatibleWeaponIds: ['glock_1'] },
                'glock_1'
            );
            const profile = result.profile!;
            expect(profile.contexts.fireControl).toBe(true);
            expect(profile.recommendationFeatures.fireControlChanged).toBe(true);
            expect(profile.recommendationFeatures.fireModesChanged).toBe(true);
        });

        test('Pure RPM alterations (Heavy Buffer, M1919 Conversion) have fireControlContext=false', () => {
            // Heavy Buffer modifies RPM 1000 -> 640 on Colt SMG
            const hbRes = resolver.resolveAttachmentForWeapon(
                { id: 'heavy_buffer_2633f81e', name: 'Heavy Buffer', slot: 'Other', compatibleWeaponIds: ['colt_smg_635'] },
                'colt_smg_635'
            );
            const hbProf = hbRes.profile!;
            expect(hbProf.recommendationFeatures.rpmDelta).toBeLessThan(0);
            expect(hbProf.contexts.fireControl).toBe(false);
            expect(hbProf.recommendationFeatures.fireControlChanged).toBe(false);

            // M1919 Conversion modifies RPM 725 -> 1500 on Tommy Gun
            const m1919Res = resolver.resolveAttachmentForWeapon(
                { id: 'm1919_conversion_41300918', name: 'M1919 Conversion', slot: 'Other', compatibleWeaponIds: ['tommy_gun'] },
                'tommy_gun'
            );
            const m1919Prof = m1919Res.profile!;
            expect(m1919Prof.recommendationFeatures.rpmDelta).toBeGreaterThan(500);
            expect(m1919Prof.contexts.fireControl).toBe(false);
            expect(m1919Prof.recommendationFeatures.fireControlChanged).toBe(false);
        });

        test('Extended Magazine, Skeleton Grip, Oil Filter have fireControlContext=false', () => {
            const extMag = resolver.resolveAttachmentForWeapon(
                { id: 'extended_magazine_06142feb', name: 'Extended Magazine', slot: 'Other', compatibleWeaponIds: ['aug_a3'] },
                'aug_a3'
            );
            expect(extMag.profile!.contexts.fireControl).toBe(false);

            const skelGrip = resolver.resolveAttachmentForWeapon(
                { id: 'skeleton_grip_a1050a4d', name: 'Skeleton Grip', slot: 'Underbarrel', compatibleWeaponIds: ['c25'] },
                'c25'
            );
            expect(skelGrip.profile!.contexts.fireControl).toBe(false);

            const oilFilter = resolver.resolveAttachmentForWeapon(
                { id: 'oil_filter_d69aa804', name: 'Oil Filter', slot: 'Barrel', compatibleWeaponIds: ['c25'] },
                'c25'
            );
            expect(oilFilter.profile!.contexts.fireControl).toBe(false);
        });
    });
});
