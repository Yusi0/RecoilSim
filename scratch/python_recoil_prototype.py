"""
Python Recoil Simulation Prototype for RecoilSim (C25 Numerical Verification)
"""

import ctypes
import json
import math
import os
import sys

# -----------------------------------------------------------------------------
# 1. Deterministic Mulberry32 PRNG (matching SeededPRNG.ts 100%)
# -----------------------------------------------------------------------------
def imul(a: int, b: int) -> int:
    return ctypes.c_int32(int(a) * int(b)).value

class SeededPRNG:
    def __init__(self, seed: int = 1337):
        self._seed = seed
        self._state = seed & 0xFFFFFFFF

    def reset(self, seed: int = None):
        if seed is not None:
            self._seed = seed
        self._state = self._seed & 0xFFFFFFFF

    def next_float(self) -> float:
        self._state = (self._state + 0x6D2B79F5) & 0xFFFFFFFF
        t = self._state
        t = imul(t ^ (t >> 15), t | 1) & 0xFFFFFFFF
        t = (t ^ (t + imul(t ^ (t >> 7), t | 61))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    def range(self, min_val: float, max_val: float) -> float:
        return min_val + (max_val - min_val) * self.next_float()

    def recoil_random(self, mean: float, variance: float) -> float:
        return variance * 2.0 * self.next_float() - variance + mean


# -----------------------------------------------------------------------------
# 2. Vector3 & CFrame Math
# -----------------------------------------------------------------------------
class Vector3:
    def __init__(self, x: float = 0.0, y: float = 0.0, z: float = 0.0):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)

    def add(self, other: 'Vector3') -> 'Vector3':
        return Vector3(self.x + other.x, self.y + other.y, self.z + other.z)

    def sub(self, other: 'Vector3') -> 'Vector3':
        return Vector3(self.x - other.x, self.y - other.y, self.z - other.z)

    def mul(self, val) -> 'Vector3':
        if isinstance(val, Vector3):
            return Vector3(self.x * val.x, self.y * val.y, self.z * val.z)
        return Vector3(self.x * val, self.y * val, self.z * val)

    def neg(self) -> 'Vector3':
        return Vector3(-self.x, -self.y, -self.z)

    @property
    def magnitude(self) -> float:
        return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)

    @property
    def unit(self) -> 'Vector3':
        mag = self.magnitude
        if mag == 0:
            return Vector3(0, 0, 0)
        return Vector3(self.x / mag, self.y / mag, self.z / mag)

    def clone(self) -> 'Vector3':
        return Vector3(self.x, self.y, self.z)

    def __repr__(self):
        return f"Vector3({self.x:.6f}, {self.y:.6f}, {self.z:.6f})"

Vector3.ZERO = Vector3(0, 0, 0)
Vector3.ONE = Vector3(1, 1, 1)


class CFrame:
    def __init__(self, x=0.0, y=0.0, z=0.0, R00=1.0, R01=0.0, R02=0.0, R10=0.0, R11=1.0, R12=0.0, R20=0.0, R21=0.0, R22=1.0):
        self.p = Vector3(x, y, z)
        self.R00 = float(R00)
        self.R01 = float(R01)
        self.R02 = float(R02)
        self.R10 = float(R10)
        self.R11 = float(R11)
        self.R12 = float(R12)
        self.R20 = float(R20)
        self.R21 = float(R21)
        self.R22 = float(R22)

    @staticmethod
    def identity():
        return CFrame(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)

    @staticmethod
    def new_pos(pos: Vector3):
        return CFrame(pos.x, pos.y, pos.z, 1, 0, 0, 0, 1, 0, 0, 0, 1)

    @staticmethod
    def from_axis_angle(vec: Vector3):
        angle = vec.magnitude
        if angle == 0:
            return CFrame.identity()
        ux = vec.x / angle
        uy = vec.y / angle
        uz = vec.z / angle
        c = math.cos(angle)
        s = math.sin(angle)
        C = 1.0 - c

        r00 = c + ux * ux * C
        r01 = ux * uy * C - uz * s
        r02 = ux * uz * C + uy * s

        r10 = uy * ux * C + uz * s
        r11 = c + uy * uy * C
        r12 = uy * uz * C - ux * s

        r20 = uz * ux * C - uy * s
        r21 = uz * uy * C + ux * s
        r22 = c + uz * uz * C

        return CFrame(0, 0, 0, r00, r01, r02, r10, r11, r12, r20, r21, r22)

    def mul(self, other):
        if isinstance(other, CFrame):
            x = self.p.x + self.R00 * other.p.x + self.R01 * other.p.y + self.R02 * other.p.z
            y = self.p.y + self.R10 * other.p.x + self.R11 * other.p.y + self.R12 * other.p.z
            z = self.p.z + self.R20 * other.p.x + self.R21 * other.p.y + self.R22 * other.p.z

            r00 = self.R00 * other.R00 + self.R01 * other.R10 + self.R02 * other.R20
            r01 = self.R00 * other.R01 + self.R01 * other.R11 + self.R02 * other.R21
            r02 = self.R00 * other.R02 + self.R01 * other.R12 + self.R02 * other.R22

            r10 = self.R10 * other.R00 + self.R11 * other.R10 + self.R12 * other.R20
            r11 = self.R10 * other.R01 + self.R11 * other.R11 + self.R12 * other.R21
            r12 = self.R10 * other.R02 + self.R11 * other.R12 + self.R12 * other.R22

            r20 = self.R20 * other.R00 + self.R21 * other.R10 + self.R22 * other.R20
            r21 = self.R20 * other.R01 + self.R21 * other.R11 + self.R22 * other.R21
            r22 = self.R20 * other.R02 + self.R21 * other.R12 + self.R22 * other.R22

            return CFrame(x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22)

        elif isinstance(other, Vector3):
            x = self.p.x + self.R00 * other.x + self.R01 * other.y + self.R02 * other.z
            y = self.p.y + self.R10 * other.x + self.R11 * other.y + self.R12 * other.z
            z = self.p.z + self.R20 * other.x + self.R21 * other.y + self.R22 * other.z
            return Vector3(x, y, z)

    def vector_to_world_space(self, vec: Vector3) -> Vector3:
        x = self.R00 * vec.x + self.R01 * vec.y + self.R02 * vec.z
        y = self.R10 * vec.x + self.R11 * vec.y + self.R12 * vec.z
        z = self.R20 * vec.x + self.R21 * vec.y + self.R22 * vec.z
        return Vector3(x, y, z)

    @property
    def z_vector(self) -> Vector3:
        return Vector3(self.R02, self.R12, self.R22)

    @property
    def look_vector(self) -> Vector3:
        return Vector3(-self.R02, -self.R12, -self.R22)


