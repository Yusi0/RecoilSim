-- ClientModules.Camera.Types.MainCamera.MainCameraObject.Lua

local t1 = {}

t1.__index = t1

local v2 = shared.require("TouchControllerInterface")
local v3 = shared.require("PlayerSettingsInterface")
local v4 = shared.require("PlayerSettingsEvents")
local u5 = nil
local v6 = shared.require("TemporalSmoother")
local v7 = shared.require("InputInterface")
local v8 = shared.require("RecoilSprings")
local v9 = shared.require("GyroInterface")
local v10 = shared.require("InputEvents")
local v11 = shared.require("CameraUtils")
local v12 = shared.require("Destructor")
local v13 = shared.require("AimAssist")
local v14 = shared.require("VectorLib")
local v15 = shared.require("CFrameLib")
local v16 = shared.require("Raycast")
local v17 = shared.require("Spring")
local v18 = game:GetService("RunService"):IsStudio()
local _ = game:GetService("Players").LocalPlayer
local raycastParams = RaycastParams.new()

raycastParams.IgnoreWater = true
raycastParams.IncludeInstances = { workspace.Map }

local t2 = { workspace:WaitForChild("Ignore") }

local function visibilityCheck(p1, p2) -- line: 35
	-- upvalues: t2 (copy)
	local raycastParams2 = RaycastParams.new()

	raycastParams2.IgnoreWater = true
	raycastParams2.ExcludeInstances = t2

	local n1 = 1

	for _ = 1, 10 do
		local raycastResult = workspace:Raycast(p1, p2 - p1, raycastParams2)

		if not raycastResult or (raycastResult.Position - p2).Magnitude < 1 then
			return true
		end

		local Instance = raycastResult.Instance

		n1 *= Instance.Transparency

		if n1 < 0.2 then
			return false
		end

		p1 = raycastResult.Position
		raycastParams2:AddToFilter(Instance)
	end

	return false
end

local t3 = {}
local t4 = {
	x = {},
	y = {},
	z = {}
}

