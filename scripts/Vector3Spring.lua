local _ = math.sqrt
local _ = math.exp
local _ = math.cos
local _ = math.sin
local v5 = shared.require("GameClock")

local function getPV(p1, p2, p3, p4, p5, p6) -- line: 8
	if p2 == 0 then
		return p3 + p6 * p4, p4
	end

	local v15 = p2 * p6
	local v16 = p1 * p1
	local v17, v19, v20

	if v16 < 1 then
		v17 = math.sqrt(1 - v16)

		local v18 = math.exp(-p1 * v15) / v17

		v19 = v18 * math.cos(v17 * v15)
		v20 = v18 * math.sin(v17 * v15)
	elseif v16 == 1 then
		v17 = 1
		v19 = math.exp(-p1 * v15) / v17
		v20 = v19 * v15
	else
		v17 = math.sqrt(v16 - 1)

		local v21 = math.exp((-p1 + v17) * v15) / (2 * v17)
		local v22 = math.exp((-p1 - v17) * v15) / (2 * v17)

		v19 = v21 + v22
		v20 = v21 - v22
	end

	local v23 = v17 * v19 + p1 * v20
	local v24 = v20 / p2
	local v25 = -p2 * v20
	local v26 = v17 * v19 - p1 * v20
	local v27 = p3 - p5

	return v23 * v27 + v24 * p4 + p5, v25 * v27 + v26 * p4
end
local function getPV3(p7, p8, p9, p10, p11, p12) -- line: 47
	-- upvalues: getPV (copy)
	local v34, v35 = getPV(p7.x, p8.x, p9.x, p10.x, p11.x, p12)
	local v36, v37 = getPV(p7.y, p8.y, p9.y, p10.y, p11.y, p12)
	local v38, v39 = getPV(p7.z, p8.z, p9.z, p10.z, p11.z, p12)

	return Vector3.new(v34, v36, v38), (Vector3.new(v35, v37, v39))
end

local t1 = {}

function t1.new(p13, p14, p15) -- line: 57
	-- upvalues: v5 (copy), t1 (copy)
	local t2 = {
		_d = p14 or Vector3.new(1, 1, 1),
		_s = p15 or Vector3.new(1, 1, 1),
		_p0 = p13 or Vector3.new(0, 0, 0),
		_v0 = Vector3.new(0, 0, 0)
	}

	t2._p1 = t2._p0
	t2._clock = v5
	t2._t0 = t2._clock:getTime()

	return (setmetatable(t2, t1))
end
function t1.__index(p16, p17) -- line: 72
	-- upvalues: getPV3 (copy), t1 (copy)
	local v46 = p16._clock:getTime()

	if v46 ~= p16._t0 then
		local v47, v48 = getPV3(p16._d, p16._s, p16._p0, p16._v0, p16._p1, v46 - p16._t0)

		p16._p0 = v47
		p16._v0 = v48
		p16._t0 = v46
	end

	if p17 == "p" then
		return p16._p0
	end

	if p17 == "v" then
		return p16._v0
	end

	if p17 == "t" then
		return p16._p1
	end

	if p17 == "d" then
		return p16._d
	end

	if p17 == "s" then
		return p16._s
	end

	if p17 == "a" then
		return p16._s * p16._s * (p16._p1 - p16._p0) - 2 * p16._s * p16._d * p16._v0
	end

	return t1[p17]
end
function t1.__newindex(p18, p19, p20) -- line: 99
	-- upvalues: getPV3 (copy)
	if p20 ~= p20 then
		return
	end

	local v52 = p18._clock:getTime()

	if v52 ~= p18._t0 then
		local v53, v54 = getPV3(p18._d, p18._s, p18._p0, p18._v0, p18._p1, v52 - p18._t0)

		p18._p0 = v53
		p18._v0 = v54
		p18._t0 = v52
	end

	if p19 == "p" then
		p18._p0 = p20

		return
	end

	if p19 == "v" then
		p18._v0 = p20

		return
	end

	if p19 == "t" then
		p18._p1 = p20

		return
	end

	if p19 == "d" then
		p18._d = p20

		return
	end

	if p19 == "s" then
		p18._s = p20

		return
	end

	if p19 == "a" then
		p18._v0 = p18._v0 + p20
	end
end

return t1