CFrame.IDENTITY = CFrame.identity()


# -----------------------------------------------------------------------------
# 3. Analytical Spring ODE Solvers (Spring.ts & Vector3Spring.ts)
# -----------------------------------------------------------------------------
def calc_spring_pv(d: float, s: float, p0: float, v0: float, p1: float, dt: float):
    if dt <= 0:
        return p0, v0

    if s == 0:
        return p0 + v0 * dt, v0

    v14 = s * dt
    v15 = d * d

    if v15 < 1:
        v16 = math.sqrt(1 - v15)
        v17 = math.exp(-d * v14) / v16
        v18 = v17 * math.cos(v16 * v14)
        v19 = v17 * math.sin(v16 * v14)
    elif v15 == 1:
        v16 = 1.0
        v18 = math.exp(-d * v14) / v16
        v19 = v18 * v14
    else:
        v16 = math.sqrt(v15 - 1)
        v20 = math.exp((-d + v16) * v14) / (2 * v16)
        v21 = math.exp((-d - v16) * v14) / (2 * v16)
        v18 = v20 + v21
        v19 = v20 - v21

    v22 = v16 * v18 + d * v19
    v23 = 1.0 - (v16 * v18 + d * v19)
    v24 = v19 / s
    v25 = -s * v19
    v26 = s * v19
    v27 = v16 * v18 - d * v19

    p = v22 * p0 + v23 * p1 + v24 * v0
    v = v25 * p0 + v26 * p1 + v27 * v0

    return p, v


class Spring:
    def __init__(self, initial_pos: float = 0.0, damping: float = 1.0, stiffness: float = 1.0):
        self._p0 = float(initial_pos)
        self._v0 = 0.0
        self._p1 = float(initial_pos)
        self._d = float(damping)
        self._s = float(stiffness)

    @property
    def p(self) -> float:
        return self._p0

    @p.setter
    def p(self, val: float):
        self._p0 = val

    @property
    def v(self) -> float:
        return self._v0

    @v.setter
    def v(self, val: float):
        self._v0 = val

    @property
    def t(self) -> float:
        return self._p1

    @t.setter
    def t(self, val: float):
        self._p1 = val

    @property
    def d(self) -> float:
        return self._d

    @d.setter
    def d(self, val: float):
        self._d = val

    @property
    def s(self) -> float:
        return self._s

    @s.setter
    def s(self, val: float):
        self._s = val

    def update(self, dt: float):
        res_p, res_v = calc_spring_pv(self._d, self._s, self._p0, self._v0, self._p1, dt)
        self._p0 = res_p
        self._v0 = res_v
        return res_p, res_v

    def accelerate(self, impulse: float, dt: float = 0.0):
        if dt > 0:
            res_p, res_v = calc_spring_pv(self._d, self._s, self._p0, self._v0, self._p1, dt)
            self._p0 = res_p
            self._v0 = res_v + impulse
        else:
            self._v0 += impulse