function t1.new(p3) -- line: 86
	-- upvalues: t1 (copy), v12 (copy), v3 (copy), v17 (copy), v8 (copy), t4 (copy), v6 (copy), v13 (copy), v9 (copy), v10 (copy), t3 (copy), v2 (copy), v4 (copy)
	local self = setmetatable({}, t1)

	self._destructor = v12.new()
	self._currentCamera = workspace.CurrentCamera
	self._baseFov = 80
	self._maxAngle = 1.5609788497524284
	self._minAngle = -1.5609788497524284
	self._cframe = CFrame.identity
	self._angles = Vector3.new(0, 0, 0)
	self._lookVector = Vector3.new(0, 0, -1)
	self._lookDt = 0.016666666666666666
	self._swayT = 0
	self._offset = Vector3.new(0, 1.5, 0)
	self._baseCFrame = CFrame.identity
	self._shakeCFrame = CFrame.identity
	self._xInvert = not v3.getValue("toggleinvertyaxis") and 1 or -1
	self._didChange = false
	self._directLook = false
	self._gyroAiming = false
	self._gyroInvertYAxis = v3.getValue("gyroinvertyaxis")
	self._directLookEnabled = v3.getValue("toggledirectangularinput")
	self._curveDecelRate = v3.getValue("controllercurvedecel")
	self._lastDeathCFrame = nil
	self._prevControllerDelta = Vector3.new(0, 0, 0)
	self._controllerUsed = false
	self._controllerSpeed = 0
	self._sensitivityMult = 1
	self._controllerAimMult = 1
	self._magSpring = v17.new(0)
	self._magSpring.s = 12
	self._magSpring.d = 1
	self._swaySpring = v17.new(0)
	self._swaySpring.s = 4
	self._swaySpring.d = 1
	self._swaySpeed = v17.new(0)
	self._swaySpeed.s = 6
	self._swaySpeed.d = 1
	self._swaySpeed.t = 1
	self._cameraHeadSprings = v8.new(t4, t4)
	self._cameraBodySprings = v8.new(t4, t4)
	self._zAngleSpring = v17.new(0)
	self._zAngleSpring.s = 8
	self._offsetSpring = v17.new((Vector3.new(0, 0, 0)))
	self._offsetSpring.s = 16
	self._suppressionSpring = v17.new((Vector3.new(0, 0, 0)))
	self._suppressionSpring.s = 32
	self._suppressionSpring.d = 0.65
	self._damageSpring = v17.new((Vector3.new(0, 0, 0)))
	self._damageSpring.s = 20
	self._damageSpring.d = 0.75
	self._accelSpring = v17.new((Vector3.new(0, 0, 0)))
	self._accelSpring.s = 10
	self._accelSpring.d = 0.8
	self._publicSprings = {
		suppressionspring = self._suppressionSpring,
		zanglespring = self._zAngleSpring,
		offsetspring = self._offsetSpring,
		damagespring = self._damageSpring,
		accelSpring = self._accelSpring,
		swayspring = self._swaySpring,
		magspring = self._magSpring,
		swayspeed = self._swaySpeed
	}
	self._gyroAimMult = 1
	self._gyroTemporalSmoother = v6.new(30, CFrame.new().Lerp)
	self._oldDeviceRotation = nil
	self._aimAssist = v13.new()
	self._touchAssistInputStrength = 0
	self._touchAssistFollowStrength = 0
	self._controllerAssistInputStrength = 0
	self._controllerAssistFollowStrength = 0
	self._destructor:add(v9.rotationChanged:connect(function(p4, _) -- line: 192
		-- upvalues: self (copy)
		self._gyroTemporalSmoother:addSample(os.clock(), p4)
	end))
	self._destructor:add(v10.onMouseMove:connect(function(p6) -- line: 196
		-- upvalues: self (copy), t3 (copy)
		self._didChange = true

		local v202 = t3.sensitivity * self._sensitivityMult / 144
		local v203 = math.max(1, 2.718281828459045 ^ self._magSpring.p)
		local vector3

		if self._directLookEnabled and self._directLook then
			local v204 = v202 / v203

			vector3 = Vector3.new(-v204 * p6.y * self._xInvert, -v204 * p6.x, 0)
		else
			local v206 = math.cos(self._angles.x)
			local v207 = math.sin(self._angles.x)
			local v208 = v202 / math.sqrt((v203 * v206) ^ 2 + v207 ^ 2)

			vector3 = Vector3.new(-(v202 / v203) * p6.y * self._xInvert, -v208 * p6.x, 0)
		end

		self:_applyLookDelta(vector3)
	end))

	local v36 = v2.getTouchController()

	self._destructor:add(v36.output:connect(function(p7, p8, ...) -- line: 220
		-- upvalues: self (copy), t3 (copy)
		if p7:getActionType() ~= "look" then
			return
		end

		if p8 ~= "delta" then
			return
		end

		local v211 = ...

		self._didChange = true

		local v212 = math.max(1, 2.718281828459045 ^ self._magSpring.p)
		local v213 = t3.touchSensitivity * self._touchAimMult / 72
		local vector3

		if self._directLookEnabled and self._directLook then
			local v214 = v213 / v212

			vector3 = Vector3.new(-v214 * v211.y * self._xInvert, -v214 * v211.x, 0)
		else
			local v216 = math.cos(self._angles.x)
			local v217 = math.sin(self._angles.x)
			local v218 = v213 / math.sqrt((v212 * v216) ^ 2 + v217 ^ 2)

			vector3 = Vector3.new(-(v213 / v212) * v211.y * self._xInvert, -v218 * v211.x, 0)
		end

		self:_applyLookDelta(vector3)
	end))
	self._destructor:add(v10.onControllerIntegralMove:connect(function(p9, p10) -- line: 299
		-- upvalues: self (copy), t3 (copy)
		if p9 ~= Vector3.new(0, 0, 0) then
			self._controllerUsed = true
			self._didChange = true
		end

		local v221 = p9.magnitude ^ (t3.controllerSenspower - 1) * p9
		local v222 = 15 * p10 * t3.controllerSens * self._controllerAimMult * math.atan(math.tan(self._baseFov * 0.017453292519943295 / 2) / 2.718281828459045 ^ self._magSpring.p)
		local v223 = math.abs((math.atan2(self._prevControllerDelta:Cross(v221).z, (self._prevControllerDelta:Dot(v221)))))
		local magnitude = self._prevControllerDelta.magnitude
		local magnitude2 = v221.magnitude
		local v226

		if v223 * self._curveDecelRate == 0 then
			v226 = magnitude + p10 * magnitude2 * self._controllerAccel
		else
			local v227 = p10 * magnitude2 * self._controllerAccel / (v223 * self._curveDecelRate)

			v226 = v227 + math.exp(-v223 * self._curveDecelRate) * (magnitude - v227)
		end

		if magnitude2 == 0 then
			self._prevControllerDelta = Vector3.new(0, 0, 0)
		elseif v226 < 0 then
			self._prevControllerDelta = Vector3.new(0, 0, 0)
		elseif v226 < v221.magnitude then
			self._prevControllerDelta = v226 * v221.unit
		else
			self._prevControllerDelta = v221
		end

		local vector3 = Vector3.new(t3.controlleryMult * v222 * self._prevControllerDelta.y * self._xInvert, -v222 * self._prevControllerDelta.x, 0)

		self:_applyLookDelta(vector3)
	end))
	self._destructor:add(v4.onSettingChanged:connect(function(p11, p12) -- line: 336
		-- upvalues: self (copy)
		print(`setting { p11 }, { p12 }`)

		if p11 == "toggleinvertyaxis" then
			self._xInvert = not p12 and 1 or -1

			return
		end

		if p11 == "toggledirectangularinput" then
			self._directLookEnabled = p12

			return
		end

		if p11 == "controllercurvedecel" then
			self._curveDecelRate = p12

			return
		end

		if p11 == "gyroinvertyaxis" then
			self._gyroInvertYAxis = p12
		end
	end))
	self._currentCamera.FieldOfView = self._baseFov

	if p3 then
		self._currentCamera.CameraSubject = p3.cameraSubject

		if p3.direction then
			self:setLookVector(p3.direction)
		end
	end

	self._currentCamera.CameraType = "Scriptable"

	return self
