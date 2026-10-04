import { WeaponRecommendationProfile } from './RecommendationTypes';

/**
 * Standard recommendation profiles for supported weapons.
 * Explicitly defines the Layer 2 exploration candidate slots and attachments.
 */
export const WEAPON_RECOMMENDATION_PROFILES: Record<string, WeaponRecommendationProfile> = {
    c25: {
        weaponId: 'c25',
        candidateSlots: ['Barrel', 'Underbarrel'],
        candidateAttachmentNames: {
            Barrel: [
                'Compensator',
                'Muzzle Brake',
                'T-Brake',
                'R2 Suppressor',
                'Muzzle Booster',
                'Muffler',
                'Flash Hider'
            ],
            Underbarrel: [
                'Stubby Grip',
                'Folding Grip',
                'Angled Grip',
                'Romanian Grip',
                'Potato Grip',
                'Pistol Grip'
            ]
        },
        contextSlots: ['Optics', 'Other', 'Ammo']
    },
    ak105: {
        weaponId: 'ak105',
        candidateSlots: ['Barrel', 'Underbarrel'],
        candidateAttachmentNames: {
            Barrel: [
                'Compensator',
                'Muzzle Brake',
                'T-Brake',
                'R2 Suppressor',
                'AK107 BARS Barrel'
            ],
            Underbarrel: [
                'Stubby Grip',
                'Folding Grip',
                'Angled Grip',
                'Romanian Grip',
                'Pistol Grip'
            ]
        },
        contextSlots: ['Optics', 'Other', 'Ammo']
    },
    m231: {
        weaponId: 'm231',
        candidateSlots: ['Barrel', 'Underbarrel'],
        candidateAttachmentNames: {
            Barrel: [
                'Compensator',
                'Muzzle Brake',
                'T-Brake',
                'R2 Suppressor',
                'Oil Filter'
            ],
            Underbarrel: [
                'Stubby Grip',
                'Folding Grip',
                'Angled Grip',
                'Romanian Grip',
                'Pistol Grip'
            ]
        },
        contextSlots: ['Optics', 'Other', 'Ammo']
    },
    m16a3: {
        weaponId: 'm16a3',
        candidateSlots: ['Barrel', 'Underbarrel'],
        candidateAttachmentNames: {
            Barrel: [
                'Compensator',
                'Muzzle Brake',
                'T-Brake',
                'R2 Suppressor',
                'Muzzle Booster',
                'Muffler'
            ],
            Underbarrel: [
                'Stubby Grip',
                'Folding Grip',
                'Angled Grip',
                'Romanian Grip',
                'Potato Grip',
                'Pistol Grip'
            ]
        },
        contextSlots: ['Optics', 'Other', 'Ammo']
    }
};

export function getWeaponRecommendationProfile(weaponId: string): WeaponRecommendationProfile {
    const key = weaponId.toLowerCase();
    return (
        WEAPON_RECOMMENDATION_PROFILES[key] || {
            weaponId: key,
            candidateSlots: ['Barrel', 'Underbarrel'],
            contextSlots: ['Optics', 'Other', 'Ammo']
        }
    );
}