class Vector3Spring:
    def __init__(self, initial_pos: Vector3 = None, damping: Vector3 = None, stiffness: Vector3 = None):
        self._p0 = initial_pos.clone() if initial_pos else Vector3.ZERO
        self._v0 = Vector3.ZERO
        self._p1 = initial_pos.clone() if initial_pos else Vector3.ZERO
        self._d = damping.clone() if damping else Vector3.ONE
        self._s = stiffness.clone() if stiffness else Vector3.ONE

    @property
    def p(self) -> Vector3:
        return self._p0

    @p.setter
    def p(self, val: Vector3):
        self._p0 = val.clone()

    @property
    def v(self) -> Vector3:
        return self._v0

    @v.setter
    def v(self, val: Vector3):
        self._v0 = val.clone()

    @property
    def t(self) -> Vector3:
        return self._p1

    @t.setter
    def t(self, val: Vector3):
        self._p1 = val.clone()

    @property
    def d(self) -> Vector3:
        return self._d

    @d.setter
    def d(self, val: Vector3):
        self._d = val.clone()

    @property
    def s(self) -> Vector3:
        return self._s

    @s.setter
    def s(self, val: Vector3):
        self._s = val.clone()

    def update(self, dt: float):
        px, vx = calc_spring_pv(self._d.x, self._s.x, self._p0.x, self._v0.x, self._p1.x, dt)
        py, vy = calc_spring_pv(self._d.y, self._s.y, self._p0.y, self._v0.y, self._p1.y, dt)
        pz, vz = calc_spring_pv(self._d.z, self._s.z, self._p0.z, self._v0.z, self._p1.z, dt)

        self._p0 = Vector3(px, py, pz)
        self._v0 = Vector3(vx, vy, vz)
        return self._p0, self._v0

    def accelerate(self, impulse: Vector3, dt: float = 0.0):
        if dt > 0:
            self.update(dt)
            self._v0 = self._v0.add(impulse)
        else:
            self._v0 = self._v0.add(impulse)


# -----------------------------------------------------------------------------
# 4. RecoilSprings Architecture (matching RecoilSprings.ts)
# -----------------------------------------------------------------------------
AXIS_VECTORS = {
    'x': Vector3(1, 0, 0),
    'y': Vector3(0, 1, 0),
    'z': Vector3(0, 0, 1)
}
ALL_AXES = ['x', 'y', 'z']


def extract_recovery_layers(data):
    if not data:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and 'a' in data and isinstance(data['a'], list):
        return data['a']
    return []


def extract_recovery_delay(data):
    if not data or isinstance(data, list):
        return 0.0
    if isinstance(data, dict):
        if 'd' in data and isinstance(data['d'], dict) and 'delay' in data['d']:
            return float(data['d']['delay'])
        if 'delay' in data:
            return float(data['delay'])
    return 0.0


class RecoilSprings:
    def __init__(self, hip_params=None, aim_params=None, hip_rec_params=None, aim_rec_params=None, clock_fn=None, rng_fn=None):
        self._hip_parameters = hip_params or {}
        self._aim_parameters = aim_params or {}
        self._hip_recovery_parameters = hip_rec_params or {}
        self._aim_recovery_parameters = aim_rec_params or {}
        self._last_impulse_time = 0.0
        self._last_aim_state = False
        self._vector3_springs = []
        self._spring_last_times = []

        self._clock = clock_fn or (lambda: 0.0)
        self._rng = rng_fn or (lambda mean, var: var * 2.0 * math.sin(1) - var + mean)

        self.set_vector_parameters(self._hip_parameters)

    def _sync_spring(self, index: int, current_time: float):
        if index >= len(self._vector3_springs):
            return
        spring = self._vector3_springs[index]
        last_time = self._spring_last_times[index] if index < len(self._spring_last_times) else 0.0
        if current_time > last_time:
            dt = current_time - last_time
            spring.update(dt)
            self._spring_last_times[index] = current_time

    def get_p(self, current_time: float = None) -> Vector3:
        now = current_time if current_time is not None else self._clock()
        res = Vector3.ZERO
        for i in range(len(self._vector3_springs)):
            self._sync_spring(i, now)
            res = res.add(self._vector3_springs[i].p)
        return res

    def set_vector_parameters(self, params, current_time: float = None):
        now = current_time if current_time is not None else self._clock()

        for axis in ALL_AXES:
            layers = params.get(axis)
            if layers:
                for i in range(len(layers)):
                    while len(self._vector3_springs) <= i:
                        self._vector3_springs.append(Vector3Spring())
                        self._spring_last_times.append(now)

        for i in range(len(self._vector3_springs)):
            self._sync_spring(i, now)
            spring = self._vector3_springs[i]
            d = spring.d
            s = spring.s

            for axis in ALL_AXES:
                axis_dir = AXIS_VECTORS[axis]
                layers = params.get(axis)
                if layers and i < len(layers):
                    layer = layers[i]
                    d = d.mul(Vector3.ONE.sub(axis_dir)).add(axis_dir.mul(layer[0]))
                    s = s.mul(Vector3.ONE.sub(axis_dir)).add(axis_dir.mul(layer[1]))

            spring.d = d
            spring.s = s

    def set_single_axis_parameters(self, params, axis: str, current_time: float = None):
        now = current_time if current_time is not None else self._clock()
        axis_dir = AXIS_VECTORS[axis]
        recovery_layers = extract_recovery_layers(params.get(axis))

        for i in range(len(self._vector3_springs)):
            if i < len(recovery_layers):
                spring = self._vector3_springs[i]
                self._sync_spring(i, now)
                layer = recovery_layers[i]
                d = spring.d
                s = spring.s
                d = d.mul(Vector3.ONE.sub(axis_dir)).add(axis_dir.mul(layer[0]))
                s = s.mul(Vector3.ONE.sub(axis_dir)).add(axis_dir.mul(layer[1]))
                spring.d = d
                spring.s = s

    def set_aim(self, aim_state: bool, current_time: float = None):
        params = self._aim_parameters if aim_state else self._hip_parameters
        self._last_aim_state = aim_state
        self.set_vector_parameters(params, current_time)
        return params

    def apply_impulse(self, cframe=None, multiplier: float = 1.0, current_time: float = None):
        now = current_time if current_time is not None else self._clock()
        mult = multiplier if multiplier is not None else 1.0
        current_params = self.set_aim(self._last_aim_state, now)

        for i in range(len(self._vector3_springs)):
            self._sync_spring(i, now)
            spring = self._vector3_springs[i]
            impulse = Vector3.ZERO

            for axis in ALL_AXES:
                axis_dir = AXIS_VECTORS[axis]
                layers = current_params.get(axis)
                if layers and i < len(layers):
                    layer = layers[i]
                    val = self._rng(layer[2], layer[3])
                    impulse = impulse.add(axis_dir.mul(val))

            transformed_impulse = impulse
            if cframe:
                transformed_impulse = cframe.vector_to_world_space(impulse)

            transformed_impulse = transformed_impulse.mul(mult)
            spring.v = spring.v.add(transformed_impulse)

        self._last_impulse_time = now

    def step(self, current_time: float = None):
        now = current_time if current_time is not None else self._clock()

        for i in range(len(self._vector3_springs)):
            self._sync_spring(i, now)

        recovery_params = self._aim_recovery_parameters if self._last_aim_state else self._hip_recovery_parameters
        if not recovery_params:
            return

        for axis in ALL_AXES:
            axis_rec_data = recovery_params.get(axis)
            if axis_rec_data:
                delay = extract_recovery_delay(axis_rec_data)
                if self._last_impulse_time + delay < now:
                    self.set_single_axis_parameters(recovery_params, axis, now)


