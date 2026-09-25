-- ClientModules.Weapons.Firearm.FirearmObject
-- FirearmObject - Recoil Related Functions & Logic


local t1 = {}

t1.__index = t1

local v2 = shared.require("RoundSystemClientInterface")
local v3 = shared.require("HudNotificationInterface")
local v4 = shared.require("PlayerSettingsInterface")
local v5 = shared.require("HudCrosshairsInterface")
local v6 = shared.require("WeaponControllerEvents")
local v7 = shared.require("HitDetectionInterface")
local v8 = shared.require("SamplePointGenerator")
local v9 = shared.require("HudSpottingInterface")
local v10 = shared.require("ChamberStateMachine")
local v11 = shared.require("ActionBindInterface")
local v12 = shared.require("HudStatusInterface")
local v13 = shared.require("EquipStateMachine")
local v14 = shared.require("HudScopeInterface")
local v15 = shared.require("FixedTimeStepper")
local v16 = shared.require("BulletInterface")
local v17 = shared.require("CharacterEvents")
local v18 = shared.require("CameraInterface")
local v19 = shared.require("TouchScreenGui")
local v20 = shared.require("FirearmTracker")
local v21 = shared.require("PublicSettings")
local v22 = shared.require("InputInterface")
local v23 = shared.require("NetworkClient")
local v24 = shared.require("RecoilSprings")
local v25 = shared.require("FirearmStats")
local v26 = shared.require("FirearmSight")
local v27 = shared.require("FirearmLaser")
local v28 = shared.require("FirearmBinds")
local v29 = shared.require("ContentUtils")
local v30 = shared.require("AudioSystem")
local v31 = shared.require("WeaponUtils")
local v32 = shared.require("Destructor")
local v33 = shared.require("TeamConfig")
local v34 = shared.require("Animation")
local v35 = shared.require("Sequencer")
local v36 = shared.require("CFrameLib")
local v37 = shared.require("GameClock")
local v38 = shared.require("MenuUtils")
local v39 = shared.require("LuaUtils")
local v40 = shared.require("Raycast")
local v41 = shared.require("Effects")
local v42 = shared.require("Spring")
local v43 = shared.require("Sway")
local v44 = game:GetService("RunService"):IsStudio()
local LocalPlayer = game:GetService("Players").LocalPlayer
local currentCamera = workspace.currentCamera
local t2 = {
	workspace.Players,
	workspace.Terrain,
	workspace.Ignore,
	workspace.CurrentCamera
}
local n1 = 0
local t3 = {
	"CharmAnchor",
	"LaserLight",
	"LaserDot",
	"Node"
}