end
function t1.Destroy(p13) -- line: 365
	p13._destructor:Destroy()
end
function t1.updateAimAssistPointTarget(p14, p15, p16, p17, p18, p19) -- line: 370
	p14._aimAssist:updatePointTarget(p15, p16, p17, p18, p19)
end
function t1.updateAimAssistLineTarget(p20, p21, p22, p23, p24, p25, p26) -- line: 375
	p20._aimAssist:updateLineTarget(p21, p22, p23, p24, p25, p26)
end
function t1.setAimAssistProjectileVelocity(p27, p28) -- line: 379
	p27._projectileVelocity = p28
end
function t1.setAimAssistProjectileGravity(p29, p30) -- line: 383
	p29._projectileGravity = p30
end
function t1.getAngles(p31) -- line: 387
	return p31._angles
end
function t1.getCFrame(p32) -- line: 391
	return p32._cframe
end
function t1.getLookVector(p33) -- line: 395
	return p33._lookVector
end
function t1.getBaseCFrame(p34) -- line: 399
	return p34._baseCFrame
end
function t1.getShakeCFrame(p35) -- line: 403
	return p35._shakeCFrame
end
function t1.getBaseFov(p36) -- line: 407
	return p36._baseFov
end
function t1.getSpring(p37, p38) -- line: 411
	return p37._publicSprings[p38]
end
function t1.applyImpulse(p39, p40) -- line: 416
	p39._cameraHeadSprings:applyImpulse(nil, p40)
	p39._cameraBodySprings:applyImpulse(nil, p40)
end
function t1.setBodyParameters(p41, p42, p43, p44, p45) -- line: 422
	-- upvalues: v8 (copy)
	p41._cameraBodySprings = v8.new(p42, p43, p44, p45)