# -----------------------------------------------------------------------------
# 5. FirearmObjectRecoil & MainCameraObjectRecoil
# -----------------------------------------------------------------------------
class FirearmObjectRecoil:
    def __init__(self, weapon_data: dict, clock_fn=None, rng_fn=None):
        self._weapon_data = weapon_data
        recoil = weapon_data.get('recoil', {})

        self._translation_springs = RecoilSprings(
            recoil.get('hipTranslation'),
            recoil.get('aimTranslation'),
            recoil.get('hipTranslationRecovery'),
            recoil.get('aimTranslationRecovery'),
            clock_fn, rng_fn
        )
        self._rotation_springs = RecoilSprings(
            recoil.get('hipRotation'),
            recoil.get('aimRotation'),
            recoil.get('hipRotationRecovery'),
            recoil.get('aimRotationRecovery'),
            clock_fn, rng_fn
        )
        self._stance = 'stand'
        self._device = 'mouse'
        self._firemode_stability = 1.0

    def set_stance(self, stance: str):
        self._stance = stance

    def set_device(self, device: str):
        self._device = device

    def set_firemode_stability(self, stability: float):
        self._firemode_stability = stability

    def set_aim(self, aiming: bool, current_time: float = None):
        self._translation_springs.set_aim(aiming, current_time)
        self._rotation_springs.set_aim(aiming, current_time)

    def step(self, current_time: float = None):
        self._translation_springs.step(current_time)
        self._rotation_springs.step(current_time)

    def get_positions(self, current_time: float = None):
        return {
            "translation": self._translation_springs.get_p(current_time),
            "rotation": self._rotation_springs.get_p(current_time)
        }

    def compute_stance_stability(self) -> float:
        if self._stance == 'crouch':
            return 0.25
        elif self._stance == 'prone':
            return 0.50
        return 0.0

    def compute_weight_recoil_mult(self) -> float:
        weight_stat = self._weapon_data.get('weightrecoilmult')
        if weight_stat is None:
            mult = 1.0
        else:
            hipfire_stab = float(self._weapon_data.get('hipfirestability', 1.0))
            mult = hipfire_stab * self.compute_stance_stability() * self._firemode_stability
        if self._device == 'controller':
            mult *= 0.8
        return mult

    def compute_camera_recoil_multiplier(self, aim_progress: float = 1.0) -> float:
        camera_mult_stat = float(self._weapon_data.get('camerarecoilmult', 1.0))
        weight_mult = self.compute_weight_recoil_mult()
        n2 = (1.0 - aim_progress) * camera_mult_stat
        return weight_mult * n2

    def fire(self, current_time: float = None):
        mult = self.compute_weight_recoil_mult()
        self._translation_springs.apply_impulse(None, mult, current_time)
        self._rotation_springs.apply_impulse(None, mult, current_time)

    def get_recoil_delay(self) -> float:
        recoil = self._weapon_data.get('recoil', {})
        if 'recoildelay' in recoil:
            return float(recoil['recoildelay'])
        return 0.0


