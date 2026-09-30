import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame, WeaponsParser, WeaponCompiler, Vector3Spring, calcVector3SpringPV } from '../src/core';

function runHipfireDiagnostic() {
    const rawFilePath = path.join(__dirname, '../data/raw/weapons.json');
    const rawDetailPath = path.join(__dirname, '../data/raw/weapon-details/c25.json');

    const rawWeaponsData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));
    const parser = new WeaponsParser();
    const parseResult = parser.parse(rawWeaponsData);

    const c25Normalized = parseResult.weapons.get('c25')!;
    const attachmentMap = parseResult.attachments;
    const c25Detail = JSON.parse(fs.readFileSync(rawDetailPath, 'utf-8'));

    const compiler = new WeaponCompiler();
    const compileResult = compiler.compileWeapon(c25Normalized, {}, attachmentMap, c25Detail);
    const compiledC25Data = compileResult.compiledWeaponData;

    console.log('================================================================================');
    console.log('C25 HIPFIRE _spreadSpring 14-SHOT DIAGNOSTIC');
    console.log('================================================================================');
    console.log('Weapon Stats:');
    console.log('  hipfirespread        :', compiledC25Data.hipfirespread);
    console.log('  hipfirestability     :', compiledC25Data.hipfirestability);
    console.log('  hipfirespreadrecover :', compiledC25Data.hipfirespreadrecover);
    console.log('  firerate             :', compiledC25Data.firerate, 'RPM (interval = 0.075s)');

    const seed = 2026;
    const engine = new SimulationEngine({
        weaponData: compiledC25Data,
        seed,
        baseCameraOrientation: CFrame.IDENTITY,
        positionOffset: new Vector3(0, 1.5, 0)
    });

    // Ensure Hipfire mode
    engine.pushAimInput(false, 0.0);
    engine.advanceTo(0.1);

    const interval = 60 / compiledC25Data.firerate; // 0.075s
    const totalShots = 14;

    // Queue 14 shots
    for (let i = 0; i < totalShots; i++) {
        engine.pushFireInput(0.1 + i * interval);
    }

    // Step through virtual time and capture state at each shot
    const capturedShots: any[] = [];
    let shotIdx = 0;

    engine.setOnPhysicalShot((shot) => {
        shotIdx++;
        const t = shot.timestamp;
        const pose = engine.getWeaponPose(t);

        // Access internal springs of engine
        const spreadSpring = engine.spreadSpring;
        const spread_p = spreadSpring.p;
        const spread_v = spreadSpring.v;
        const spread_a = spreadSpring.a;
        const spread_s = spreadSpring.s;
        const spread_d = spreadSpring.d;

        const rot_p = pose.rotationRecoilVec;
        const camBody_p = pose.cameraBodyRecoilVec;
        const forward = pose.forward;

        capturedShots.push({
            shotIndex: shotIdx,
            timestamp: t,
            spreadSpring: {
                s: { x: spread_s.x, y: spread_s.y, z: spread_s.z },
                d: { x: spread_d.x, y: spread_d.y, z: spread_d.z },
                a: { x: spread_a.x, y: spread_a.y, z: spread_a.z, mag: spread_a.magnitude },
                v: { x: spread_v.x, y: spread_v.y, z: spread_v.z, mag: spread_v.magnitude },
                p: { x: spread_p.x, y: spread_p.y, z: spread_p.z, mag: spread_p.magnitude },
            },
            rotationSpring_p: { x: rot_p.x, y: rot_p.y, z: rot_p.z, mag: rot_p.magnitude },
            cameraBodySpring_p: { x: camBody_p.x, y: camBody_p.y, z: camBody_p.z, mag: camBody_p.magnitude },
            weaponPoseForward: { x: forward.x, y: forward.y, z: forward.z }
        });
    });

    engine.advanceTo(0.1 + totalShots * interval + 0.1);

    // Print Table
    console.log('\n--------------------------------------------------------------------------------');
    console.log('SHOT-BY-SHOT CAPTURE (Current SimulationEngine)');
    console.log('--------------------------------------------------------------------------------');
    console.log(
        'Shot | Time   | spread.a (mag) | spread.v (mag) | spread.p (mag) | rot.p (mag) | camBody.p (mag) | forward (x, y, z)'
    );
    console.log('--------------------------------------------------------------------------------');

    for (const row of capturedShots) {
        const s = row.spreadSpring;
        const r = row.rotationSpring_p;
        const c = row.cameraBodySpring_p;
        const f = row.weaponPoseForward;

        console.log(
            `#${String(row.shotIndex).padStart(2)} | ` +
            `${row.timestamp.toFixed(3)}s | ` +
            `a=${s.a.mag.toFixed(5).padStart(7)} | ` +
            `v=${s.v.mag.toFixed(5).padStart(7)} | ` +
            `p=${s.p.mag.toFixed(5).padStart(7)} | ` +
            `r=${r.mag.toFixed(5).padStart(7)} | ` +
            `c=${c.mag.toFixed(5).padStart(7)} | ` +
            `(${f.x.toFixed(4)}, ${f.y.toFixed(4)}, ${f.z.toFixed(4)})`
        );
    }

    console.log('\n--------------------------------------------------------------------------------');
    console.log('DETAILED VECTOR BREAKDOWN FOR EACH SHOT:');
    console.log('--------------------------------------------------------------------------------');
    for (const row of capturedShots) {
        console.log(`\n=== Shot #${row.shotIndex} @ ${row.timestamp.toFixed(3)}s ===`);
        console.log('  spreadSpring.s        :', row.spreadSpring.s);
        console.log('  spreadSpring.d        :', row.spreadSpring.d);
        console.log(`  spreadSpring.a        : [${row.spreadSpring.a.x.toFixed(6)}, ${row.spreadSpring.a.y.toFixed(6)}, ${row.spreadSpring.a.z.toFixed(6)}]  |mag|=${row.spreadSpring.a.mag.toFixed(6)}`);
        console.log(`  spreadSpring.v        : [${row.spreadSpring.v.x.toFixed(6)}, ${row.spreadSpring.v.y.toFixed(6)}, ${row.spreadSpring.v.z.toFixed(6)}]  |mag|=${row.spreadSpring.v.mag.toFixed(6)}`);
        console.log(`  spreadSpring.p        : [${row.spreadSpring.p.x.toFixed(6)}, ${row.spreadSpring.p.y.toFixed(6)}, ${row.spreadSpring.p.z.toFixed(6)}]  |mag|=${row.spreadSpring.p.mag.toFixed(6)}`);
        console.log(`  rotationSpring.p      : [${row.rotationSpring_p.x.toFixed(6)}, ${row.rotationSpring_p.y.toFixed(6)}, ${row.rotationSpring_p.z.toFixed(6)}]  |mag|=${row.rotationSpring_p.mag.toFixed(6)}`);
        console.log(`  cameraBodySpring.p    : [${row.cameraBodySpring_p.x.toFixed(6)}, ${row.cameraBodySpring_p.y.toFixed(6)}, ${row.cameraBodySpring_p.z.toFixed(6)}]  |mag|=${row.cameraBodySpring_p.mag.toFixed(6)}`);
        console.log(`  WeaponPose.forward    : [${row.weaponPoseForward.x.toFixed(6)}, ${row.weaponPoseForward.y.toFixed(6)}, ${row.weaponPoseForward.z.toFixed(6)}]`);
    }

    // Now, run a comparison against PF Ideal Spring (where s = hipfirespreadrecover, d = hipfirestability)
    console.log('\n================================================================================');
    console.log('COMPARISON: Current RecoilSim (s=1, d=1) vs PF Original (s=10, d=0.8)');
    console.log('================================================================================');

    const pfSpring = new Vector3Spring(
        Vector3.ZERO,
        new Vector3(compiledC25Data.hipfirestability, compiledC25Data.hipfirestability, compiledC25Data.hipfirestability), // d = 0.8
        new Vector3(compiledC25Data.hipfirespreadrecover, compiledC25Data.hipfirespreadrecover, compiledC25Data.hipfirespreadrecover) // s = 10
    );

    const currentSpring = new Vector3Spring(Vector3.ZERO, Vector3.ONE, Vector3.ONE);

    // Replay the exact same impulses through both springs at 0.075s interval
    // In SimulationEngine:
    // spreadMagnitude = 0.5 * (1 - aim) * (1 - stanceStab) * hipfirespread * hipfirespreadrecover
    // For Stand stance, stanceStab = 0.2 (standstability)
    // 0.5 * 1.0 * (1 - 0.2) * 0.065 * 10 = 0.5 * 0.8 * 0.65 = 0.26
    const hipfirespread = compiledC25Data.hipfirespread;
    const hipfirespreadrecover = compiledC25Data.hipfirespreadrecover;
    const stanceStab = 0.2; // c25 standstability
    const spreadMagnitude = 0.5 * 1.0 * (1 - stanceStab) * hipfirespread * hipfirespreadrecover;

    console.log(`Impulse formula: 0.5 * (1 - aim) * (1 - stanceStab) * hipfirespread * hipfirespreadrecover`);
    console.log(`                = 0.5 * 1.0 * (1 - 0.2) * 0.065 * 10 = ${spreadMagnitude}`);

    // Trace both springs across 14 shots
    const comparisonRows: any[] = [];
    for (let i = 0; i < 14; i++) {
        const shotTime = i * 0.075;

        // Capture before impulse
        const cur_p_before = currentSpring.p.clone();
        const cur_v_before = currentSpring.v.clone();
        const cur_a_before = currentSpring.a.clone();

        const pf_p_before = pfSpring.p.clone();
        const pf_v_before = pfSpring.v.clone();
        const pf_a_before = pfSpring.a.clone();

        // Apply impulse (same as RECOIL_IMPULSE)
        const randX = 0.707; // deterministic test vector for comparison
        const randY = 0.707;
        const impulse = new Vector3(spreadMagnitude * randX, spreadMagnitude * randY, 0);

        currentSpring.accelerate(impulse);
        pfSpring.accelerate(impulse);

        comparisonRows.push({
            shot: i + 1,
            time: shotTime,
            impulseMag: impulse.magnitude,
            current: { p: cur_p_before.magnitude, v: cur_v_before.magnitude, a: cur_a_before.magnitude },
            pf: { p: pf_p_before.magnitude, v: pf_v_before.magnitude, a: pf_a_before.magnitude }
        });

        // Step forward by 0.075s (to next shot)
        currentSpring.update(0.075);
        pfSpring.update(0.075);
    }

    console.log('\nComparison of spreadSpring state at SHOT moment (before new impulse):');
    console.log('Shot | Current |p| (s=1,d=1) | PF Original |p| (s=10,d=0.8) | Ratio (Current / PF)');
    console.log('--------------------------------------------------------------------------------');
    for (const r of comparisonRows) {
        const ratio = r.pf.p > 1e-7 ? (r.current.p / r.pf.p).toFixed(2) : 'N/A';
        console.log(
            `#${String(r.shot).padStart(2)} | ` +
            `Current |p|=${r.current.p.toFixed(5).padStart(7)} | ` +
            `PF |p|=${r.pf.p.toFixed(5).padStart(7)} | ` +
            `${ratio}x`
        );
    }
}

runHipfireDiagnostic();