end
function t1.setHeadParameters(p46, p47, p48, p49, p50) -- line: 426
	-- upvalues: v8 (copy)
	p46._cameraHeadSprings = v8.new(p47, p48, p49, p50)
end
function t1.setAim(p51, p52) -- line: 430
	p51._cameraHeadSprings:setAim(p52)
	p51._cameraBodySprings:setAim(p52)
end
function t1.magnify(p53, p54) -- line: 435
	p53._magSpring.t = math.log(p54)
end
function t1.hit(p55, p56) -- line: 439
	local v81 = p55._cframe:VectorToObjectSpace(p56)

	p55._damageSpring.a = Vector3.new(v81.z, 0, -v81.x) * 0.25
end
function t1.setMagnification(p57, p58) -- line: 446
	local v84 = math.log(p58)

	p57._magSpring.p = v84
	p57._magSpring.t = v84
	p57._magSpring.v = 0
end
function t1.setAimSensitivity(p59, p60) -- line: 453
	-- upvalues: t3 (copy), v3 (copy)
	p59._sensitivityMult = p60 and t3.aimSensitivity or 1
	p59._controllerAimMult = p60 and t3.controllerAimSens or 1
	p59._gyroAimMult = p60 and t3.gyroAimSensitivity or 1
	p59._touchAimMult = p60 and t3.touchAimSensitivity or 1
	p59._touchAssistInputStrength = p60 and v3.getValue("touchassistinputstrength") or v3.getValue("touchassistinputstrengthhip")
	p59._touchAssistFollowStrength = p60 and v3.getValue("touchassistfollowstrength") or v3.getValue("touchassistfollowstrengthhip")
	p59._controllerAssistInputStrength = p60 and v3.getValue("controllerassistinputstrength") or v3.getValue("controllerassistinputstrengthhip")
	p59._controllerAssistFollowStrength = p60 and v3.getValue("controllerassistfollowstrength") or v3.getValue("controllerassistfollowstrengthhip")
	p59._controllerAccel = p60 and t3.controllerAimAccel or t3.controllerAccel
end
function t1.setMagnificationSpeed(p61, p62) -- line: 476
	p61._magSpring.s = p62
end
function t1.setSwaySpeed(p63, p64) -- line: 480
	p63._swaySpeed.t = p64 or 1
end
function t1.setSway(p65, p66) -- line: 484
	p65._swaySpring.t = p66
end
function t1.setGyroAim(p67, p68) -- line: 488
	p67._gyroAiming = p68
end
function t1.setSuppression(p69, p70) -- line: 492
	p69._suppressionSpring.a = p70
end
function t1.setControllerAimMult(p71, p72) -- line: 496
	p71._controllerAimMult = p72
end
function t1.setDirectLookMode(p73, p74) -- line: 500
	if p74 == p73._directLook then
		return
	end

	p73._directLook = p74

	if not p74 then
		p73._offsetSpring.t = Vector3.new(0, 0, 0)
	end
end
function t1.setLookVector(p75, p76) -- line: 511
	-- upvalues: v14 (copy)
	p75._didChange = true

	local v103, v104 = v14.toanglesyx(p76)
	local y = p75._angles.y

	p75._angles = Vector3.new(v103 > p75._maxAngle and p75._maxAngle or (v103 < p75._minAngle and p75._minAngle or v103), (v104 + 3.141592653589793 - y) % 6.283185307179586 - 3.141592653589793 + y, 0)