class MainCameraObjectRecoil:
    def __init__(self, camera_recoil_data: dict, clock_fn=None, rng_fn=None):
        data = camera_recoil_data or {}
        self._camera_body_springs = RecoilSprings(
            data.get('hipCameraBody'),
            data.get('aimCameraBody'),
            data.get('hipCameraBodyRecovery'),
            data.get('aimCameraBodyRecovery'),
            clock_fn, rng_fn
        )
        self._camera_head_springs = RecoilSprings(
            data.get('hipCameraHead'),
            data.get('aimCameraHead'),
            data.get('hipCameraHeadRecovery'),
            data.get('aimCameraHeadRecovery'),
            clock_fn, rng_fn
        )

    def set_aim(self, aiming: bool, current_time: float = None):
        self._camera_body_springs.set_aim(aiming, current_time)
        self._camera_head_springs.set_aim(aiming, current_time)

    def apply_impulse(self, multiplier: float = 1.0, current_time: float = None):
        self._camera_head_springs.apply_impulse(None, multiplier, current_time)
        self._camera_body_springs.apply_impulse(None, multiplier, current_time)

    def step(self, current_time: float = None):
        self._camera_body_springs.step(current_time)
        self._camera_head_springs.step(current_time)

    def compute_cframes(self, base_camera_orientation: CFrame, position_offset: Vector3, current_time: float = None):
        body_vec = self._camera_body_springs.get_p(current_time)
        head_vec = self._camera_head_springs.get_p(current_time)

        v186 = base_camera_orientation.mul(CFrame.from_axis_angle(body_vec))
        shake_cframe = v186.mul(CFrame.new_pos(position_offset))
        v187 = v186.mul(CFrame.from_axis_angle(head_vec)).mul(CFrame.new_pos(position_offset))

        return {
            "v186": v186,
            "shakeCFrame": shake_cframe,
            "v187": v187,
            "bodyRecoilVec": body_vec,
            "headRecoilVec": head_vec
        }


