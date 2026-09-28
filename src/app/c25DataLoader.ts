import { WeaponsParser, WeaponCompiler } from '../core';
import rawWeaponsData from '../../data/raw/weapons.json';
import c25DetailData from '../../data/raw/weapon-details/c25.json';

export type CompiledWeaponData = Record<string, any>;

export function loadCompiledC25Data(): CompiledWeaponData {
    const parser = new WeaponsParser();
    const parseResult = parser.parse(rawWeaponsData);

    const c25Normalized = parseResult.weapons.get('c25');
    if (!c25Normalized) {
        throw new Error('C25 weapon not found in normalized weapons database.');
    }

    const compiler = new WeaponCompiler();
    const compileResult = compiler.compileWeapon(
        c25Normalized,
        {},
        parseResult.attachments,
        c25DetailData
    );

    return compileResult.compiledWeaponData;
}