end
function t1._stepAimAssist(p77, p78) -- line: 523
	-- upvalues: v18 (copy), v7 (copy), u5 (ref), visibilityCheck (copy), v15 (copy), v11 (copy)
	if not v18 and v7.usingMouseAndKeyboard() then
		p77._aimAssist:step()

		return
	end

	local v108 = if not v7.isLastActiveDevice("mobile") then if not v7.isLastActiveDevice("controller") then p77._touchAssistFollowStrength else p77._controllerAssistFollowStrength else p77._touchAssistFollowStrength
	local v109 = u5.getCharacterObject()

	if not v109 then
		p77._aimAssist:step()

		return
	end

	local CFrame2 = v109:getRootPart().CFrame
	local vector3 = Vector3.new(0, v109._headheightspring.p, 0)
	local _cframe = p77._cframe
	local p = _cframe.p
	local v114 = CFrame2 * vector3
	local LookVector = _cframe.LookVector
	local v116, v117 = p77._aimAssist:getNextLookVector(p, v114, LookVector, p77._projectileVelocity or 2000, p77._projectileGravity or Vector3.new(0, 0, 0), visibilityCheck)

	if v116 then
		local v118 = v108 * v117
		local v119 = LookVector:Cross(v116)
		local v120 = LookVector:Dot(v116)
		local v121 = math.atan2(v119.Magnitude, v120)
		local v122 = 1 * p78
		local v123 = math.min(v122, v118 * v121)

		if v119.Magnitude < 1E-06 then
			v119 = Vector3.new(1, 0, 0)
		end

		local cFrame = CFrame.fromAxisAngle(v119, v123)

		if p77._directLookEnabled and p77._directLook then
			local v125 = cFrame * (CFrame.Angles(0, p77._angles.y, 0) * CFrame.Angles(p77._angles.x, 0, 0) * v15.fromAxisAngle(p77._offsetSpring.p))
			local v126, v127 = v11.limitAnglesYX(v125, p77._minAngle, p77._maxAngle)
			local v128 = v11.getClosestAngle(p77._angles.y, v127)

			p77._angles = Vector3.new(v126, v128, 0)

			local v129 = v11.getOffsetAxisAngle(CFrame.Angles(0, v128, 0) * CFrame.Angles(v126, 0, 0), v125)

			p77._offsetSpring.p = v129
			p77._offsetSpring.t = v129
		else
			local v130, v131 = (cFrame * (CFrame.Angles(0, p77._angles.y, 0) * CFrame.Angles(p77._angles.x, 0, 0))):ToEulerAnglesYXZ()
			local v132 = v11.getClosestAngle(p77._angles.y, v131)
			local _angles = p77._angles
			local v134 = Vector3.new(v130, v132) - _angles

			if v122 < v134.Magnitude then
				v134 = v122 * v134.Unit
			end

			p77._angles = _angles + v134
		end
	end

	p77._aimAssist:step()
end

local function getAnglesAboutAB(p79, p80, p81) -- line: 610
	local v138 = p79:VectorToObjectSpace(p80)
	local v139 = p79:VectorToWorldSpace(p81)
	local v140 = p80:Cross(p81)
	local v141 = v140:Dot(v139) * p80.magnitude
	local v142 = v140:Dot(p80:Cross(v139))
	local v143 = v140:Dot(v138) * p81.magnitude
	local v144 = v140:Dot(v138:Cross(p81))

	return math.atan2(v141, v142), (math.atan2(v143, v144))
end

