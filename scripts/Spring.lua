local t1 = {}
local sqrt = math.sqrt
local exp = math.exp
local cos = math.cos
local sin = math.sin

local function getPV(p1, p2, p3, p4, p5, p6, p7) -- line: 8
	-- upvalues: sqrt (copy), exp (copy), cos (copy), sin (copy)
	if p2 == 0 then
		return p4 + (p7 - p3) * p5, p5
	end

	local v14 = p2 * (p7 - p3)
	local v15 = p1 * p1
	local v16, v18, v19

	if v15 < 1 then
		v16 = sqrt(1 - v15)

		local v17 = exp(-p1 * v14) / v16

		v18 = v17 * cos(v16 * v14)
		v19 = v17 * sin(v16 * v14)
	elseif v15 == 1 then
		v16 = 1
		v18 = exp(-p1 * v14) / v16
		v19 = v18 * v14
	else
		v16 = sqrt(v15 - 1)

		local v20 = exp((-p1 + v16) * v14) / (2 * v16)
		local v21 = exp((-p1 - v16) * v14) / (2 * v16)

		v18 = v20 + v21
		v19 = v20 - v21
	end

	local v22 = v16 * v18 + p1 * v19
	local v23 = 1 - (v16 * v18 + p1 * v19)
	local v24 = v19 / p2
	local v25 = -p2 * v19
	local v26 = p2 * v19
	local v27 = v16 * v18 - p1 * v19

	return v22 * p4 + v23 * p6 + v24 * p5, v25 * p4 + v26 * p6 + v27 * p5
end

function t1.new(p8, p9, p10) -- line: 47
	-- upvalues: t1 (copy)
	return (setmetatable({
		_d = p9 or 1,
		_s = p10 or 1,
		_t0 = os.clock(),
		_p0 = p8 or 0,
		_v0 = 0 * (p8 or 0),
		_p1 = p8 or 0
	}, t1))
end
function t1.init(p11, p12, p13, p14) -- line: 60
	p11._t0 = os.clock()
	p11._p0 = p12 or 0 * p11._p0
	p11._v0 = p13 or 0 * p11._v0
	p11._p1 = p14 or (p12 or 0 * p11._p1)
end
function t1.update(p15, p16, p17, p18, p19, p20) -- line: 67
	-- upvalues: getPV (copy)
	local elapsed = os.clock()
	local v42, v43 = getPV(p15._d, p15._s, p15._t0, p15._p0, p15._v0, p15._p1, elapsed)

	p15._t0 = elapsed
	p15._p0 = p17 or v42
	p15._v0 = p18 or v43
	p15._p1 = p16 or p15._p1
	p15._d = p19 or p15._d
	p15._s = p20 or p15._s

	return v42, v43
end
function t1.accelerate(p21, p22) -- line: 79
	-- upvalues: getPV (copy)
	local elapsed = os.clock()
	local v47, v48 = getPV(p21._d, p21._s, p21._t0, p21._p0, p21._v0, p21._p1, elapsed)

	p21._t0 = elapsed
	p21._p0 = v47
	p21._v0 = v48 + p22
end
function t1.__index(p23, p24) -- line: 87
	-- upvalues: getPV (copy), t1 (copy)
	local elapsed = os.clock()

	if p24 == "p" then
		local v52, _ = getPV(p23._d, p23._s, p23._t0, p23._p0, p23._v0, p23._p1, elapsed)

		return v52
	end

	if p24 == "v" then
		local _, v55 = getPV(p23._d, p23._s, p23._t0, p23._p0, p23._v0, p23._p1, elapsed)

		return v55
	end

	if p24 == "t" then
		return p23._p1
	end

	if p24 == "d" then
		return p23._d
	end

	if p24 == "s" then
		return p23._s
	end

	if p24 == "a" then
		local v56, v57 = getPV(p23._d, p23._s, p23._t0, p23._p0, p23._v0, p23._p1, elapsed)

		return p23._s * p23._s * (p23._p1 - v56) - 2 * p23._s * p23._d * v57
	end

	return (rawget(t1, p24))
end
function t1.__newindex(p25, p26, p27) -- line: 110
	-- upvalues: getPV (copy)
	if p27 ~= p27 then
		return
	end

	local elapsed = os.clock()
	local v62, v63 = getPV(p25._d, p25._s, p25._t0, p25._p0, p25._v0, p25._p1, elapsed)

	p25._p0 = v62
	p25._v0 = v63
	p25._t0 = elapsed

	if p26 == "p" then
		p25._p0 = p27

		return
	end

	if p26 == "v" then
		p25._v0 = p27

		return
	end

	if p26 == "t" then
		p25._p1 = p27

		return
	end

	if p26 == "d" then
		p25._d = p27

		return
	end

	if p26 == "s" then
		p25._s = p27

		return
	end

	if p26 == "a" then
		p25._v0 = p25._v0 + p27
	end
end

return t1