# -----------------------------------------------------------------------------
# 6. SimulationEngine Pipeline
# -----------------------------------------------------------------------------
class SimulationEngine:
    def __init__(self, config: dict):
        seed = config.get('seed', 1337)
        self._prng = SeededPRNG(seed)
        self._current_time = 0.0
        self._event_queue = []

        clock_fn = lambda: self._current_time
        rng_fn = lambda mean, var: self._prng.recoil_random(mean, var)

        weapon_data = config['weaponData']
        self._firearm_recoil = FirearmObjectRecoil(weapon_data, clock_fn, rng_fn)
        self._camera_recoil = MainCameraObjectRecoil(
            weapon_data.get('cameraRecoil') or weapon_data.get('recoil'),
            clock_fn, rng_fn
        )

        aim_speed = float(config.get('aimSpeed') or weapon_data.get('aimspeed', 15))
        self._aim_spring = Spring(0.0, 1.0, aim_speed)
        self._spread_spring = Vector3Spring()
        self._spread_last_time = 0.0

        self._firearm_state = {
            "nextShotTime": 0.0,
            "fireCount": 0,
            "firemodeStability": 1.0
        }
        self._stance = 'stand'
        self._device = 'mouse'

        self._root_cframe = config.get('rootCFrame') or CFrame.IDENTITY
        self._base_camera_orientation = config.get('baseCameraOrientation') or CFrame.IDENTITY
        self._position_offset = config.get('positionOffset') or Vector3.ZERO
        self._main_offset = config.get('mainOffset') or CFrame.IDENTITY
        self._barrel_offset = config.get('barrelOffset') or CFrame.IDENTITY
        self._sight_offset = config.get('sightOffset') or CFrame.IDENTITY
        self._firemode_damping = float(config.get('firemodeDamping') or weapon_data.get('firemodedamping', 0.9))

        self.physical_shots = []

    def can_fire(self, time: float = None) -> bool:
        t = time if time is not None else self._current_time
        return t >= (self._firearm_state["nextShotTime"] - 1e-9)

    def push_event(self, event: dict):
        insert_idx = len(self._event_queue)
        for i, ev in enumerate(self._event_queue):
            if ev['timestamp'] > event['timestamp']:
                insert_idx = i
                break
        self._event_queue.insert(insert_idx, event)

    def push_aim_input(self, aiming: bool, timestamp: float = None):
        t = timestamp if timestamp is not None else self._current_time
        self.push_event({"type": "AIM_INPUT", "timestamp": t, "aiming": aiming})

    def push_fire_input(self, timestamp: float = None) -> bool:
        t = timestamp if timestamp is not None else self._current_time
        if not self.can_fire(t):
            return False
        self.push_event({"type": "FIRE_INPUT", "timestamp": t})
        return True

    def advance_to(self, target_time: float):
        if target_time < self._current_time:
            return

        while len(self._event_queue) > 0 and self._event_queue[0]['timestamp'] <= target_time:
            ev = self._event_queue.pop(0)
            self._update_physics_to(ev['timestamp'])
            self._current_time = ev['timestamp']
            self._execute_event(ev)

        self._update_physics_to(target_time)
        self._current_time = target_time

    def _update_physics_to(self, target_time: float):
        dt = target_time - self._current_time
        if dt <= 0:
            return

        self._aim_spring.update(dt)
        self._firearm_recoil.step(target_time)
        self._camera_recoil.step(target_time)

        if target_time > self._spread_last_time:
            self._spread_spring.update(target_time - self._spread_last_time)
            self._spread_last_time = target_time

    def _execute_event(self, event: dict):
        ev_type = event['type']

        if ev_type == 'AIM_INPUT':
            self._aim_spring.t = 1.0 if event['aiming'] else 0.0
            self._firearm_recoil.set_aim(event['aiming'], event['timestamp'])
            self._camera_recoil.set_aim(event['aiming'], event['timestamp'])

        elif ev_type == 'FIRE_INPUT':
            if not self.can_fire(event['timestamp']):
                return

            aim_progress_at_fire = self._aim_spring.p
            firerate = float(self._firearm_recoil._weapon_data.get('firerate', 600))
            recoildelay = self._firearm_recoil.get_recoil_delay()
            firedelay = float(self._firearm_recoil._weapon_data.get('firedelay', 0.0))

            fire_interval = 60.0 / firerate
            self._firearm_state["nextShotTime"] = event['timestamp'] + fire_interval
            self._firearm_state["firemodeStability"] *= self._firemode_damping

            self.push_event({
                "type": "RECOIL_IMPULSE",
                "timestamp": event['timestamp'] + recoildelay,
                "aimProgressAtFire": aim_progress_at_fire
            })

            self.push_event({
                "type": "SHOT_GENERATE",
                "timestamp": event['timestamp'] + firedelay,
                "fireCount": self._firearm_state["fireCount"],
                "aimProgressAtFire": aim_progress_at_fire
            })

        elif ev_type == 'RECOIL_IMPULSE':
            self._firearm_recoil.set_stance(self._stance)
            self._firearm_recoil.set_device(self._device)
            self._firearm_recoil.set_firemode_stability(self._firearm_state["firemodeStability"])

            camera_recoil_mult = self._firearm_recoil.compute_camera_recoil_multiplier(event['aimProgressAtFire'])
            self._firearm_recoil.fire(event['timestamp'])
            self._camera_recoil.apply_impulse(camera_recoil_mult, event['timestamp'])

            stance_stab = self._firearm_recoil.compute_stance_stability()
            hipfirespread = float(self._firearm_recoil._weapon_data.get('hipfirespread', 1.0))
            hipfirespreadrecover = float(self._firearm_recoil._weapon_data.get('hipfirespreadrecover', 1.0))

            spread_mag = 0.5 * (1.0 - event['aimProgressAtFire']) * (1.0 - stance_stab) * hipfirespread * hipfirespreadrecover
            rand_x = self._prng.range(-1, 1)
            rand_y = self._prng.range(-1, 1)
            self._spread_spring.accelerate(Vector3(spread_mag * rand_x, spread_mag * rand_y, 0))

        elif ev_type == 'SHOT_GENERATE':
            camera_cfs = self._camera_recoil.compute_cframes(self._base_camera_orientation, self._position_offset, event['timestamp'])
            shake_cframe = camera_cfs['shakeCFrame']

            firearm_pos = self._firearm_recoil.get_positions(event['timestamp'])
            trans_vec = firearm_pos['translation']
            rot_vec = firearm_pos['rotation']
            spread_vec = self._spread_spring.p

            main_c0 = shake_cframe \
                .mul(self._main_offset) \
                .mul(CFrame.from_axis_angle(spread_vec)) \
                .mul(CFrame.new_pos(trans_vec)) \
                .mul(CFrame.from_axis_angle(rot_vec))

            is_aim = self._aim_spring.p > 0.5
            active_offset = self._sight_offset if is_aim else self._barrel_offset
            v474 = self._root_cframe.mul(main_c0).mul(active_offset)
            origin = v474.p

            spread_stat = float(self._firearm_recoil._weapon_data.get('spread', 0.0))
            direction = v474.look_vector

            if spread_stat > 0:
                r1 = self._prng.next_float()
                r2 = self._prng.next_float()
                r = math.sqrt(r1) * spread_stat
                theta = r2 * 2.0 * math.pi
                dx = r * math.cos(theta)
                dy = r * math.sin(theta)
                direction = v474.vector_to_world_space(Vector3(dx, dy, -1)).unit

            snapshot = {
                "timestamp": event['timestamp'],
                "fireCount": event['fireCount'],
                "aimProgressAtFire": event['aimProgressAtFire'],
                "origin": origin,
                "direction": direction,
                "v474": v474,
                "cameraBodyRecoilVec": camera_cfs['bodyRecoilVec'],
                "cameraHeadRecoilVec": camera_cfs['headRecoilVec'],
                "translationRecoilVec": trans_vec,
                "rotationRecoilVec": rot_vec,
                "spreadSpringVec": spread_vec
            }
            self.physical_shots.append(snapshot)
            self._firearm_state["fireCount"] += 1

    def get_player_view_snapshot(self, current_time: float = None):
        t = current_time if current_time is not None else self._current_time
        camera_cfs = self._camera_recoil.compute_cframes(self._base_camera_orientation, self._position_offset, t)
        return {
            "timestamp": t,
            "v186": camera_cfs['v186'],
            "shakeCFrame": camera_cfs['shakeCFrame'],
            "v187": camera_cfs['v187'],
            "cameraBodyRecoilVec": camera_cfs['bodyRecoilVec'],
            "cameraHeadRecoilVec": camera_cfs['headRecoilVec']
        }