--------------------------------------------------------------------------------
-- 1. Instance Initialization & Recoil Springs Creation (t1.new)
--------------------------------------------------------------------------------
function t1.new(p8, p9, p10, p11, p12, p13, p14) -- line: 95
	-- upvalues: t1 (copy), v32 (copy), v4 (copy), v29 (copy), v24 (copy), v31 (copy), v23 (copy), v27 (copy), v36 (copy), v28 (copy), v8 (copy), v42 (copy), v13 (copy), v10 (copy), v17 (copy), v11 (copy), v35 (copy), v15 (copy), v25 (copy), v26 (copy), v38 (copy), v12 (copy), v20 (copy), v41 (copy), v39 (copy), v37 (copy)
	local self = setmetatable({}, t1)

	self._destructor = v32.new()
	self.weaponIndex = p9
	self.weaponName = p10
	self.weaponAttachments = p11
	self.weaponCamo = p12
	self.weaponAttData = p13
	self._characterObject = p8

	local g78 = nil
	local v77 = nil

	if not v4.getValue("togglefirstpersoncamo") then
		self.weaponCamo = nil
	end

	self._weaponData = v29.compileWeaponData({
		weaponName = p10,
		weaponAttachments = p11
	})
	self.weaponData = self._weaponData
	self._recoilParameters = self:getWeaponStat("recoil")
	self._translationSprings = v24.new(self._recoilParameters.hipTranslation, self._recoilParameters.aimTranslation, self._recoilParameters.hipTranslationRecovery, self._recoilParameters.aimTranslationRecovery)
	self._rotationSprings = v24.new(self._recoilParameters.hipRotation, self._recoilParameters.aimRotation, self._recoilParameters.hipRotationRecovery, self._recoilParameters.aimRotationRecovery)
	self._forceHidden = false
	self._mainC0 = CFrame.identity

	local v70, v71 = v31.constructWeapon(self.weaponName, self._weaponData, self.weaponAttachments, self.weaponCamo, self.weaponAttData, true)

	v70.PrimaryPart = nil
	self._weaponModel = v70
	self._destructor:add(self._weaponModel)
	self._partMappings = {}
	self._reversePartMappings = {}
	self._mainPart = self:getWeaponPart(self:getWeaponStat("mainpart"))
	self._barrelPart = self:getWeaponPart(self:getWeaponStat("barrel"))
	self._barrelOffset = self._mainPart.CFrame:toObjectSpace(self._barrelPart.CFrame)

	local color3 = Color3.fromRGB(44, 44, 44)

	for _, child in v70:GetChildren() do
		if child:IsA("BasePart") and child ~= self._mainPart and child ~= self._barrelPart and string.sub(child.Name, 1, 9) ~= "SightMark" then
			color3 = child.Color

			break
		end
	end

	self._barrelPart.Color = color3
	self._mainPart.Color = color3

	for _, child in v70:GetChildren() do
		if string.sub(child.Name, 1, 9) == "SightMark" then
			v77 = child
			g78 = true
		end

		if g78 then
			break
		end
	end

	if not g78 then
		v77 = nil
	end

	g78 = false

	if v77 then
		for _, v in next, v77:GetChildren() do
			if v:IsA("DataModelMesh") then
				v:Destroy()
			end
		end

		v77.Color = color3
	end

	self._destructor:add(self._mainPart:GetPropertyChangedSignal("CFrame"):Once(function() -- line: 172
		-- upvalues: self (copy), v23 (copy)
		if not self:getWeaponModel() then
			return
		end

		v23:send("flaguser", "Silent Aim")
	end))
	self._textureData = {}
	self._transparencyData = {}
	self._activeComponents = {}

	for _, descendant in self._weaponModel:GetDescendants() do
		if descendant:IsA("BasePart") then
			self._transparencyData[descendant] = descendant.Transparency
		end

		if descendant:IsA("Texture") or descendant:IsA("Decal") then
			self._textureData[descendant] = {
				Transparency = descendant.Transparency
			}
			self._transparencyData[descendant] = descendant.Transparency
		end

		if descendant.Name == "LaserLight" then
			local v83 = v27.new(self, descendant)

			self._destructor:add(v83)
			table.insert(self._activeComponents, v83)
		end
	end

	self._animData = v71
	self._animData.camodata = self._textureData
	self._mainOffset = self:getWeaponStat("mainoffset")
	self._yieldToAnimation = false
	self._mainWeld = Instance.new("Motor6D")
	self._animData[self:getWeaponStat("mainpart")] = {
		part = self._mainPart,
		basec0 = CFrame.identity,
		basetransparency = self._mainPart.Transparency,
		weld = {
			C0 = CFrame.identity
		}
	}
	self._animData.larm = {
		basec0 = self:getWeaponStat("larmoffset"),
		weld = {
			C0 = self:getWeaponStat("larmoffset")
		}
	}
	self._animData.rarm = {
		basec0 = self:getWeaponStat("rarmoffset"),
		weld = {
			C0 = self:getWeaponStat("rarmoffset")
		}
	}

	local v84 = v4.getValue("toggledynamicstance")

	self._sprintCF = v36.interpolator(self:getWeaponStat("sprintoffset"))
	self._climbCF = v36.interpolator(self:getWeaponStat("climboffset") or CFrame.new(-0.9, -1.48, 0.43) * CFrame.Angles(-0.5, 0.3, 0))
	self._crouchCF = v36.interpolator(not v84 and CFrame.identity or (self:getWeaponStat("crouchoffset") or CFrame.new(-0.45, 0.1, 0.1) * CFrame.Angles(0, 0, 0.5235987755982988)))
	self._proneCF = v36.interpolator(not v84 and CFrame.identity or (self:getWeaponStat("proneoffset") or CFrame.new(-0.3, 0.25, 0.2) * CFrame.Angles(0, 0, 0.17453292519943295)))
	self._boltCF = v36.interpolator(self._animData[self:getWeaponStat("bolt")].basec0, self._animData[self:getWeaponStat("bolt")].basec0 * self:getWeaponStat("boltoffset"))
	self._burst = 0
	self._nShots = 0
	self._auto = false
	self._nextShot = 0
	self._fireCount = 0
	self._disableUntil = 0
	self._firemodeIndex = v28.lastFiremode[p10] or 1
	self._steadyToggle = false
	self._firemodeStability = 0
	self._samplePointGenerator = v8.new(2)
	self._magCount = math.ceil(p14 and p14.magCount or self:getWeaponStat("magsize"))
	self._spareCount = math.ceil(p14 and p14.spareCount or self:getWeaponStat("sparerounds"))
	self._aiming = false
	self._isHidden = false
	self._boltOpen = false
	self._bolting = false
	self._inspecting = false
	self._blackScoped = false
	self._needRechambering = false
	self._wasSprinting = false
	self._wasBlackScoped = false
	self._lastFiremodeChangeTime = 0
	self._reloadSpring = v42.new(0)
	self._reloadSpring.s = 12
	self._spreadSpring = v42.new((Vector3.new(0, 0, 0)))
	self._spreadSpring.s = self:getWeaponStat("hipfirespreadrecover")
	self._spreadSpring.d = self:getWeaponStat("hipfirestability") or 0.7
	self._chokeSpring = v42.new(0)
	self._chokeSpring.s = self:getWeaponStat("chokespeed") or 0
	self._chokeSpring.d = self:getWeaponStat("chokedamper") or 0
	self._aimArmSpring = v42.new()
	self._aimArmSpring.s = 16
	self._aimArmSpring.d = 0.95
	self._sprintPoseSpring = v42.new()
	self._sprintPoseSpring.s = 40
	self._sprintPoseSpring.d = 0.8
	self._heatFirerateSpring = v42.new(1)
	self._heatFirerateSpring.s = self:getWeaponStat("heatfireratespeed") or 5
	self._heatFirerateSpring.d = self:getWeaponStat("heatfireratedamping") or 3
	self._aimAnimationCancelSpring = v42.new(0)
	self._aimAnimationCancelSpring.s = 30
	self._aimAnimationCancelSpring.d = 1
	self._equipState = v13.new()
	self._chamberState = v10.new(self)
	self._stateChangeTimes = {}
	self._destructor:add(self._equipState.onStateTransition:connect(function(...) -- line: 301
		-- upvalues: self (copy)
		self:_logStateTransition(...)
		self:_processEquipStateChange(...)
	end))
	self._destructor:add(self._chamberState.onStateTransition:connect(function(...) -- line: 306
		-- upvalues: self (copy)
		self:_logStateTransition(...)
		self:_processChamberStateChange(...)
	end))

	local s1 = "ReloadMag"

	if self:getWeaponStat("type") == "SHOTGUN" and not self:getWeaponStat("magfeed") then
		s1 = "ReloadSingle"
	elseif self:getWeaponStat("uniquereload") then
		s1 = "ReloadStaged"
	end

	self._reloadSequenceFunc = shared.require(s1)
	self._activeReloadSequence = nil
	self._reloadCancelTime = self:getWeaponStat("reloadcanceltime") or 0.2
	self._destructor:add(v17.onMovementChanged:connect(function(p15) -- line: 325
		-- upvalues: self (copy)
		if not self:isEquipped() then
			return
		end

		self:updateStance(p15)
	end))
	self._destructor:add(v17.onSprintChanged:connect(function(p16) -- line: 332
		-- upvalues: self (copy), v11 (copy)
		if not self:isEquipped() then
			return
		end

		if p16 then
			self._auto = false

			if self:isAiming() then
				self:setAim(false)

				return
			end
		elseif not p16 and not self:isAiming() and v11.isInputActionDown("Aim Weapon Hold") then
			self:setAim(true)
		end
	end))
	self._destructor:add(v17.onParkouring:connect(function() -- line: 348
		-- upvalues: self (copy)
		if not self:isEquipped() then
			return
		end

		local _characterObject = self._characterObject

		if _characterObject:isSprinting() and _characterObject.sprintToggled then
			self._wasSprinting = true
		end

		if not self:isAnimationReloading() then
			_characterObject:getSpring("sprintspring").s = 15
			self:playAnimation("parkour")
		end
	end))
	self._destructor:add(v17.onHumanoidStateChanged:connect(function(p17, p18) -- line: 362
		-- upvalues: self (copy), v11 (copy)
		if not self:isEquipped() then
			return
		end

		if p17 == Enum.HumanoidStateType.Climbing and p18 ~= Enum.HumanoidStateType.Climbing then
			local _characterObject = self._characterObject

			if v11.isInputActionDown("Aim Weapon Hold") and not _characterObject:isSprinting() and not self:isAiming() then
				self:setAim(true)
			end
		end
	end))
	self.threadWeapon = v35.new()
	self.fixedTimeStepper = v15.new()
	self._activeAimStats = {}
	self._activeAimOffsets = {}
	self._activeAimStatIndex = if not self:getWeaponStat("altaimdisable") then v28.lastAimIndex[self.weaponName] or 1 else 1

	local v86 = v25.new(self)

	if p13 and p13[p11.Optics] then
		local settings = p13[p11.Optics].settings

		if settings then
			v86.sightcolor = settings.sightcolor or v86.sightcolor
		end
	end

	if v86.sightpart then
		self._activeAimOffsets[v86.sightpart] = self._mainPart.CFrame:toObjectSpace(v86.sightpart.CFrame)
	end

	table.insert(self._activeAimStats, v86)

	if v86.midscope or v86.blackscope then
		local v88 = v26.new(self, v86)

		self._destructor:add(v88)
		table.insert(self._activeComponents, v88)
	end

	if self:getWeaponStat("altaimdata") and not self:getWeaponStat("altaimdisable") then
		for _, v in next, self:getWeaponStat("altaimdata") do
			local v91 = v25.new(self, v, p13)

			if v91.midscope or v91.blackscope then
				local v92 = v26.new(self, v91)

				self._destructor:add(v92)
				table.insert(self._activeComponents, v92)
			end

			if v91.sightpart then
				self._activeAimOffsets[v91.sightpart] = self._mainPart.CFrame:toObjectSpace(v91.sightpart.CFrame)
			end

			table.insert(self._activeAimStats, v91)
		end
	end

	local t4 = {}
	local v94 = self:getWeaponStat("onfireanim")

	if v94 then
		table.insert(t4, v38.getAnimationTime(self._weaponData.animations[v94]))
	end

	if self:getWeaponStat("magsize") == 1 and not self:getWeaponStat("chambered") then
		local v95 = `{ self:getWeaponStat("altreloadlong") or "" }reload`

		table.insert(t4, v38.getAnimationTime(self._weaponData.animations[v95]))
	end

	local v96 = #t4 > 0 and math.max(unpack(t4)) or 0

	self._effectiveAnimationFirerate = v96 ~= 0 and 60 / v96 or 1e999

	if not self:getWeaponStat("firemodes")[self._firemodeIndex] then
		self._firemodeIndex = 1
		v28.lastFiremode[p10] = nil
	end

	if not self._activeAimStats[self._activeAimStatIndex] then
		self._activeAimStatIndex = 1
		v28.lastAimIndex[p10] = nil
	end

	self:updateAimStats()

	if self:getWeaponStat("heatfireratekick") or self:getWeaponStat("autoburst") then
		self._destructor:add(self.fixedTimeStepper:addTask("firerateUpdate", 0.1, function() -- line: 454
			-- upvalues: v12 (copy), self (copy)
			v12.updateFiremode(self)
		end))
	end

	for _, v in next, p11 do
		if v == "Ballistics Tracker" then
			local v99 = v20.new(self)

			self._destructor:add(v99)
			table.insert(self._activeComponents, v99)
		end
	end

	self._destructor:add(function() -- line: 468
		-- upvalues: self (copy), v41 (copy)
		if self:getWeaponStat("effectsettings") then
			v41.applyeffects(self:getWeaponStat("effectsettings"), false)
		end
	end)
	self._destructor:add(game:GetService("UserInputService").InputBegan:Connect(function(input, gameProcessed) -- line: 475
		-- upvalues: self (copy)
		if gameProcessed then
			return
		end

		if input.KeyCode.Name == "P" then
			self:_printStates()
		end
	end))
	self._sightObjects = {
		["Rear Sight"] = {
			Hard = {},
			Default = {}
		},
		["Red Dot Sight"] = {
			Hard = {},
			Default = {}
		}
	}

	for _, descendant in self._weaponModel:GetDescendants() do
		for _, tag in (descendant:GetTags()) do
			for v104, v105 in self._sightObjects do
				if v104 ~= string.sub(tag, 1, #v104) then
					continue
				end

				local v106 = string.sub(tag, #v104 + 2, #tag)
				local v107 = v105[v106] or v105.Default

				table.insert(v107, descendant)

				if v106 ~= "Hard" then
					for _, child in descendant:GetChildren() do
						if child:IsA("Decal") or child:IsA("Texture") then
							table.insert(v107, child)
						end
					end

					break
				end
			end
		end
	end

	v70.Name = v39.generateRandomString(math.random(6, 13))

	for _, descendant in v70:GetDescendants() do
		if not descendant:IsA("Bone") then
			local v112 = v39.generateRandomString(math.random(6, 13))

			self._partMappings[descendant.Name] = v112
			self._reversePartMappings[v112] = descendant.Name
			descendant.Name = v112
		end
	end

	if self:getFiremode() == "SINGLE" then
		self._needRechambering = true
		self._bolting = false
		self._singleactionready = true
		self._chamberState:setState("unchambered", v37.getTime(), true)
	end

	return self
end

--------------------------------------------------------------------------------
-- 2. Aiming State Transition (t1.setAim)
--------------------------------------------------------------------------------
function t1.setAim(p98, p99)
	local v231 = v18.getActiveCamera("MainCamera")
	local _characterObject = p98._characterObject

	if p98:getWeaponStat("forcehip") or (p98:isStateReloading() or p98:isReloadingCancelling() or p98:isReloadingResetting()) then
		return
	end

	if p98:isInspecting() then
		p98._inspecting = false
		p98:cancelAnimation(p98._reloadCancelTime)
	end

	if p99 and not p98._aiming then
		if (p98._chamberState:isState("unchambered") or p98:isChambering() or p98._bolting) and not p98:getWeaponStat("straightpull") and p98:getActiveAimStat("blackscope") then
			return
		end

		if p98:getWeaponStat("proneonly") then
			if _characterObject:getMovementMode() == "stand" then
				return
			end

			if _characterObject:getSpring("pronespring").p < 0.5 then
				return
			end
		end

		if p98:getWeaponStat("restrictedads") and ((_characterObject:getMovementMode() ~= "stand" or not _characterObject:getParkourDetection()) and not (math.max(_characterObject:getSpring("crouchspring").p, _characterObject:getSpring("pronespring").p) > 0.5)) then
			return
		end

		p98._aiming = true

		if v19.isEnabled() then
			v231:setGyroAim(true)
		end

		v23:send("aim", true)
		v30.play("aimGear", 3, 0.15)

		-- Recoil Springs AIM State Set
		p98._translationSprings:setAim(true)
		p98._rotationSprings:setAim(true)
		v231:setAim(true)

		if _characterObject:isSprinting() then
			if _characterObject.sprintToggled then
				p98._wasSprinting = true
			end

			_characterObject:setSprint(false)
		end

		_characterObject.sprintDisabled = p98:getActiveAimStat("blackscope")
		_characterObject:setWalkSpeedMult(p98:getActiveAimStat("aimwalkspeedmult"))
		v231:setAimSensitivity(true)
		p98._aimArmSpring.t = (not p98._yieldToAnimation or (not p98:getActiveAimStat("zoompullout") or p98:getWeaponStat("straightpull"))) and 1 or 0
		_characterObject:getSpring("zoommodspring").t = if not p98._yieldToAnimation or (not p98:getActiveAimStat("zoompullout") or not p98:getActiveAimStat("aimspringcancel")) then (not p98._yieldToAnimation or (not p98:getActiveAimStat("zoompullout") or p98:getActiveAimStat("blackscope"))) and 1 or 0.5 else 0
		v5.setCrossSize(0)
		p98:updateAimStats()
	elseif not p99 and p98._aiming then
		p98._aiming = false

		if v19.isEnabled() then
			v231:setGyroAim(false)
		end

		v23:send("aim", false)
		v30.play("aimGear", 3, 0.15)

		-- Recoil Springs HIP State Set
		p98._translationSprings:setAim(false)
		p98._rotationSprings:setAim(false)
		v231:setAim(false)

		if p98._wasSprinting then
			_characterObject:setSprint(true)
			p98._wasSprinting = false
		end

		_characterObject.sprintDisabled = false
		_characterObject:setWalkSpeedMult(1)
		v231:setAimSensitivity(false)
		p98._aimArmSpring.t = 0
		_characterObject:getSpring("zoommodspring").t = 0
		p98:updateAimStats()
	end
end


--------------------------------------------------------------------------------
-- 3. Impulse Application to Recoil Springs (t1.impulseSprings)
--------------------------------------------------------------------------------
function t1.impulseSprings(p133, p134)
	local v330 = v18.getActiveCamera("MainCamera")
	local n2 = (1 - p134) * (p133:getWeaponStat("camerarecoilmult") or 1)
	local v333 = 1

	if p133:getWeaponStat("weightrecoilmult") then
		v333 = p133:computeWeightRecoilMult()
	end

	p133._translationSprings:applyImpulse(nil, v333)
	p133._rotationSprings:applyImpulse(nil, v333)

	if v330 and not p133:getWeaponStat("disablecamerarecoil") then
		v330:applyImpulse(v333 * n2)
	end
end


--------------------------------------------------------------------------------
-- 4. Shoot Routine & Delayed Recoil Impulse Handling
--------------------------------------------------------------------------------
-- Inside Shoot function (task.delay with recoildelay):
function t1.shootRoutineExtract(p135, p136, v343, v344, v345)
	-- v344 = p135:getActiveAimStat("recoildelay") or v343 (Recoil Delay calculation)

	p135:fireInput("shoot", v345)

	-- Delayed recoil impulse trigger
	task.delay(v344, function()
		if not p135._destructor then
			return
		end

		p135:impulseSprings(p136)
	end)

	if not p135:isAiming() then
		v5.fireImpulse(p135:getWeaponStat("crossexpansion") * (1 - p136))
	elseif p135:getWeaponStat("animations").onfire and p135:getActiveAimStat("pullout") then
		p135._needRechambering = "onfire"
	end
end


--------------------------------------------------------------------------------
-- 5. Frame Render CFrame Composition & Spring Stepping
--------------------------------------------------------------------------------
function t1.renderAndStepExtract(p142, v407, v409, n3, p, p2, p3, v362, v414, v415, p143)
	-- CFrame Offset Calculation including translation & rotation recoil springs:
	local v416 = _characterObject:getRootPart().CFrame:inverse() 
		* v362:getShakeCFrame() 
		* p142._mainOffset 
		* p142._climbCF(_characterObject:getSpring("climbing").p) 
		* CFrame.new(v407.p) 
		* v409 
		* _characterObject.sway:getSwayCFrame(v390, v391) 
		* v409:inverse() 
		* p142:computeWalkSway(v414, v415) 
		* p142:computeGunSway(n3) 
		* p142._proneCF(p3 * (1 - n3)):Lerp(CFrame.identity, p142._reloadSpring.p):Lerp(CFrame.identity, p) 
		* p142._crouchCF(p2):Lerp(CFrame.identity, p142._reloadSpring.p):Lerp(CFrame.identity, n3):Lerp(CFrame.identity, p) 
		* v36.fromAxisAngle(p142._spreadSpring.p) 
		* CFrame.new(p142._translationSprings:getP()) -- Position Recoil offset
		* v36.fromAxisAngle(p142._rotationSprings:getP()) -- Rotation Recoil offset
		* (v407 - v407.p)

	p142._mainC0 = v416
	p142._mainWeld.C0 = v416

	-- Step Recoil Springs (Recovery Step)
	p142._translationSprings:step()
	p142._rotationSprings:step()
end
