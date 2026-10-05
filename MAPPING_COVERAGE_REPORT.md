# RecoilSim Data Mapping Coverage Report

**Generated At**: 2026-10-05T07:50:21.069Z
**Purpose**: Authoritative audit of all source fields from Phantom Forces API & In-game Luau modules and their handling in RecoilSim.

## 1. Classification Summary

| Status | Count | Description |
| :--- | :---: | :--- |
| **MAPPED** | 24 | 1:1 direct mapping from source to RecoilSim schema |
| **TRANSFORMED** | 11 | Normalization applied (e.g. array-to-scalar, hash-keyed map, unit normalization) |
| **DERIVED** | 5 | Mathematically computed in simulation physics from base fields |
| **IGNORED** | 5 | Explicitly discarded cosmetic/rendering rig data (no physics impact) |
| **UNMAPPED** | 0 | Unhandled fields (0 fields - none discarded silently) |
| **MISSING** | 0 | Fields required for simulation but absent in 11.17 API (fallback to 11.16) |
| **UNVERIFIED** | 0 | Fields present in 11.17 without in-game verification (marked provisional) |

## 2. Exhaustive Field-by-Field Mapping Matrix

| Source Field | Status | Source Origin | RecoilSim Target Field | Physics & Pipeline Handling |
| :--- | :---: | :--- | :--- | :--- |
| `name` | **`MAPPED`** | API/In-game | `NormalizedWeapon.name` | Weapon identifier string |
| `displayName` | **`MAPPED`** | API/In-game | `NormalizedWeapon.displayName` | Display name string (with fallback to name) |
| `category` | **`MAPPED`** | API/In-game | `NormalizedWeapon.category` | Weapon classification category (AR, Carbine, DMR, etc.) |
| `damage0` | **`MAPPED`** | API/In-game | `stats.damage0` | Point-blank damage value |
| `damage1` | **`MAPPED`** | API/In-game | `stats.damage1` | Minimum range damage dropoff floor |
| `range0` | **`MAPPED`** | API/In-game | `stats.range0` | Distance where damage dropoff begins |
| `range1` | **`MAPPED`** | API/In-game | `stats.range1` | Distance where damage dropoff ends |
| `damageGraph` | **`TRANSFORMED`** | In-game | `stats.damageGraph` | Multi-point damage curve array |
| `multhead` | **`MAPPED`** | API/In-game | `stats.multhead` | Headshot damage multiplier |
| `multtorso` | **`MAPPED`** | API/In-game | `stats.multtorso` | Torso damage multiplier |
| `rpm / firerate` | **`TRANSFORMED`** | API (rpm) / Ingame (firerate) | `stats.rpm` | Rounds per minute (array transformed to primary scalar, secondary modes preserved in firemodes) |
| `magsize` | **`MAPPED`** | API/In-game | `stats.magsize` | Magazine capacity |
| `chamber` | **`MAPPED`** | API/In-game | `stats.chamber` | One in chamber indicator |
| `sparerounds` | **`MAPPED`** | API/In-game | `stats.sparerounds` | Reserve ammunition count |
| `walkspeed` | **`MAPPED`** | API/In-game | `stats.walkspeed` | Movement speed in studs/second |
| `pelletcount` | **`MAPPED`** | API/In-game | `stats.pelletcount` | Number of pellets per shotgun blast |
| `rank / unlockrank` | **`TRANSFORMED`** | API (rank) / Ingame (unlockrank) | `stats.rank` | Player level required to unlock |
| `exclusiveUnlock` | **`MAPPED`** | API/In-game | `stats.exclusiveUnlock` | Flag for special/case unlock only |
| `superTester` | **`MAPPED`** | API/In-game | `stats.superTester` | Flag for developer/tester restricted item |
| `grantable` | **`MAPPED`** | API/In-game | `stats.grantable` | Admin grantable flag |
| `recoil (16 springs)` | **`TRANSFORMED`** | In-game Luau / weapon-details | `weapon_details.recoil` | 16 spring parameters (Aim/Hip Translation, Rotation, CameraBody, CameraHead + Recoveries). In 11.17 API: MISSING; handled via INHERITED_FROM_11_16 fallback for 292 firearms, UNVERIFIED_11_17 for 8 new weapons. |
| `sprintspeed` | **`TRANSFORMED`** | In-game Luau / weapon-details | `weapon_details.sprintspeed` | Sprint transition speed. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `unsprintspeed` | **`TRANSFORMED`** | In-game Luau / weapon-details | `weapon_details.unsprintspeed` | Sprint exit speed. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `aimspeed` | **`TRANSFORMED`** | In-game Luau / weapon-details | `weapon_details.aimspeed` | ADS transition spring speed. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `unaimspeed` | **`TRANSFORMED`** | In-game Luau / weapon-details | `weapon_details.unaimspeed` | ADS exit speed. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `aimwalkspeedmult` | **`TRANSFORMED`** | In-game Luau / weapon-details | `weapon_details.aimwalkspeedmult` | Walk speed multiplier while aiming. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `equipspeed / unequipspeed` | **`TRANSFORMED`** | In-game Luau / weapon-details | `weapon_details.equipspeed` | Weapon swap spring frequencies. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `equiptime / unequiptime` | **`TRANSFORMED`** | In-game Luau / weapon-details | `weapon_details.equiptime` | Weapon swap animation durations. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `bulletspeed` | **`MAPPED`** | In-game Luau / weapon-details | `weapon_details.bulletspeed` | Muzzle velocity in studs/s. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `penetrationdepth` | **`MAPPED`** | In-game Luau / weapon-details | `weapon_details.penetrationdepth` | Wall penetration distance in studs. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `suppression` | **`MAPPED`** | In-game Luau / weapon-details | `weapon_details.suppression` | Suppression effect radius. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `hipfirespread` | **`MAPPED`** | In-game Luau / weapon-details | `weapon_details.hipfirespread` | Hipfire cone spread radians. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `hipfirespreadrecover` | **`MAPPED`** | In-game Luau / weapon-details | `weapon_details.hipfirespreadrecover` | Spread recovery coefficient. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `hipfirestability` | **`MAPPED`** | In-game Luau / weapon-details | `weapon_details.hipfirestability` | Hipfire recoil damping stability. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `crossexpansion` | **`MAPPED`** | In-game Luau / weapon-details | `weapon_details.crossexpansion` | Crosshair bloom maximum expansion. In 11.17 API: MISSING; handled via INHERITED_FROM_11_16. |
| `TTK (Time to Kill)` | **`DERIVED`** | Calculated | `simulation.ttkMs` | (ceil(100/damage0) - 1) * (60000 / rpm) |
| `ADS Time (95%)` | **`DERIVED`** | Calculated | `simulation.adsMs` | 4743.8645 / aimspeed (critically damped spring t95) |
| `Sprint Delay (95%)` | **`DERIVED`** | Calculated | `simulation.sprintMs` | 4015.0 / sprintspeed (underdamped d=0.90 spring t95) |
| `Equip Time (95%)` | **`DERIVED`** | Calculated | `simulation.equipMs` | 3126.0 / equipspeed (underdamped d=0.75 spring t95) |
| `AimWalk Speed` | **`DERIVED`** | Calculated | `simulation.aimWalkSpeed` | walkspeed * aimwalkspeedmult (studs/s) |
| `animations` | **`IGNORED`** | In-game Luau | `None` | Complex 3D CFrame keyframe tracks for player character arms and weapon rig |
| `aimoffset / equipoffset / sprintoffset` | **`IGNORED`** | In-game Luau | `None` | Camera viewmodel 3D CFrame offsets in viewport |
| `description` | **`IGNORED`** | API/In-game | `None` | Flavor text and lore string |
| `casetype / ammotype` | **`IGNORED`** | In-game Luau | `None` | Cosmetic spent brass particle casing model ID |
| `auxmodels / mountnode / copynodes / weldpart` | **`IGNORED`** | API | `None` | Roblox 3D weld attachment point names |

## 3. 11.17 API Omission & Fallback Policy (Zero Silent Loss)

In the PF 11.17 API (`11.17weapons.json`), all 16 recoil springs and handling speeds (`sprintspeed`, `equipspeed`, `aimspeed`) remain **100% omitted** by Stylis Studios.

- **For existing 292 firearms**: The system explicitly inherits 11.16 verified recoil springs with provenance tag `INHERITED_FROM_11_16` and verification status `PROVISIONAL_11_17`.
- **For new 8 weapons**: Recoil springs are explicitly set to `null` with provenance `UNVERIFIED_11_17`. **No arbitrary recoil constants are ever guessed or fabricated**.
- **For 633 global attachments**: Modifiers omitted in raw API are populated from verified 11.16 in-game database under classification `HOLD_FOR_VERIFICATION`.