function t1._stepGyro(p82) -- line: 626
	-- upvalues: v2 (copy), t3 (copy), v11 (copy), v3 (copy), getAnglesAboutAB (copy)
	local _oldDeviceRotation = p82._oldDeviceRotation
	local v147 = p82._gyroTemporalSmoother:getSample(os.clock())

	p82._oldDeviceRotation = v147

	if not _oldDeviceRotation or not v147 then
		return
	end

	if not v2.isGyroEnabled() then
		return
	end

	local v148 = t3.gyroSensitivity * p82._gyroAimMult
	local v149 = math.max(1, 2.718281828459045 ^ p82._magSpring.p)
	local v150 = math.cos(p82._angles.X)
	local v151 = math.sin(p82._angles.X)
	local v152 = (not p82._gyroInvertYAxis and 1 or -1) * t3.gyroVerticalMult
	local v153 = v148 / math.sqrt((v149 * v150) ^ 2 + v151 ^ 2)
	local v154 = v148 * v152 / v149

	if p82._directLookEnabled and p82._directLook then
		local v155 = v11.getOffsetAxisAngle(_oldDeviceRotation, v147)

		p82:_applyLookDelta(Vector3.new(v148 / v149, v148 / v149, 1) * v155)

		return
	end

	if v3.getValue("gyroglobalmode") then
		local v156, v157 = getAnglesAboutAB(_oldDeviceRotation, Vector3.new(0, 1, 0), (Vector3.new(1, 0, 0)))
		local v158, v159 = getAnglesAboutAB(v147, Vector3.new(0, 1, 0), (Vector3.new(1, 0, 0)))
		local v160 = (v159 - v157 + 3.141592653589793) % 6.283185307179586 - 3.141592653589793
		local v161 = (v158 - v156 + 3.141592653589793) % 6.283185307179586 - 3.141592653589793

		p82:_applyLookDelta((Vector3.new(v154 * v160, v153 * v161, 0)))

		return
	end

	local v162 = _oldDeviceRotation:ToObjectSpace(v147)
	local cFrame = CFrame.fromEulerAnglesYXZ(p82._angles.X, p82._angles.Y, 0)
	local v164 = cFrame * v162
	local v165, v166 = getAnglesAboutAB(cFrame, Vector3.new(0, 1, 0), (Vector3.new(1, 0, 0)))
	local v167, v168 = getAnglesAboutAB(v164, Vector3.new(0, 1, 0), (Vector3.new(1, 0, 0)))
	local v169 = (v168 - v166 + 3.141592653589793) % 6.283185307179586 - 3.141592653589793
	local v170 = (v167 - v165 + 3.141592653589793) % 6.283185307179586 - 3.141592653589793

	p82:_applyLookDelta((Vector3.new(v154 * v169, v153 * v170, 0)))
end

local t5 = {
	workspace.Ignore,
	workspace.CurrentCamera,
	workspace.Terrain,
	workspace.Roots
}

function t1.step(p83, p84) -- line: 685
	-- upvalues: u5 (ref), v16 (copy), t5 (copy), v15 (copy)
	p83:_stepAimAssist(p84)
	p83:_stepGyro()
	p83._lookDt = p84

	if p83._didChange then
		p83._didChange = false
	end

	if p83._controllerUsed then
		p83._controllerUsed = false
	else
		p83._controllerSpeed = 0
	end

	if not u5.isAlive() then
		return
	end

	local v173 = u5.getCharacterObject()

	if not v173 then
		return
	end

	local CFrame3 = v173:getRootPart().CFrame
	local p = v173._headheightspring.p
	local vector3 = Vector3.new(0, p, 0)
	local p2 = v173:getTorso().CFrame.p
	local v178 = CFrame3.p + Vector3.new(0, p, 0) - p2
	local v179 = (v178.magnitude + 0.2) * v178.unit
	local v180 = v16.raycast(p2, v179, t5, function(p85) -- line: 721
		if not p85.CanCollide then
			return true
		end

		return false
	end, false)

	if v180 then
		vector3 = p2 + (v180.Distance - 0.2) * v178.unit - CFrame3.p
	end

	p83._accelSpring.t = v173._acceleration
	p83._swayT = p83._swayT + p84 * p83._swaySpeed.p

	local _swayT = p83._swayT
	local v182 = 0.5 * v173._speed
	local v183 = v173._distance * 6.283185307179586 / 4 * 3 / 4
	local p3 = p83._swaySpring.p
	local v185 = CFrame.Angles(0, p83._angles.y, 0) * CFrame.Angles(p83._angles.x, 0, 0) * v15.fromAxisAngle(p83._offsetSpring.p) * CFrame.Angles(0, 0, p83._zAngleSpring.p)

	p83._baseCFrame = v185 + CFrame3 * vector3

	local v186 = v185 * v15.fromAxisAngle(p83._cameraBodySprings:getP()) * v15.fromAxisAngle(v182 * math.cos(v183 + 2) / 2048, v182 * math.cos(v183 / 2) / 2048, v182 * math.cos(v183 / 2 + 2) / 4096) * v15.fromAxisAngle(p3 * math.cos(2 * _swayT + 2) / 2048, p3 * math.cos(2 * _swayT / 2) / 2048, p3 * math.cos(2 * _swayT / 2 - 2) / 4096)
	local v187 = v186 * v15.fromAxisAngle(p83._cameraHeadSprings:getP()) * v15.fromAxisAngle(Vector3.new(0, 0, 1):Cross(p83._accelSpring.v / 4096 / 16) * Vector3.new(1, 0, 0)) * v15.fromAxisAngle(p83._suppressionSpring.p + p83._damageSpring.p) + CFrame3 * vector3
	local v188 = math.atan(math.tan(p83._baseFov * 0.017453292519943295 / 2) / 2.718281828459045 ^ p83._magSpring.p) * 2 / 0.017453292519943295

	p83._currentCamera.FieldOfView = v188
	p83._currentCamera.CFrame = v187
	p83._shakeCFrame = v186 + CFrame3 * vector3
	p83._cframe = v187
	p83._lookVector = v187.lookVector
	p83._cameraHeadSprings:step()
	p83._cameraBodySprings:step()