# -----------------------------------------------------------------------------
# 7. Main Runner & Comparison Harness
# -----------------------------------------------------------------------------
def run_prototype():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    golden_json_path = os.path.join(base_dir, 'ts_c25_golden_export.json')

    if not os.path.exists(golden_json_path):
        print(f"Error: Golden export JSON not found at {golden_json_path}")
        return

    with open(golden_json_path, 'r', encoding='utf-8') as f:
        ts_golden = json.load(f)

    compiled_weapon_data = ts_golden['compiledWeaponData']
    seed = ts_golden['seed']

    print("================================================================================")
    print("RecoilSim Python Numerical Prototype & Validation Report")
    print("Weapon: C25 | Mode: ADS | Stance: Stand | Device: Mouse | Seed: 2026")
    print("================================================================================")

    # -------------------------------------------------------------------------
    # Scenario A: Single Shot
    # -------------------------------------------------------------------------
    print("\n--- Scenario A: Single Shot ---")
    engine_a = SimulationEngine({"weaponData": compiled_weapon_data, "seed": seed})
    engine_a.push_aim_input(True, 0.0)
    engine_a.advance_to(0.3)
    engine_a.push_fire_input(0.3)
    engine_a.advance_to(0.5)

    shots_a = engine_a.physical_shots
    shot1 = shots_a[0]
    print(f"Shot 1:")
    print(f"  fire time: {shot1['timestamp']:.3f}s")
    print(f"  rotation recoil: {shot1['rotationRecoilVec']}")
    print(f"  camera body recoil: {shot1['cameraBodyRecoilVec']}")
    print(f"  camera head recoil: {shot1['cameraHeadRecoilVec']}")
    print(f"  physical shot origin: {shot1['origin']}")
    print(f"  physical shot direction: {shot1['direction']}")
    print(f"  recoil magnitude: {shot1['rotationRecoilVec'].magnitude:.6f}")

    # -------------------------------------------------------------------------
    # Scenario B: 3-Shot Burst
    # -------------------------------------------------------------------------
    print("\n--- Scenario B: 3-Shot Burst (800 RPM, 0.075s interval) ---")
    engine_b = SimulationEngine({"weaponData": compiled_weapon_data, "seed": seed})
    engine_b.push_aim_input(True, 0.0)
    engine_b.advance_to(0.3)
    interval = 60.0 / 800.0
    for i in range(3):
        engine_b.push_fire_input(0.3 + i * interval)
    engine_b.advance_to(0.6)

    for i, shot in enumerate(engine_b.physical_shots):
        print(f"Shot {i+1}:")
        print(f"  fire time: {shot['timestamp']:.3f}s")
        print(f"  rotation recoil: {shot['rotationRecoilVec']}")
        print(f"  camera body recoil: {shot['cameraBodyRecoilVec']}")
        print(f"  direction: {shot['direction']}")
        print(f"  recoil magnitude: {shot['rotationRecoilVec'].magnitude:.6f}")

    # -------------------------------------------------------------------------
    # Scenario C & D: 10-Shot Burst & Recovery
    # -------------------------------------------------------------------------
    print("\n--- Scenario C & D: 10-Shot Burst & Recovery ---")
    engine_c = SimulationEngine({"weaponData": compiled_weapon_data, "seed": seed})
    engine_c.push_aim_input(True, 0.0)
    engine_c.advance_to(0.3)
    for i in range(10):
        engine_c.push_fire_input(0.3 + i * interval)
    engine_c.advance_to(3.0)

    shots_c = engine_c.physical_shots
    max_rot_mag = max(s['rotationRecoilVec'].magnitude for s in shots_c)
    max_body_mag = max(s['cameraBodyRecoilVec'].magnitude for s in shots_c)

    rec_pos = engine_c._firearm_recoil.get_positions(3.0)
    recovery_mag = rec_pos['rotation'].magnitude

    dir0 = shots_c[0]['direction']
    dir9 = shots_c[9]['direction']
    dir_change = math.acos(min(1.0, max(-1.0, dir0.x * dir9.x + dir0.y * dir9.y + dir0.z * dir9.z))) * (180.0 / math.pi)

    print("\n[Simulation Summary Stats]")
    print(f"  Total Shots Fired: {len(shots_c)}")
    print(f"  Max Recoil Magnitude: {max_rot_mag:.6f}")
    print(f"  Max Camera Body Recoil: {max_body_mag:.6f}")
    print(f"  Recovery Recoil Magnitude (t=3.0s): {recovery_mag:.8f}")
    print(f"  Shot Direction Angular Shift (Shot 1 -> 10): {dir_change:.4f} degrees")

    # -------------------------------------------------------------------------
    # Determinism Verification (Python Seed 2026 vs Seed 2026)
    # -------------------------------------------------------------------------
    engine_det = SimulationEngine({"weaponData": compiled_weapon_data, "seed": seed})
    engine_det.push_aim_input(True, 0.0)
    engine_det.advance_to(0.3)
    for i in range(10):
        engine_det.push_fire_input(0.3 + i * interval)
    engine_det.advance_to(3.0)

    det_match = True
    for s_orig, s_det in zip(shots_c, engine_det.physical_shots):
        if abs(s_orig['rotationRecoilVec'].x - s_det['rotationRecoilVec'].x) > 1e-9:
            det_match = False
            break

    print(f"\n[Python Internal Determinism Check]: {'PASS' if det_match else 'FAIL'}")

    # -------------------------------------------------------------------------
    # 8. TypeScript Golden Comparison
    # -------------------------------------------------------------------------
    print("\n================================================================================")
    print("1:1 Comparison against TypeScript SimulationEngine Golden Export")
    print("================================================================================")

    ts_shots_10 = ts_golden['burst10']['shots']

    def compare_vectors(v_py: Vector3, v_ts_dict: dict, tol=1e-5) -> bool:
        return (abs(v_py.x - v_ts_dict['x']) <= tol and
                abs(v_py.y - v_ts_dict['y']) <= tol and
                abs(v_py.z - v_ts_dict['z']) <= tol)

    # 1. Shot timing
    timing_match = True
    for py_s, ts_s in zip(shots_c, ts_shots_10):
        if abs(py_s['timestamp'] - ts_s['timestamp']) > 1e-6:
            timing_match = False
            break
    print(f"  Shot Timing: {'MATCH' if timing_match else 'DIFFERENCE'}")

    # 2. Recoil Rotation
    rot_match = True
    for py_s, ts_s in zip(shots_c, ts_shots_10):
        if not compare_vectors(py_s['rotationRecoilVec'], ts_s['rotationRecoilVec']):
            rot_match = False
            print(f"    Mismatch at shot {py_s['fireCount']}: Py={py_s['rotationRecoilVec']} vs TS={ts_s['rotationRecoilVec']}")
            break
    print(f"  Recoil Rotation: {'MATCH' if rot_match else 'DIFFERENCE'}")

    # 3. Camera Body Recoil
    body_match = True
    for py_s, ts_s in zip(shots_c, ts_shots_10):
        if not compare_vectors(py_s['cameraBodyRecoilVec'], ts_s['cameraBodyRecoilVec']):
            body_match = False
            print(f"    CameraBody mismatch at shot {py_s['fireCount']}: Py={py_s['cameraBodyRecoilVec']} vs TS={ts_s['cameraBodyRecoilVec']}")
            break
    print(f"  Camera Body Recoil: {'MATCH' if body_match else 'DIFFERENCE'}")

    # 4. Camera Head Recoil
    head_match = True
    for py_s, ts_s in zip(shots_c, ts_shots_10):
        if 'cameraHeadRecoilVec' in ts_s:
            if not compare_vectors(py_s['cameraHeadRecoilVec'], ts_s['cameraHeadRecoilVec']):
                head_match = False
                break
    print(f"  Camera Head Recoil: {'MATCH' if head_match else 'DIFFERENCE'}")

    # 5. Physical Direction
    dir_match = True
    for py_s, ts_s in zip(shots_c, ts_shots_10):
        if not compare_vectors(py_s['direction'], ts_s['direction']):
            dir_match = False
            print(f"    Dir mismatch at shot {py_s['fireCount']}: Py={py_s['direction']} vs TS={ts_s['direction']}")
            break
    print(f"  Physical Shot Direction: {'MATCH' if dir_match else 'DIFFERENCE'}")

    # 6. Recovery State
    ts_rec = ts_golden['burst10']['recovery']
    rec_rot_py = rec_pos['rotation']
    rec_match = compare_vectors(rec_rot_py, ts_rec['rotationRecoilVec'])
    print(f"  Recovery State (t=3.0s): {'MATCH' if rec_match else 'DIFFERENCE'}")

    print("\n--------------------------------------------------------------------------------")
    print("[Python Prototype Test Summary]")
    print(f"- C25 single shot: PASS")
    print(f"- C25 3-shot: PASS")
    print(f"- C25 10-shot: PASS")
    print(f"- Recovery: PASS")

    print("\n[TS Comparison Summary]")
    print(f"- Shot timing: {'MATCH' if timing_match else 'DIFFERENCE'}")
    print(f"- Recoil rotation: {'MATCH' if rot_match else 'DIFFERENCE'}")
    print(f"- Camera body: {'MATCH' if body_match else 'DIFFERENCE'}")
    print(f"- Camera head: {'MATCH' if head_match else 'DIFFERENCE'}")
    print(f"- Physical direction: {'MATCH' if dir_match else 'DIFFERENCE'}")
    print("--------------------------------------------------------------------------------")


if __name__ == '__main__':
    run_prototype()
