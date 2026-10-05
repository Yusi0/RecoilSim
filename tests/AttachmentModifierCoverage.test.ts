import * as fs from 'fs';
import * as path from 'path';
import { AttachmentEffectResolver } from '../src/core/compiler/AttachmentEffectResolver';

describe('Gameplay Modifier Coverage & Gap Audit Test', () => {
    let resolver: AttachmentEffectResolver;
    let allPaths: Array<{ path: string; count: number; attachments: string[] }>;

    beforeAll(() => {
        resolver = AttachmentEffectResolver.createDefault(path.resolve(__dirname, '..'));
        const pathsFile = path.resolve(__dirname, '../scratch/all_modifier_paths.json');
        if (fs.existsSync(pathsFile)) {
            allPaths = JSON.parse(fs.readFileSync(pathsFile, 'utf8'));
        } else {
            allPaths = [];
        }
    });

    // Whitelist for non-gameplay paths (purely cosmetic, render, sound, viewmodel offset, or metadata)
    const COSMETIC_AND_METADATA_WHITELIST = new Set([
        'removeparts',
        'transparencymod',
        'removepartsabsolute',
        'menuNodeOverride',
        'aimzoffset',
        'node',
        'flash',
        'laser',
        'color',
        'reticle',
        'material',
        'sound',
        'camo',
        'mesh',
        'cam',
        'sight',
        'optic',
        'partcolormodabsolute',
        'hideiron',
        'ironhidden',
        'weldtobase',
        'scopesize',
        'midscope',
        'aperturescope',
        'scopedgesize',
        'reliefdistance',
        'reliefradius',
        'imgres',
        'blackscope',
        'altaimdata',
        'aimzdist',
        'zoom',
        'firepitch',
        'firevolume',
        'crossexpansion',
        'crosssize',
        'crossspeed',
        'crossdamper',
        'crossstyle',
        'reddot',
        'altaimdisable',
        'sniperbass',
        'snipercrack',
        'specialSFX',
        'bulletbrightness',
        'lenstrans',
        'lenspart',
        'ignoreAuxMount',
        'magdisappear',
        'altinspect',
        'altzoom',
        'hideunlessowned',
        'loosefiring',
        'centermark',
        'scopeid',
        'scopeimagesize',
        'barrel',
        'altmodel',
        'magfeed',
        'pinglife',
        'magnify',
        'effectsettings',
        'onfireanim',
        'onfireaimedanim',
        'forceonfire',
        'ignorestanceanim',
        'onfirearmstay',
        'larmequip',
        'rarmequip',
        'unquipspeed', // Typo in source Place file (Snubnose Barrel)
        'aimwalspeedmult', // Typo in source Place file (Trench Sweeper)
        'aimmagspeed', // Typo in source Place file (Trench Sweeper)
        'spintspeed', // Typo in source Place file (MC51SD Stock)
        'hipfiredpread' // Typo in source Place file (AKU 9mm)
    ]);

    function isWhitelisted(p: string): boolean {
        const lower = p.toLowerCase();
        // Viewmodel arm / camera offsets are purely client-side rendering positions
        if (lower.includes('offset')) return true;
        // Animation inspect
        if (lower.includes('inspect')) return true;
        // Muzzle fire animations (pure client recoil visual)
        if (lower.startsWith('animations.onfire') || lower.startsWith('animationmods.onfire')) return true;

        for (const w of COSMETIC_AND_METADATA_WHITELIST) {
            if (lower === w.toLowerCase() || lower.startsWith(w.toLowerCase() + '.') || lower.includes(w.toLowerCase())) {
                return true;
            }
        }
        return false;
    }

    test('1. Every distinct modifier path in the 11.17 dataset is classified or whitelisted', () => {
        expect(allPaths.length).toBeGreaterThan(0);

        const unhandledPaths: string[] = [];

        for (const item of allPaths) {
            const p = item.path.toLowerCase();
            const isCovered = 
                p.startsWith('recoil') || p.startsWith('xbias') || p.startsWith('ybias') ||
                p.startsWith('damage') ||
                p.startsWith('multhead') || p.startsWith('multtorso') || p.startsWith('truemultipliers') ||
                p.startsWith('firerate') || p.startsWith('rpm') || p.startsWith('firemodes') || p.startsWith('burst') ||
                p.startsWith('aimedfirerate') || p.startsWith('firecap') || p.startsWith('variablefirerate') || p.startsWith('heatfirerate') || p.startsWith('doubleactiondelay') ||
                p.startsWith('magsize') || p.startsWith('sparerounds') || p.startsWith('reserveammo') || p.startsWith('chamber') ||
                p.startsWith('requirechamber') || p.startsWith('boltlock') || p.startsWith('bolttime') ||
                p.startsWith('bulletspeed') || p.startsWith('penetration') || p.startsWith('suppression') || p.startsWith('pelletcount') || p.startsWith('bulletaccel') || p.startsWith('hiderange') ||
                p.startsWith('walkspeed') || p.startsWith('sprintspeed') || p.startsWith('aimwalkspeed') || p.startsWith('unsprintspeed') ||
                p.startsWith('aimspeed') || p.startsWith('unaimspeed') || p.startsWith('equipspeed') || p.startsWith('unequipspeed') ||
                p.startsWith('equiptime') || p.startsWith('unequiptime') || p.startsWith('magnifyspeed') || p.startsWith('unmagnifyspeed') || p.startsWith('pullout') ||
                p.startsWith('hipfirespread') || p.startsWith('spread') || p.includes('choke') ||
                p.includes('sway') || p.includes('steady') || p.includes('breath') || p.includes('recover') || p.includes('stability') || p.includes('swing') ||
                p.startsWith('ammotype') || p.startsWith('casetype') || p.startsWith('caliber') || p.startsWith('type') || p.startsWith('displayname') || p.startsWith('caselessammo') ||
                p.includes('reload') || p.startsWith('altreload') || p.startsWith('forcereload') || p.startsWith('uniquereload') || p.includes('pullbolt') || p.includes('pump') || p.startsWith('animationmods') ||
                p.startsWith('straightpull') || p.startsWith('hideminimap') || p.startsWith('tracerless') || p.startsWith('restrictedads') || p.startsWith('hasnoscopebonus') ||
                isWhitelisted(item.path);

            if (!isCovered) {
                unhandledPaths.push(item.path);
            }
        }

        expect(unhandledPaths).toEqual([]);
    });

    test('2. Extended Magazine resolves full handling & mobility suite (Weight penalties)', () => {
        const extMag = resolver.resolveAttachmentForWeapon(
            { id: 'extended_magazine_06142feb', name: 'Extended Magazine', slot: 'Other', compatibleWeaponIds: ['aug_a3'] },
            'aug_a3'
        );

        expect(extMag.status).toBe('RESOLVED');
        // Mobility
        expect(extMag.changes.walkSpeed).toBeDefined();
        expect(extMag.changes.walkSpeed?.to).toBeLessThan(extMag.changes.walkSpeed?.from!);
        expect(extMag.changes.sprintSpeed).toBeDefined();
        expect(extMag.changes.aimWalkSpeed).toBeDefined();
        // Handling
        expect(extMag.changes.aimSpeed).toBeDefined();
        expect(extMag.changes.equipSpeed).toBeDefined();
        expect(extMag.changes.equipTime).toBeDefined();
        expect(extMag.changes.equipTime?.to).toBeGreaterThan(extMag.changes.equipTime?.from!);
        // Reload
        expect(extMag.changes.reloadEffects?.hasReloadEffects).toBe(true);
        expect(extMag.changes.reloadEffects?.standard?.timescale?.deltaPercent).toBe('+15%');
    });

    test('3. Suppressors resolve Radar Stealth and Suppression reduction', () => {
        const oilFilter = resolver.resolveAttachmentForWeapon(
            { id: 'oil_filter_d69aa804', name: 'Oil Filter', slot: 'Barrel', compatibleWeaponIds: ['c25'] },
            'c25'
        );

        expect(oilFilter.status).toBe('RESOLVED');
        expect(oilFilter.changes.specialMechanics).toContain('Radar Stealth (hideminimap)');
        expect(oilFilter.changes.suppression).toBeDefined();
        expect(oilFilter.changes.suppression?.to).toBeLessThan(oilFilter.changes.suppression?.from!);
    });

    test('4. Skeleton Grip resolves Sway improvement and ADS boost', () => {
        const skelGrip = resolver.resolveAttachmentForWeapon(
            { id: 'skeleton_grip_a1050a4d', name: 'Skeleton Grip', slot: 'Underbarrel', compatibleWeaponIds: ['c25'] },
            'c25'
        );

        expect(skelGrip.status).toBe('RESOLVED');
        expect(skelGrip.changes.swaySummary).toBeDefined();
        expect(skelGrip.changes.aimSpeed).toBeDefined();
        expect(skelGrip.changes.aimSpeed?.to).toBeGreaterThan(skelGrip.changes.aimSpeed?.from!);
    });

    test('5. Slugs / Shotgun Ammunition resolves pelletCount conversion', () => {
        const slugs = resolver.resolveAttachmentForWeapon(
            { id: 'slugs_12_gauge_db687b32', name: 'Slugs', slot: 'Ammo', compatibleWeaponIds: ['remington_870'] },
            'remington_870'
        );

        expect(slugs.status).toBe('RESOLVED');
        expect(slugs.changes.pelletCount).toBeDefined();
        expect(slugs.changes.pelletCount?.to).toBe(1);
    });
});