end
function t1._applyLookDelta(p86, p87) -- line: 773
	-- upvalues: v18 (copy), v7 (copy), v15 (copy), v11 (copy)
	if v18 or not v7.usingMouseAndKeyboard() then
		p87 *= 1 - ((if not v7.isLastActiveDevice("mobile") then (if not v7.isLastActiveDevice("controller") then p86._touchAssistInputStrength else p86._controllerAssistInputStrength) else p86._touchAssistInputStrength)) * p86._aimAssist:getStrength()
	end

	if p86._directLookEnabled and p86._directLook then
		local _ = p86._zAngleSpring.p
		local v192 = CFrame.Angles(0, p86._angles.y, 0) * CFrame.Angles(p86._angles.x, 0, 0) * v15.fromAxisAngle(p86._offsetSpring.p) * v15.fromAxisAngle(p87)
		local v193, v194 = v11.limitAnglesYX(v192, p86._minAngle, p86._maxAngle)
		local v195 = v11.getClosestAngle(p86._angles.y, v194)

		p86._angles = Vector3.new(v193, v195, 0)

		local v196 = v11.getOffsetAxisAngle(CFrame.Angles(0, v195, 0) * CFrame.Angles(v193, 0, 0), v192)

		p86._offsetSpring.p = v196
		p86._offsetSpring.t = v196

		return
	end

	local v197 = p86._angles.x + p87.x
	local v198 = p86._angles.y + p87.y

	p86._angles = Vector3.new(math.clamp(v197, p86._minAngle, p86._maxAngle), v198, 0)
end
function t1._init() -- line: 811
	-- upvalues: u5 (ref), v4 (copy), t3 (copy)
	u5 = shared.require("CharacterInterface")
	v4.onSensitivityChanged:connect(function(p88, p89) -- line: 814
		-- upvalues: t3 (copy)
		if p88 == "looksens" then
			t3.sensitivity = p89

			return
		end

		if p88 == "aimsens" then
			t3.aimSensitivity = p89

			return
		end

		if p88 == "controllerlooksens" then
			t3.controllerSens = p89

			return
		end

		if p88 == "controllersenspower" then
			t3.controllerSenspower = p89

			return
		end

		if p88 == "controlleraimsens" then
			t3.controllerAimSens = p89

			return
		end

		if p88 == "controllerverticalmult" then
			t3.controlleryMult = p89

			return
		end

		if p88 == "controllerlookaccel" then
			t3.controllerAccel = p89

			return
		end

		if p88 == "controlleraimaccel" then
			t3.controllerAimAccel = p89

			return
		end

		if p88 == "gyrosens" then
			t3.gyroSensitivity = p89

			return
		end

		if p88 == "gyroaimsens" then
			t3.gyroAimSensitivity = p89

			return
		end

		if p88 == "gyrovertmult" then
			t3.gyroVerticalMult = p89

			return
		end

		if p88 == "touchsens" then
			t3.touchSensitivity = p89

			return
		end

		if p88 == "touchaimsens" then
			t3.touchAimSensitivity = p89
		end
	end)
end

return t1
