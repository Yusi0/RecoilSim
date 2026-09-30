import { WeaponsParser, WeaponCompiler } from '../core';
import rawWeaponsData from '../../data/raw/weapons.json';
import c25DetailData from '../../data/raw/weapon-details/c25.json';
import ak105DetailData from '../../data/raw/weapon-details/ak105.json';
import m231DetailData from '../../data/raw/weapon-details/m231.json';
import m16a3DetailData from '../../data/raw/weapon-details/m16a3.json';
import microUziDetailData from '../../data/raw/weapon-details/micro_uzi.json';

export type CompiledWeaponData = Record<string, any>;

export interface WeaponOption {
    id: string;
    name: string;
    displayName: string;
    firerate: number;
    magsize: number;
}

export const SUPPORTED_WEAPONS: WeaponOption[] = [
    { id: 'c25', name: 'C25', displayName: 'C25', firerate: 800, magsize: 30 },
    { id: 'ak105', name: 'AK105', displayName: 'AK-105', firerate: 600, magsize: 30 },
    { id: 'm231', name: 'M231', displayName: 'M231', firerate: 1225, magsize: 30 },
    { id: 'm16a3', name: 'M16A3', displayName: 'M16A3', firerate: 800, magsize: 30 }
];

const weaponDetailsMap: Record<string, any> = {
    c25: c25DetailData,
    ak105: ak105DetailData,
    m231: m231DetailData,
    m16a3: m16a3DetailData,
    micro_uzi: microUziDetailData
};

const displayNamesMap: Record<string, string> = {
    c25: 'C25',
    ak105: 'AK-105',
    m231: 'M231',
    m16a3: 'M16A3',
    micro_uzi: 'Micro Uzi'
};

export function loadCompiledWeaponData(weaponId: string = 'c25'): CompiledWeaponData {
    const parser = new WeaponsParser();
    const parseResult = parser.parse(rawWeaponsData);

    const targetId = weaponId.toLowerCase();
    const norm = parseResult.weapons.get(targetId);
    if (!norm) {
        throw new Error(`Weapon '${weaponId}' not found in normalized weapons database.`);
    }

    const detailData = weaponDetailsMap[targetId] || c25DetailData;
    const compiler = new WeaponCompiler();
    const compileResult = compiler.compileWeapon(
        norm,
        {},
        parseResult.attachments,
        detailData
    );

    const data = compileResult.compiledWeaponData;
    if (!data.displayname && displayNamesMap[targetId]) {
        data.displayname = displayNamesMap[targetId];
    }

    return data;
}

export function loadCompiledMicroUziData(): CompiledWeaponData {
    return loadCompiledWeaponData('micro_uzi');
}

export function loadCompiledC25Data(): CompiledWeaponData {
    return loadCompiledWeaponData('c25');
}

export function loadDefaultWeaponData(): CompiledWeaponData {
    return loadCompiledC25Data();
}
