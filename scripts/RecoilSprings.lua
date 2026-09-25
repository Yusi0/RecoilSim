local t1 = {}

t1.__index = t1

local v2 = shared.require("Vector3Spring")
local v3 = shared.require("GameClock")
local t2 = {
	x = Vector3.new(1, 0, 0),
	y = Vector3.new(0, 1, 0),
	z = Vector3.new(0, 0, 1)
}

function t1.new(p1, p2, p3, p4) -- line: 13
	-- upvalues: t1 (copy)
	local self = setmetatable({}, t1)

	self._hipParameters = p1
	self._aimParameters = p2
	self._hipRecoveryParameters = p3
	self._aimRecoveryParameters = p4
	self._lastImpulseTime = 0
	self._lastAimState = false
	self._vector3Springs = {}
	self:setVectorParameters(p1)

	return self
end
function t1.getP(p5) -- line: 33
	local vector3 = Vector3.new(0, 0, 0)

	for _, v13 in p5._vector3Springs do
		vector3 += v13.p
	end

	return vector3
end
function t1.getUniformDist(_, p7, p8) -- line: 47
	return p8 * 2 * math.random() - p8 + p7
end
function t1.applyImpulse(p9, p10, p11) -- line: 51
	-- upvalues: t2 (copy), v3 (copy)
	local v20 = p10 or CFrame.identity
	local v21 = p11 or 1
	local v22 = p9:setAim(p9._lastAimState)

	for v23, v24 in p9._vector3Springs do
		local vector3 = Vector3.new(0, 0, 0)

		for v26, v27 in t2 do
			local v28 = v22[v26]

			if v28 then
				local v29 = v28[v23]

				if v29 then
					vector3 += p9:getUniformDist(v29[3], v29[4]) * v27
				end
			end
		end

		v24.v = v24.v + v20 * vector3 * v21
	end

	p9._lastImpulseTime = v3.getTime()
end
function t1.setSingleAxisParameters(p12, p13, p14) -- line: 80
	-- upvalues: t2 (copy)
	local v33 = t2[p14]

	for v34, v35 in p12._vector3Springs do
		local v36 = p13[p14]

		if v36 then
			local v37 = v36[v34]

			if v37 then
				v35.d = v35.d * (Vector3.new(1, 1, 1) - v33) + v37[1] * v33
				v35.s = v35.s * (Vector3.new(1, 1, 1) - v33) + v37[2] * v33
			end
		end
	end
end
function t1.setVectorParameters(p15, p16) -- line: 98
	-- upvalues: t2 (copy), v2 (copy)
	for v40, _ in t2 do
		for v42, _ in p16[v40] do
			if not p15._vector3Springs[v42] then
				p15._vector3Springs[v42] = v2.new()
			end
		end
	end

	for i = 1, #p15._vector3Springs do
		local v45 = p15._vector3Springs[i]
		local d = v45.d
		local s = v45.s

		for v48, v49 in t2 do
			local v50 = p16[v48]

			if v50 then
				local v51 = v50[i]

				if v51 then
					d = d * (Vector3.new(1, 1, 1) - v49) + v51[1] * v49
					s = s * (Vector3.new(1, 1, 1) - v49) + v51[2] * v49
				end
			end
		end

		v45.d = d
		v45.s = s
	end
end
function t1.setAim(p17, p18) -- line: 136
	local v54 = p18 and p17._aimParameters or p17._hipParameters

	p17._lastAimState = p18
	p17:setVectorParameters(v54)

	return v54
end
function t1.step(p19) -- line: 143
	-- upvalues: v3 (copy)
	local v56 = p19._lastAimState and p19._aimRecoveryParameters or p19._hipRecoveryParameters

	if not v56 then
		return
	end

	for v57, v58 in v56 do
		if p19._lastImpulseTime + v58.delay < v3.getTime() then
			p19:setSingleAxisParameters(v56, v57)
		end
	end
end

return t1

