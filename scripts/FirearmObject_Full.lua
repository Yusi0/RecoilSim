-- ClientModules.Weapons.Firearm.FirearmObject

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

local function onPlayerHit(p1, p2, p3, p4, p5, p6) -- line: 78
	-- upvalues: v7 (copy)
	local playersHit = p1.extra.playersHit

	if playersHit[p2] then
		return
	end

	playersHit[p2] = true
	v7.playerHitDection(p1, p2, p3, p4, p5, p6)
end
local function getSightmark(p7) -- line: 87
	for _, child in p7:GetChildren() do
		if string.sub(child.Name, 1, 9) == "SightMark" then
			return child
		end
	end
end

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
function t1.Destroy(p19) -- line: 559
	if not p19._destructor then
		return
	end

	p19._destructor:Destroy()
	p19._destructor = nil
end
function t1.getBarrelCFrame(p20) -- line: 567
	return p20._characterObject:getRootPart().CFrame * p20._mainC0 * (p20:isAiming() and p20._activeAimOffsets[p20:getActiveAimStat("sightpart")] or p20._barrelOffset)
end
function t1.isEquipped(p21) -- line: 573
	return p21._equipState:isState("equipped")
end
function t1.isUnequipped(p22) -- line: 577
	return p22._equipState:isState("unequipped")
end
function t1.isEquipping(p23) -- line: 581
	return p23._equipState:isState("equipping")
end
function t1.isUnequipping(p24) -- line: 585
	return p24._equipState:isState("unequipping")
end
function t1.isState(p25, p26) -- line: 589
	return p25._equipState:isState(p26) or p25._chamberState:isState(p26)
end
function t1.isSteadyState(p27) -- line: 595
	return p27:isEquipped() and (p27:isState("chambered") or p27:isState("unchambered"))
end
function t1.isAiming(p28) -- line: 599
	return p28._aiming
end
function t1.isInspecting(p29) -- line: 603
	return p29._inspecting
end
function t1.isBlackScoped(p30) -- line: 607
	return p30._blackScoped
end
function t1.isStateReloading(p31) -- line: 611
	return p31._chamberState:isState("chamberedReloading") or p31._chamberState:isState("unchamberedReloading")
end
function t1.isReloading(p32) -- line: 615
	return p32:isStateReloading() or p32._characterObject.reloading
end
function t1.isAnimationReloading(p33) -- line: 619
	return p33:isReloading() or p33._yieldToAnimation
end
function t1.isReloadingCancelling(p34) -- line: 623
	return p34._chamberState:isState("chamberedReloadCancelling") or p34._chamberState:isState("unchamberedReloadCancelling")
end
function t1.isReloadingResetting(p35) -- line: 629
	return p35._chamberState:isState("chamberedReloadCancelResetting") or p35._chamberState:isState("unchamberedReloadCancelResetting")
end
function t1.isChambering(p36) -- line: 635
	return p36._chamberState:isState("chambering") or p36._chamberState:isState("chamberCancelling")
end
function t1.isLastReloadSequence(p37) -- line: 641
	if not p37._activeReloadSequence then
		return true
	end

	if #p37._activeReloadSequence ~= 1 then
		return
	end

	return p37._activeReloadSequence[1].repetitionCount == 1
end
function t1.canEquip(_) -- line: 652
	return true
end
function t1.canUnequip(p39) -- line: 656
	if p39:getFiremode() == "SWITCH" and p39._burst > 0 then
		return false
	end

	return not p39:isState("equipping")
end
function t1.canReload(p40) -- line: 665
	if p40:getFiremode() == "SWITCH" and p40._burst > 0 then
		return false
	end

	return p40:isEquipped() and (not p40:isAnimationReloading() and (p40:getSpareCount() > 0 and p40:getMagCount() < p40:getWeaponStat("magsize") + (not p40:getWeaponStat("chamber") and 0 or 1)))
end
function t1.canFire(p41) -- line: 678
	-- upvalues: v37 (copy), v2 (copy)
	if v37.getTime() < p41._nextShot or (not p41:isEquipped() or v2.roundLock) then
		return false
	end

	if not p41:isState("chambered") and (not p41:isState("chamberedReloading") or not p41._canShoot) then
		return
	end

	local v136 = p41:getFiremode()

	if p41:getWeaponStat("burstcam") and v136 ~= true then
		return p41._auto and p41._burst > 0
	end

	return p41._auto or p41._burst > 0
end
function t1.getMagCount(p42) -- line: 695
	return p42._magCount
end
function t1.getSpareCount(p43) -- line: 699
	return p43._spareCount
end
function t1.getFiremode(p44) -- line: 703
	return p44:getWeaponStat("firemodes")[p44._firemodeIndex]
end
function t1.getWeaponData(p45) -- line: 707
	return p45._weaponData
end
function t1.getWeaponStat(p46, p47) -- line: 711
	return p46._weaponData[p47]
end
function t1.getActiveAimStats(p48) -- line: 715
	return p48._activeAimStats
end
function t1.getActiveAimStat(p49, p50) -- line: 719
	return p49._activeAimStats[p49._activeAimStatIndex][p50]
end
function t1.getWeaponType(_) -- line: 723
	return "Firearm"
end
function t1.getWeaponModel(p52) -- line: 727
	return p52._weaponModel
end
function t1.popWeaponModel(p53) -- line: 731
	local v149 = p53._destructor:remove(p53:getWeaponModel())

	if v149 then
		p53:forceCancelAnimation()
		p53._weaponModel = nil
		p53._mainWeld.Part1 = nil
		p53:fixModelNames(v149)

		local Charm = v149:FindFirstChild("Charm")

		if Charm then
			Charm:Destroy()
		end

		return v149
	end
end
function t1.fixModelNames(p54, p55) -- line: 746
	p55.Name = p54._reversePartMappings[p55.Name] or p55.Name

	for _, descendant in p55:GetDescendants() do
		descendant.Name = p54._reversePartMappings[descendant.Name] or descendant.Name
	end
end
function t1.getMainPart(p56) -- line: 753
	return p56._mainPart
end
function t1.getWeaponPart(p57, p58) -- line: 757
	-- upvalues: v23 (copy)
	local v158 = p57._partMappings[p58] or p58

	if not p57._weaponModel:FindFirstChild(v158) then
		v23:send("debug", string.format("No part %s found on %s %s", p58, p57.weaponName, (tostring(p57._weaponModel.Parent))))
		warn(string.format("No part %s found on %s", p58, p57.weaponName))
	end

	return p57._weaponModel[v158]
end
function t1.getAnimation(p59, p60) -- line: 766
	return p59:getWeaponStat("animations")[p60]
end
function t1.getAnimLength(p61, p62) -- line: 770
	-- upvalues: v38 (copy)
	local v163 = p61:getAnimation(p62)

	if not v163 then
		return 0
	end

	return v38.getAnimationTime(v163, true)
end
function t1.getTimePassedSinceStateChange(p63, p64, p65) -- line: 779
	return p65 - p63._stateChangeTimes[p64]
end
function t1.stateTimeCheck(p66, p67, p68, p69) -- line: 783
	return p66:isState(p67) and p68 < p66:getTimePassedSinceStateChange(p67, p69)
end
function t1.animationStateCheck(p70, p71, p72, p73) -- line: 789
	return p70:stateTimeCheck(p71, p70:getAnimLength(p72), p73)
end
function t1.getCurrentReloadFile(p74) -- line: 793
	if not p74._activeReloadSequence then
		return
	end

	return p74._activeReloadSequence[1]
end
function t1.getCurrentReloadLength(p75) -- line: 800
	local v177 = p75:getCurrentReloadFile()

	if not v177 then
		return
	end

	return p75:getAnimLength(v177.reloadName)
end
function t1.getFiremodeString(p76) -- line: 808
	if p76:getWeaponStat("doublebarrel") then
		if p76._firemodeIndex == 1 then
			return "SEMI"
		end

		return "BURST"
	end

	local v179 = p76:getFirerate()
	local v180 = p76:getFiremode()
	local v181 = if v180 ~= true then if v180 ~= 1 then if v180 ~= "BINARY" then if v180 ~= "SWITCH" then if v180 ~= "DOUBLE" then if v180 ~= "SINGLE" then string.rep("I", v180) else "SA" else "DA" else "SW" else "B" else "S" else "A"

	return `{ math.round(v179) } { v181 }`
end
function t1.shouldIgnoreHeatFirerate(p77) -- line: 832
	local v183 = p77:getFiremode()
	local v184 = p77:getWeaponStat("heatfirerateignorelist")

	return v184 and table.find(v184, v183)
end
function t1.getFirerate(p78) -- line: 838
	local p = p78._heatFirerateSpring.p
	local v187 = p78:getActiveAimStat("variablefirerate") and p78:getActiveAimStat("firerate")[p78._firemodeIndex] or p78:getActiveAimStat("firerate")

	if p78:getWeaponStat("autoburst") and (p78:getFiremode() == true and p78._nShots < p78:getWeaponStat("autoburst")) then
		v187 = p78:getWeaponStat("burstfirerate")
	end

	if not p78:shouldIgnoreHeatFirerate() then
		v187 *= p

		local v188 = p78:getWeaponStat("heatfireratecap")

		if v188 then
			v187 = math.min(v187, v188)
		end

		local v189 = p78:getWeaponStat("heatfireratemin")

		if v189 then
			v187 = math.max(v187, v189)
		end
	end

	return (math.min(v187, p78._effectiveAnimationFirerate))
end
function t1.getDropInfo(p79) -- line: 869
	return p79._magCount, p79._spareCount, p79._mainPart.Position
end
function t1.computeWalkSway(p80, p81, p82) -- line: 873
	-- upvalues: v36 (copy)
	local _characterObject = p80._characterObject
	local v195, v196, _ = _characterObject:getWalkValues()
	local v198 = p81 or 1
	local v199 = p82 or 1
	local v200 = v195 * 6.283185307179586 * 3 / 4

	Vector3.new(0, 0, 0)

	local v201 = v196 * (1 - _characterObject:getSpring("slidespring").p * 0.9)
	local v202 = Vector3.new(v199 * math.sin(v200 / 4 - 1) / 256 + v199 * (math.sin(v200 / 64) - v199 * 0 / 4) / 512, v199 * math.cos(v200 / 128) / 256 - v199 * math.cos(v200 / 8) / 256, v199 * math.sin(v200 / 8) / 128 + v199 * 0 / 1024) * math.sqrt(v201 / 20) * 6.283185307179586

	return CFrame.new(v199 * math.cos(v200 / 8 - 1) * v201 / 196, 1.25 * v198 * math.sin(v200 / 4) * v201 / 512, 0) * v36.fromAxisAngle(v202)
end
function t1.computeGunSway(p83, p84) -- line: 894
	-- upvalues: v37 (copy)
	local v205 = v37.getTime()
	local v206 = p83:getWeaponStat("idleswaycyclespeed") or 6
	local v207 = p83:getWeaponStat("idleswayamphipmult") or 1
	local v208 = p83:getWeaponStat("idleswayampaimmult") or 0.2
	local v209 = v207 * (1 - p84) + v208 * p84
	local v210 = v205 * v206

	return CFrame.new(math.cos(v210 / 8) * v209 / 128, -math.sin(v210 / 4) * v209 / 128, math.sin(v210 / 16) * v209 / 64)
end
function t1.fireInput(p85, p86, p87) -- line: 905
	if p85._equipState:fireInput(p86, p87) then
		if p86 == "unequipStart" then
			if not p85:canUnequip() then
				return
			end

			if p85:isState("unchamberedReloading") or p85:isState("unchamberedReloadCancelling") or p85:isState("chambering") or p85:isState("chamberCancelling") or p85:isState("unchambered") then
				p85._needRechambering = true
				p85._bolting = false
				p85._chamberState:setState("unchambered", p87)
			elseif p85:isState("chamberedReloading") or p85:isState("chamberedReloadCancelling") then
				p85._chamberState:setState("chambered", p87)
			end
		end

		return true
	end

	if not p85:isEquipped() then
		return
	end

	if p85._chamberState:fireInput(p86, p87) then
		return true
	end
end
function t1.equip(p88) -- line: 936
	-- upvalues: v37 (copy)
	p88:fireInput("equipStart", (v37.getTime()))
end
function t1.unequip(p89) -- line: 941
	-- upvalues: v37 (copy)
	p89:fireInput("unequipStart", (v37.getTime()))
end
function t1.forceUnequip(p90) -- line: 946
	p90._equipState:setState("unequipped")
	p90._mainWeld.Part1 = nil

	if p90._weaponModel then
		p90._weaponModel.Parent = nil
	end

	p90._yieldToAnimation = false
	p90._characterObject.animating = false
end
function t1.reload(p91) -- line: 958
	-- upvalues: v37 (copy), v34 (copy)
	local v218 = v37.getTime()

	if p91:isEquipping() or p91:isUnequipping() then
		return
	end

	if not p91:canReload() or p91:isChambering() then
		return
	end

	if p91:isInspecting() then
		p91._characterObject.thread:clear()
		p91._characterObject.thread:add(v34.reset(p91._animData, 0.1, p91:getWeaponStat("keepanimvisibility")))
	elseif p91._characterObject.animating then
		p91:cancelAnimation()
	end

	if p91:isAiming() then
		p91:setAim(false)
	end

	p91:fireInput("reloadStart", v218)
end
function t1.reloadCancel(p92) -- line: 982
	-- upvalues: v37 (copy)
	p92:fireInput("reloadCancel", (v37.getTime()))
end
function t1.toggleSight(p93) -- line: 987
	-- upvalues: v28 (copy)
	if p93:getWeaponStat("altaimdisable") then
		return
	end

	p93._activeAimStatIndex = p93._activeAimStatIndex % #p93._activeAimStats + 1
	v28.lastAimIndex[p93.weaponName] = p93._activeAimStatIndex
	p93:updateAimStats()
end
function t1.toggleNextFiremode(p94) -- line: 996
	-- upvalues: v37 (copy), v34 (copy), v28 (copy)
	if p94._lastFiremodeChangeTime + 0.4 > v37.getTime() then
		return
	end

	local selector = p94:getWeaponStat("animations").selector

	if p94:isAnimationReloading() and selector then
		return
	end

	if p94:isInspecting() then
		return
	end

	if p94:getFiremode() == "SWITCH" and p94._burst > 0 then
		return false
	end

	local v223 = p94:getWeaponStat("firemodes")

	if #v223 <= 1 then
		return
	end

	local _characterObject = p94._characterObject
	local thread = _characterObject.thread

	if selector then
		if _characterObject.animating then
			thread:clear()
			thread:add(v34.reset(p94._animData, 0.2, p94:getWeaponStat("keepanimvisibility") or p94:isBlackScoped()))
		end

		_characterObject.animating = true

		if p94:isAiming() and not p94:getActiveAimStat("aimspringcancel") then
			_characterObject:getSpring("zoommodspring").t = 0.5
			p94._aimArmSpring.t = 0
			p94:updateAimStats()
		end

		if _characterObject:isSprinting() then
			_characterObject:getSpring("sprintspring").s = p94:getWeaponStat("unsprintspeed")
			_characterObject:getSpring("sprintspring").d = p94:getWeaponStat("unsprintdamping") or 0.9
			_characterObject:getSpring("sprintspring").t = 0.5
		end

		p94._yieldToAnimation = true
		thread:add(v34.player(p94._animData, selector, p94, "selector"))
		thread:add(function() -- line: 1040
			-- upvalues: thread (copy), v34 (copy), p94 (copy), selector (copy), _characterObject (copy)
			thread:add(v34.reset(p94._animData, selector.resettime or 0.5, p94:getWeaponStat("keepanimvisibility") or p94:isBlackScoped()))
			_characterObject.animating = false
			p94._inspecting = false
			p94._yieldToAnimation = false

			if _characterObject:isSprinting() then
				_characterObject:getSpring("sprintspring").s = p94:getWeaponStat("sprintspeed")
				_characterObject:getSpring("sprintspring").d = p94:getWeaponStat("sprintdamping") or 0.9
				_characterObject:getSpring("sprintspring").t = 1
			end

			if p94:isAiming() then
				_characterObject:getSpring("zoommodspring").t = 1
				p94._aimArmSpring.t = 1
				p94:updateAimStats()
			end
		end)
	end

	thread:add(function() -- line: 1058
		-- upvalues: v37 (copy), p94 (copy), v223 (copy), v28 (copy)
		local v470 = v37.getTime()

		p94._firemodeIndex = p94._firemodeIndex % #v223 + 1
		v28.lastFiremode[p94.weaponName] = p94._firemodeIndex

		if p94._auto then
			p94._auto = false
		end

		p94._burst = 0
		p94:updateFiremodeStability()

		if p94._chamberState:isState("chambered") and p94:getFiremode() == "SINGLE" and not p94._singleactionready then
			p94._needRechambering = true
			p94._bolting = false
			p94._singleactionready = true
			p94._chamberState:setState("unchambered", v470, true)
		end
	end)
	p94._lastFiremodeChangeTime = v37.getTime()
end
function t1.setFlag(p95, p96, p97, ...) -- line: 1079
	-- upvalues: v37 (copy), v6 (copy)
	if not p97 then
		warn("FirearmObject: No currentTime was passed for setFlag", p96, ...)
		p97 = v37.getTime()
	end

	v6.onControllerFlag:fire(p95, p96, p97, ...)
end
function t1.setAim(p98, p99) -- line: 1087
	-- upvalues: v18 (copy), v19 (copy), v23 (copy), v30 (copy), v5 (copy), v11 (copy), v12 (copy)
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
		if p98._aiming and p98:getActiveAimStat("blackscope") then
			p98.threadWeapon:clear()
		end

		p98._aiming = false
		p98._aimArmSpring.t = 0
		p98:updateAimStats()

		if v19.isEnabled() then
			v231:setGyroAim(false)
		end

		p98._translationSprings:setAim(false)
		p98._rotationSprings:setAim(false)
		v231:setAim(false)
		v30.play("aimCloth", 3, 0.15)
		v23:send("aim", false)
		_characterObject.sprintDisabled = false
		_characterObject:getSpring("zoommodspring").t = 0
		_characterObject:setWalkSpeedMult(1)

		if not p98._wasBlackScoped and not _characterObject.sprintToggled then
			_characterObject:setSprint(v11.isInputActionDown("Sprint Hold") or (v11.isInputActionDown("Move Forward") and _characterObject.doubletap or p98._wasSprinting))
		end

		p98._wasSprinting = false
		v231:setAimSensitivity(false)
		p98.threadWeapon:add(function() -- line: 1196
			-- upvalues: p98 (copy)
			if p98._magCount == 0 and (p98._spareCount > 0 and not p98:isAnimationReloading()) then
				p98:reload()
			end
		end)
		v5.setCrossSize(p98:getWeaponStat("crosssize"))
	end

	_characterObject:updateWalkSpeed()
	v12.updateFiremode(p98)
end
function t1.setReloadSequence(p100) -- line: 1210
	p100._activeReloadSequence = p100:_reloadSequenceFunc()

	for i = #p100._activeReloadSequence, 1, -1 do
		if p100._activeReloadSequence[i].repetitionCount <= 0 then
			table.remove(p100._activeReloadSequence, i)
		end
	end
end
function t1.popReloadSequence(p101) -- line: 1223
	-- upvalues: v23 (copy), v34 (copy)
	local _characterObject = p101._characterObject

	if not p101._activeReloadSequence then
		warn("FirearmObject: No activeReloadSequence found on popReloadSequence")

		return
	end

	local v237 = p101._activeReloadSequence[1]
	local reloadName = v237.reloadName

	if not v237 then
		warn("FirearmObject: No reloadFile found on popReloadSequence")

		return
	end

	if not p101:getWeaponStat("animations")[reloadName] then
		warn("FirearmObject: No animationFile found on popReloadSequence", reloadName)
		v23:send("debug", string.format("FirearmObject: No animationFile found on popReloadSequence %s %s", p101.weaponName, reloadName))
	end

	p101:applyReloadCount(v237.magCountChange)

	if p101:getSpareCount() > 0 and v237.repetitionCount > 1 then
		v237.repetitionCount = v237.repetitionCount - 1
	else
		table.remove(p101._activeReloadSequence, 1)
	end

	if #p101._activeReloadSequence <= 0 then
		p101._activeReloadSequence = nil
		_characterObject.thread:add(function() -- line: 1254
			-- upvalues: p101 (copy), v237 (copy), _characterObject (copy), v34 (copy), reloadName (copy)
			p101._canShoot = true

			if not v237.ignoreReset then
				_characterObject.thread:add(v34.reset(p101._animData, p101:getWeaponStat("animations")[reloadName].resettime or 0.5))
			end

			_characterObject.thread:add(function() -- line: 1259
				-- upvalues: _characterObject (copy), p101 (copy)
				_characterObject.animating = false
				_characterObject.reloading = false
				p101._canShoot = false
				p101._reloadSpring.t = 0

				if _characterObject:isSprinting() then
					_characterObject:getSpring("sprintspring").s = p101:getWeaponStat("sprintspeed")
					_characterObject:getSpring("sprintspring").d = p101:getWeaponStat("sprintdamping") or 0.9
					_characterObject:getSpring("sprintspring").t = 1
				end
			end)
		end)
	end
end
function t1.applyReloadCount(p102, p103) -- line: 1274
	-- upvalues: v23 (copy)
	local v241 = p102:getWeaponStat("magsize") + (not p102:getWeaponStat("chamber") and 0 or 1) - p102._magCount
	local v242 = p103 < v241 and p103 or v241

	if v242 < p102._spareCount then
		p102._magCount = p102._magCount + v242
		p102._spareCount = p102._spareCount - v242
	else
		p102._magCount = p102._magCount + p102._spareCount
		p102._spareCount = 0
	end

	if v242 > 0 then
		v23:send("reload")
	end
end
function t1.addAmmo(p104, p105, p106, p107) -- line: 1291
	-- upvalues: v12 (copy), v3 (copy)
	p104._spareCount = p104._spareCount + p105
	v12.updateAmmo(p104)

	if not p107 or p107 == "ground" then
		v3.customAward("Picked up " .. p105 .. " rounds from dropped " .. p106)

		return
	end

	if p107 == "BCmeleeKill" then
		v3.customAward("Recieved " .. p105 .. " rounds for " .. p106)
	end
end
function t1.updateStance(p108, p109) -- line: 1302
	if p108:getWeaponStat("restrictedads") and (p108:isAiming() and p109 == "stand") then
		p108:setAim(false)
	end

	if p108:getWeaponStat("proneonly") and p108:isAiming() and p109 ~= "prone" then
		p108:setAim(false)
	end
end
function t1.updateFiremodeStability(p110) -- line: 1315
	-- upvalues: v12 (copy)
	local v250 = p110:getWeaponStat("firemodestability")

	p110._firemodeStability = v250 and v250[p110._firemodeIndex] or 0
	v12.updateFiremode(p110)
end
function t1.updateScope(p111) -- line: 1321
	-- upvalues: v41 (copy), v14 (copy), v4 (copy)
	if p111._blackScoped and not p111._wasBlackScoped then
		p111._wasBlackScoped = true
		p111:hideModel()
		v41.applyeffects(p111:getWeaponStat("effectsettings"), true)
		v14.setScope(true, p111:getActiveAimStat("nosway"))
	elseif not p111._blackScoped and p111._wasBlackScoped then
		p111._wasBlackScoped = false
		p111:showModel()
		v41.applyeffects(p111:getWeaponStat("effectsettings"), false)
		v14.setScope(false)
	end

	local p = p111._characterObject:getSpring("masteraimspring").p

	if not p111._weaponModel then
		return
	end

	if not p111._isHidden then
		local v253 = math.clamp((p - 0.2) * 1.25, 0, 1)

		for v254, v255 in p111._sightObjects do
			for _, v257 in v255.Hard do
				v257.Transparency = if not (p > 0.2) then p111._transparencyData[v257] else 1
			end

			local v258 = v254 == "Red Dot Sight" and v4.getValue("rearOpticSightTransparency") or v4.getValue("rearSightTransparency")

			for _, v260 in v255.Default do
				v260.Transparency = v253 * v258 + p111._transparencyData[v260]
			end
		end
	end
end
function t1.updateBeltLinks(p112, p113) -- line: 1354
	if not p112:getWeaponStat("beltlinkdata") then
		return
	end

	local tweenInfo = TweenInfo.new(p113 or 0.1, Enum.EasingStyle.Linear, Enum.EasingDirection.Out)
	local v264 = p112:getWeaponStat("beltlinkdata")
	local beltCount = v264.beltCount
	local _magCount = p112._magCount

	for _, descendant in p112._weaponModel:GetDescendants() do
		if descendant:IsA("BasePart") then
			for _, v270 in v264.beltNameList do
				local v271 = p112._reversePartMappings[descendant.Name]

				if not v271 then
					continue
				end

				local v272 = v271:match("^" .. v270 .. "_(%d+)$")

				if v272 then
					local v273 = not (tonumber(v272) > beltCount - _magCount) and 1 or 0

					if p113 then
						if v273 == descendant.Transparency then
							break
						end

						game:GetService("TweenService"):Create(descendant, tweenInfo, {
							Transparency = v273
						}):Play()

						break
					end

					descendant.Transparency = v273

					break
				end
			end
		end
	end
end
function t1.hideModel(p114) -- line: 1404
	-- upvalues: t3 (copy)
	if p114._isHidden then
		return
	end

	p114._isHidden = true

	for _, descendant in p114._weaponModel:GetDescendants() do
		if descendant:IsA("BasePart") then
			local v277 = p114._reversePartMappings[descendant.Name] or descendant.Name

			if not table.find(t3, v277) and (not p114._weaponData.invisible or not p114._weaponData.invisible[v277]) then
				descendant.Transparency = 1
			end
		elseif descendant:IsA("Decal") or descendant:IsA("Texture") then
			descendant.Transparency = 1
		elseif descendant:IsA("SurfaceGui") then
			descendant.Enabled = false
		elseif descendant:IsA("RopeConstraint") then
			descendant.Visible = false
		end
	end

	local v278, v279 = p114._characterObject:getArmModels()

	for _, child in v278:GetChildren() do
		if child:IsA("BasePart") then
			child.Transparency = 1
		end
	end

	for _, child in v279:GetChildren() do
		if child:IsA("BasePart") then
			child.Transparency = 1
		end
	end
end
function t1.showModel(p115) -- line: 1441
	-- upvalues: t3 (copy)
	if not p115._isHidden or (p115._blackScoped or p115._forceHidden) then
		return
	end

	p115._isHidden = false

	for _, descendant in p115._weaponModel:GetDescendants() do
		if descendant:IsA("BasePart") then
			local v287 = p115._reversePartMappings[descendant.Name] or descendant.Name

			if not table.find(t3, v287) and ((not p115._weaponData.invisible or not p115._weaponData.invisible[v287]) and p115._transparencyData[descendant]) then
				descendant.Transparency = p115._transparencyData[descendant]
			end
		elseif descendant:IsA("Decal") or descendant:IsA("Texture") then
			descendant.Transparency = p115._transparencyData[descendant]
		elseif descendant:IsA("SurfaceGui") then
			descendant.Enabled = true
		elseif descendant:IsA("RopeConstraint") then
			descendant.Visible = true
		end
	end

	local v288, v289 = p115._characterObject:getArmModels()

	for _, child in v288:GetChildren() do
		if child:IsA("BasePart") then
			child.Transparency = 0
		end
	end

	for _, child in v289:GetChildren() do
		if child:IsA("BasePart") then
			child.Transparency = 0
		end
	end

	p115:updateBeltLinks()
end
function t1.toggleForceHide(p116) -- line: 1481
	p116._forceHidden = not p116._forceHidden

	if not p116._forceHidden then
		p116:showModel()

		return
	end

	p116:hideModel()
end
function t1.cancelAnimation(p117, p118, _) -- line: 1490
	-- upvalues: v34 (copy)
	p117._characterObject.thread:clear()
	p117._characterObject.thread:add(v34.reset(p117._animData, p118 or 0.05, p117:getWeaponStat("keepanimvisibility") or p117:isBlackScoped()))
	p117._characterObject.animating = false
end
function t1.forceCancelAnimation(p120) -- line: 1496
	-- upvalues: v34 (copy)
	p120._characterObject.thread:clear()
	v34.reset(p120._animData, 1, false, true, true)(1)
	p120._characterObject.animating = false
end
function t1.playAnimation(p121, p122, p123, p124) -- line: 1502
	-- upvalues: v34 (copy), v11 (copy)
	local _characterObject = p121._characterObject
	local thread = _characterObject.thread

	if p121:isAnimationReloading() or (not p121:isEquipped() or p121:canFire()) then
		return
	end

	thread:clear()

	if _characterObject.animating then
		p121:cancelAnimation()
	end

	if p121:isAiming() and p122 ~= "selector" then
		p121:setAim(false)
	end

	p121._reloadSpring.t = 1
	_characterObject.animating = true
	_characterObject:getSpring("sprintspring").t = 0
	_characterObject:getSpring("sprintspring").s = p121:getWeaponStat("unsprintspeed")
	_characterObject:getSpring("sprintspring").d = p121:getWeaponStat("unsprintdamping") or 0.9

	if p122 == "inspect" then
		local v306 = p121:getWeaponStat("altinspect")

		if v306 then
			p122 = v306
		end

		p121._inspecting = true
	end

	if p124 then
		p121._yieldToAnimation = true
		p121._bolting = true
	end

	thread:add(v34.player(p121._animData, p121:getWeaponStat("animations")[p122], p121, p122))
	thread:add(function() -- line: 1539
		-- upvalues: p123 (copy), thread (copy), v34 (copy), p121 (copy), p122 (ref), _characterObject (copy), p124 (copy), v11 (copy)
		if not p123 then
			thread:add(v34.reset(p121._animData, p121:getWeaponStat("animations")[p122].resettime or 0.5, p121:getWeaponStat("keepanimvisibility") or p121:isBlackScoped()))
		end

		thread:add(function() -- line: 1548
			-- upvalues: p121 (copy), _characterObject (copy), p124 (copy), v11 (copy)
			p121._inspecting = false
			_characterObject.animating = false

			if p124 then
				p121._yieldToAnimation = false
				p121._needRechambering = false
				p121._bolting = false

				if p121:isAiming() then
					_characterObject:getSpring("zoommodspring").t = 1
					p121._aimArmSpring.t = 1
					p121:updateAimStats()
				end
			end

			if p121:isStateReloading() then
				return
			end

			if v11.isInputActionDown("Aim Weapon Hold") and not p121:isAiming() then
				p121:setAim(true)
			end

			if _characterObject:isSprinting() then
				_characterObject:getSpring("sprintspring").s = p121:getWeaponStat("sprintspeed")
				_characterObject:getSpring("sprintspring").d = p121:getWeaponStat("sprintdamping") or 0.9
				_characterObject:getSpring("sprintspring").t = 1
			end

			p121._reloadSpring.t = 0
		end)
	end)
end
function t1.updateAimStats(p125) -- line: 1577
	-- upvalues: v18 (copy), v14 (copy), v5 (copy), v12 (copy)
	p125._characterObject:getSpring("masteraimspring").s = p125:isAiming() and p125:getActiveAimStat("aimspeed") or p125:getActiveAimStat("unaimspeed")
	p125._characterObject:getSpring("masteraimspring").t = not p125:isAiming() and 0 or 1

	local v308 = p125:isAiming() and p125:getActiveAimStat("aimspeed") or p125:getWeaponStat("unaimspeed")
	local v309 = p125:isAiming() and p125:getActiveAimStat("magnifyspeed") or p125:getWeaponStat("unmagnifyspeed")

	p125._aimArmSpring.s = v308
	v18.getActiveCamera("MainCamera")

	for v310, v311 in p125._activeAimStats do
		local v312 = not (v310 == p125._activeAimStatIndex and p125:isAiming()) and 0 or 1

		v311.sightmagspring.t = v312
		v311.sightaimspring.t = v312
		v311.sightmagspring.s = v309
		v311.sightaimspring.s = v308
	end

	p125._characterObject:setWalkSpeedMult(p125:isAiming() and p125:getActiveAimStat("aimwalkspeedmult") or 1)

	if p125:getActiveAimStat("blackscope") then
		v14.setScopeSettings(p125._activeAimStats[p125._activeAimStatIndex])
	end

	if p125:isAiming() then
		p125._characterObject.sprintDisabled = p125:getActiveAimStat("blackscope")
	else
		p125._characterObject.sprintDisabled = false
	end

	v5.updateSightMark(p125:getActiveAimStat("sightpart"), p125:getActiveAimStat("centermark"))
	v12.updateFiremode(p125)
end
function t1.boltKick(p126, p127) -- line: 1610
	local _animData = p126._animData
	local v316 = p127 / p126:getWeaponStat("bolttime") * 1.5

	p126._boltOpen = false

	if v316 > 1.5 then
		_animData[p126:getWeaponStat("bolt")].weld.C0 = p126._boltCF(0)

		return nil
	end

	if v316 > 0.5 then
		local v317 = (v316 - 0.5) * 0.5 + 0.5

		_animData[p126:getWeaponStat("bolt")].weld.C0 = p126._boltCF(1 - 4 * (v317 - 0.5) * (v317 - 0.5))

		return false
	end

	_animData[p126:getWeaponStat("bolt")].weld.C0 = p126._boltCF(1 - 4 * (v316 - 0.5) * (v316 - 0.5))

	return false
end
function t1.boltStop(p128, p129) -- line: 1627
	local _animData = p128._animData
	local v321 = p129 / p128:getWeaponStat("bolttime") * 1.5

	if v321 > 0.5 then
		_animData[p128:getWeaponStat("bolt")].weld.C0 = p128._boltCF(1)
		p128._boltOpen = true

		return true
	end

	_animData[p128:getWeaponStat("bolt")].weld.C0 = p128._boltCF(1 - 4 * (v321 - 0.5) * (v321 - 0.5))
	p128._boltOpen = false

	return false
end
function t1.shoot(p130, p131, p132) -- line: 1641
	-- upvalues: v37 (copy), v2 (copy)
	local v325 = v37.getTime()

	if p131 then
		if not p130:isEquipped() or p130:isEquipping() then
			return
		end

		if v2.roundLock then
			return
		end

		if p130._magCount <= 0 then
			p130:reload()

			return
		end

		if v325 < p130._disableUntil then
			return
		end

		if p130:isReloading() and not p130._canShoot then
			return p130:reloadCancel()
		end

		if p130:isInspecting() then
			p130._inspecting = false
			p130:cancelAnimation(p130._reloadCancelTime)
		end

		p130._characterObject:setSprint(false)

		local v326 = p130:getFiremode()

		if v326 == "BINARY" then
			v326 = 1
		elseif p132 then
			v326 = p132
		end

		if v326 == true then
			p130._auto = true
		elseif v326 == "SWITCH" then
			p130._burst = 999
		elseif v326 == "DOUBLE" or v326 == "SINGLE" then
			p130._burst = 1
		elseif p130._burst == 0 and v325 > p130._nextShot then
			p130._burst = v326
		end

		if p130:getWeaponStat("burstcam") then
			p130._auto = true
		end

		if v325 > p130._nextShot then
			p130._nextShot = v325
		end

		if p130:getWeaponStat("forcecap") and not p130._auto then
			local v327 = tonumber(v326) or 1

			p130._disableUntil = v325 + 60 / p130:getWeaponStat("firecap") * v327

			return
		end
	elseif not p130:getWeaponStat("loosefiring") then
		if p130:getWeaponStat("autoburst") and p130._auto and p130._nShots > 0 and p130:getFiremode() == true then
			p130._nextShot = v325 + 60 / p130:getWeaponStat("firecap")
		end

		p130._nShots = 0
		p130._auto = false

		if not p130:getWeaponStat("burstlock") and not p130:getWeaponStat("burstcam") and p130:getFiremode() ~= "SWITCH" then
			p130._burst = 0
		end

		if p130:isStateReloading() or p130:isEquipping() or p130:isReloadingCancelling() then
			return
		end

		if p130:getFiremode() == "BINARY" then
			if v325 > p130._nextShot then
				p130._nextShot = v325
			end

			p130._burst = 1
		end
	end
end
function t1.impulseSprings(p133, p134) -- line: 1724
	-- upvalues: v18 (copy), v5 (copy), v22 (copy)
	local v330 = v18.getActiveCamera("MainCamera")
	local v331 = v5.getCrossSize()
	local stability = p133._characterObject.stability
	local v333 = (1 - p133._firemodeStability) * (1 - stability)

	p133._spreadSpring.a = 0.5 * (1 - p134) * (1 - stability) * p133:getWeaponStat("hipfirespread") * p133:getWeaponStat("hipfirespreadrecover") * v331 / p133:getWeaponStat("crosssize") * Vector3.new(2 * math.random() - 1, 2 * math.random() - 1, 0)
	p133._chokeSpring.a = p133:getWeaponStat("variablechoke") or 0

	local v334 = p133:getWeaponStat("heatfireratekick")

	if v334 and not p133:shouldIgnoreHeatFirerate() then
		p133._heatFirerateSpring.a = v334
	end

	p133._translationSprings:applyImpulse(nil, v333)
	p133._rotationSprings:applyImpulse(nil, v333)

	local n2 = 1

	if v22.isActive(3, "mouse", "keyboard") or v22.isLastActiveDevice("mouse", "keyboard") then
		n2 = 1
	elseif v22.isActive(3, "touch") or v22.isLastActiveDevice("touch") then
		n2 = 0.75
	elseif v22.isActive(3, "controller") or v22.isLastActiveDevice("controller") then
		n2 = 0.5
	end

	v330:applyImpulse(v333 * n2)
end
function t1.fireRound(p135, p136) -- line: 1761
	-- upvalues: v18 (copy), v37 (copy), v34 (copy), v11 (copy), v41 (copy), v5 (copy), v40 (copy), v33 (copy), LocalPlayer (copy), v4 (copy), n1 (ref), v16 (copy), v21 (copy), t2 (copy), onPlayerHit (copy), v7 (copy), v23 (copy), v30 (copy), v9 (copy), v12 (copy)
	local v338 = v18.getActiveCamera("MainCamera")
	local _characterObject = p135._characterObject
	local thread = _characterObject.thread
	local u341 = nil
	local v342 = false
	local v343 = if not p135._singleactionready then p135:getFiremode() == "DOUBLE" and p135:getWeaponStat("doubleactiondelay") or (p135:getActiveAimStat("firedelay") or 0) else 0
	local v344 = p135:getActiveAimStat("recoildelay") or v343

	while p135._magCount > 0 and p135:canFire() do
		local v345 = v37.getTime()

		if p135._inspecting then
			p135._inspecting = false
			p135:cancelAnimation(p135._reloadCancelTime)
		end

		p135.threadWeapon:clear()

		if not _characterObject.reloading and p135:getWeaponStat("forceonfire") or p135._magCount > 1 and (p135:getWeaponStat("onfireanim") or p135:getWeaponStat("animations").onfire) and (not p135:isAiming() or p135:isAiming() and (not p135:getActiveAimStat("pullout") or p135:getWeaponStat("straightpull"))) then
			thread:clear()
			thread:delay(p135:getFiremode() ~= "DOUBLE" and p135:getWeaponStat("onfiredelay") or 0)
			thread:add(function() -- line: 1793
				-- upvalues: p135 (copy), _characterObject (copy)
				p135:getActiveAimStat("zoom")

				if p135:getActiveAimStat("zoompullout") or p135:getFiremode() == "SINGLE" and p135:getWeaponStat("singlepullout") then
					p135._aimArmSpring.t = p135:getWeaponStat("aimarmblend") or (not p135:getWeaponStat("straightpull") and 0 or 1)
					_characterObject:getSpring("zoommodspring").t = (not p135:isAiming() or (p135:getWeaponStat("aimspringcancel") or p135:getWeaponStat("straightpull"))) and 1 or 0.5
					p135:updateAimStats()
				end

				if not p135:getWeaponStat("ignorestanceanim") then
					p135._reloadSpring.t = 1
				end

				_characterObject.animating = true
				p135._yieldToAnimation = true
				p135._bolting = true
			end)

			local v346 = if not p135:isAiming() or not p135:getActiveAimStat("onfireaimedanim") then if p135:getFiremode() ~= "DOUBLE" then if p135:getFiremode() ~= "SINGLE" then not p135:getActiveAimStat("onfireanim") and "onfire" or "onfire" .. p135:getActiveAimStat("onfireanim") else "onfiresingle" else "onfiredouble" else "onfire" .. p135:getActiveAimStat("onfireaimedanim")
			local v347 = p135:getWeaponStat("animations")[v346]

			if p135:getFiremode() ~= "SINGLE" or p135._magCount > 1 then
				thread:add(v34.player(p135._animData, v347, p135, v346))
			end

			thread:delay(v343)
			thread:add(function() -- line: 1830
				-- upvalues: p135 (copy), _characterObject (copy), thread (copy), v34 (copy), v347 (copy), v11 (copy)
				if p135:isStateReloading() then
					return
				end

				if p135:isAiming() then
					_characterObject:getSpring("zoommodspring").t = 1
					p135._aimArmSpring.t = 1
					p135:updateAimStats()
				end

				if p135:getFiremode() ~= "SINGLE" then
					thread:add(v34.reset(p135._animData, v347.resettime, p135:getWeaponStat("keepanimvisibility") or p135:isAiming()))
				else
					p135._singleactionready = true
				end

				p135._bolting = false
				_characterObject.animating = false
				p135._yieldToAnimation = false
				p135._reloadSpring.t = 0

				if v11.isInputActionDown("Aim Weapon Hold") then
					p135:setAim(true)
				elseif not p135._auto and not p135._wasBlackScoped then
					_characterObject:setSprint(v11.isInputActionDown("Sprint Hold") or (v11.isInputActionDown("Move Forward") and _characterObject.doubletap or p135._wasSprinting))
				end

				if _characterObject:isSprinting() then
					_characterObject:getSpring("sprintspring").s = p135:getWeaponStat("sprintspeed")
					_characterObject:getSpring("sprintspring").d = p135:getWeaponStat("sprintdamping") or 0.9
					_characterObject:getSpring("sprintspring").t = 1
				end

				if p135:getWeaponStat("forcereload") and p135._magCount <= 0 and not p135:isAiming() then
					p135:reload()
				end
			end)
		elseif p135:getWeaponStat("shelloffset") then
			if not p135:getWeaponStat("caselessammo") then
				v41.ejectshell(p135._mainPart.CFrame, p135:getWeaponStat("casetype") or p135:getWeaponStat("ammotype"), p135:getWeaponStat("shelloffset"), p135:getWeaponStat("shelldirection"))
			end

			if p135._magCount > 0 then
				p135.threadWeapon:add(function(p137) -- line: 1879
					-- upvalues: p135 (copy)
					if p135._magCount <= 0 and p135:getWeaponStat("boltlock") then
						return p135:boltStop(p137)
					end

					return p135:boltKick(p137)
				end)
			end
		end

		if p135._burst ~= 0 then
			p135._burst = p135._burst - 1
		end

		v342 = true
		p135:fireInput("shoot", v345)
		task.delay(v344, function() -- line: 1898
			-- upvalues: p135 (copy), p136 (copy)
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

		local _fireCount = p135._fireCount

		task.delay(v343, function() -- line: 1914
			-- upvalues: _characterObject (copy), v338 (copy), p135 (copy), u341 (ref), v40 (copy), v33 (copy), LocalPlayer (copy), _fireCount (copy), v4 (copy), n1 (ref), v16 (copy), v21 (copy), t2 (copy), v345 (copy), onPlayerHit (copy), v7 (copy), v23 (copy), v37 (copy)
			local CFrame2 = _characterObject:getRootPart().CFrame
			local p = v338:getBaseCFrame().p
			local v474 = CFrame2 * p135._mainC0 * (p135:isAiming() and p135._activeAimOffsets[p135:getActiveAimStat("sightpart")] or p135._barrelOffset)

			if not u341 then
				local v475 = v40.raycast(p, v474.p - p, {
					v33.getTeamFolder(LocalPlayer.TeamColor),
					workspace.Terrain,
					workspace.Ignore,
					workspace.CurrentCamera
				})

				if v475 then
					u341 = v475.Position + 0.01 * v475.Normal
				else
					u341 = v474.p
				end
			end

			local t5 = {}
			local t6 = {}
			local t7 = {
				camerapos = p,
				firepos = u341,
				bullets = t6
			}
			local v479, v480 = p135._samplePointGenerator:getPoint(_fireCount)
			local v481 = p135:getWeaponStat("pelletcount") or 1
			local v482 = v4.getValue("toggleglasshacktracers") and (p135:isAiming() and (not p135:isBlackScoped() and (p135:getActiveAimStat("sightObject") and p135:getActiveAimStat("sightObject"):isApertureVisible())))

			for i = 1, v481 do
				n1 += 1

				local v484 = n1
				local unit

				if p135:getWeaponStat("variablechoke") or p135:getWeaponStat("spread") or p135:getWeaponStat("crosssize") and p135:getWeaponStat("aimchoke") then
					local v485 = p135:getWeaponStat("variablechoke") and p135._chokeSpring.p or (p135:getWeaponStat("spread") or 0.6666666666666666 * p135:getWeaponStat("crosssize") * p135:getWeaponStat("aimchoke") / p135:getWeaponStat("bulletspeed"))
					local v487, v488, v489

					repeat
						local v486 = math.sqrt((i - v480) / v481)

						v487 = v486 * math.cos((i - v479) * 2.399963229728653)
						v488 = v486 * math.sin((i - v479) * 2.399963229728653)
						v489 = v487 * v487 + v488 * v488
					until v489 <= 1.00001

					local v490 = v485 * math.sqrt(-math.log(v489) / v489)

					unit = v474:VectorToWorldSpace((Vector3.new(v490 * (p135:getWeaponStat("choke") and p135:getWeaponStat("xbias") or 1) * v487, v490 * (p135:getWeaponStat("choke") and p135:getWeaponStat("ybias") or 1) * v488, -1))).unit
				else
					unit = v474.lookVector
				end

				v16.newBullet({
					size = 0.2,
					bloom = 0.005,
					position = u341,
					velocity = p135:getWeaponStat("bulletspeed") * unit,
					acceleration = (p135:getWeaponStat("bulletaccel") or 0) * unit + v21.bulletAcceleration,
					color = p135:getWeaponStat("bulletcolor") or Color3.fromRGB(255, 94, 94),
					brightness = p135:getWeaponStat("bulletbrightness") or 400,
					life = v21.bulletLifeTime,
					visualorigin = p135._barrelPart.Position,
					physicsignore = t2,
					dt = v345 - p135._nextShot,
					penetrationdepth = p135:getWeaponStat("penetrationdepth"),
					tracerless = p135:getWeaponStat("tracerless"),
					onplayerhit = onPlayerHit,
					usingGlassHack = v482,
					extra = {
						playersHit = {},
						bulletTicket = v484,
						firstHits = t5,
						firearmObject = p135,
						uniqueId = p135.uniqueId
					},
					ontouch = v7.hitDetection
				})
				t6[#t6 + 1] = {
					unit,
					v484
				}
			end

			v23:send("newbullets", p135.uniqueId, t7, v37.getTime())

			for i = 1, #t5 do
				v23:send("bullethit", p135.uniqueId, unpack(t5[i]))
			end
		end)
		p135._fireCount = p135._fireCount + 1
		p135._magCount = p135._magCount - 1
		p135._nShots = p135._nShots + 1
		p135._singleactionready = nil
		p135:updateBeltLinks()
		thread:add(function() -- line: 2029
			-- upvalues: p135 (copy)
			p135:updateBeltLinks()
		end)

		if p135._burst <= 0 and p135:getWeaponStat("firecap") and p135:getFiremode() ~= true and p135:getFiremode() ~= 1 then
			p135._nextShot = v345 + 60 / p135:getWeaponStat("firecap")
		elseif p135:isAiming() and p135:getActiveAimStat("aimedfirerate") then
			p135._nextShot = p135._nextShot + 60 / p135:getActiveAimStat("aimedfirerate")
		else
			p135._nextShot = p135._nextShot + 60 / p135:getFirerate()
		end

		if p135._magCount <= 0 then
			p135._burst = 0
			p135._auto = false
			task.delay(v343, function() -- line: 2047
				-- upvalues: p135 (copy)
				if p135:getWeaponStat("magdisappear") then
					p135:getWeaponPart(p135:getWeaponStat("mag")).Transparency = 1
				end

				if (not p135:getActiveAimStat("pullout") and not p135:getActiveAimStat("blackscope") or not p135:isAiming()) and (p135:getWeaponStat("firemodes")[1] == true or not p135:isAiming()) then
					p135:reload()
				end
			end)
		end
	end

	if v342 then
		task.delay(v343, function() -- line: 2060
			-- upvalues: p135 (copy), v30 (copy), v4 (copy), v41 (copy), _characterObject (copy), v9 (copy), v12 (copy)
			task.delay(0.4, function() -- line: 2062
				-- upvalues: p135 (copy), v30 (copy)
				if p135:getWeaponStat("type") == "SNIPER" then
					v30.play("metalshell", 12, 0.15, 0.8)

					return
				end

				if p135:getWeaponStat("type") == "SHOTGUN" then
					task.wait(0.3)
					v30.play("shotgunshell", 12, 0.2)

					return
				end

				if p135:getWeaponStat("type") ~= "REVOLVER" and not p135:getWeaponStat("caselessammo") then
					v30.play("metalshell", 12, 0.1)
				end
			end)

			if p135:getWeaponStat("sniperbass") then
				v30.play("1PsniperBass", 1, 0.75)
				v30.play("1PsniperEcho", 1, 1)
			end

			if not p135:getWeaponStat("nomuzzleeffects") then
				if v4.getValue("firstpersonmuzzleffectsenabled") then
					v41.muzzleflash(p135._barrelPart, p135:getWeaponStat("hideflash"), 0.9)
				end

				if not p135:getWeaponStat("hideflash") then
					_characterObject:fireMuzzleLight()
				end
			end

			if not p135:getWeaponStat("hideminimap") then
				v9.goingLoud()
			end

			v30.playSoundId(p135:getWeaponStat("firesoundid"), 2, p135:getWeaponStat("firevolume"), p135:getWeaponStat("firepitch"), p135._barrelPart, nil, 0, 0.05)
			v12.updateAmmo(p135)
		end)
	end
end
function t1.stepAttachments(p138, p139) -- line: 2100
	for _, v352 in p138._activeComponents do
		v352:step(p139)
	end
end
function t1.stepStateMachines(p140, _) -- line: 2106
	-- upvalues: v37 (copy)
	local _characterObject = p140._characterObject
	local v356 = v37.getTime()
	local v357 = p140:getWeaponStat("equiptime") or (p140:getAnimation("equipping") and p140:getAnimLength("equipping") or 0.2)
	local v358 = p140:getWeaponStat("unequiptime") or (p140:getAnimation("unequipping") and p140:getAnimLength("unequipping") or 0.2)

	if p140:stateTimeCheck("equipping", v357, v356) then
		p140:setFlag("equipFlag", v356)
	elseif p140:stateTimeCheck("unequipping", v358, v356) then
		p140:setFlag("unequipFlag", v356)
	end

	if p140:isState("unchambered") then
		if p140._magCount > 0 and ((not p140:getActiveAimStat("pullout") or not p140:isAiming() or p140:getWeaponStat("straightpull")) and p140:stateTimeCheck("unchambered", 0.1, v356) and p140:isSteadyState()) then
			p140:fireInput("chamberStart", v356)

			return
		end
	else
		if p140:animationStateCheck("chambering", "onfire", v356) then
			p140:fireInput("chamberFinish", v356)

			return
		end

		if p140:isStateReloading() then
			_characterObject:getSpring("sprintspring").s = p140:getWeaponStat("unsprintspeed")
			_characterObject:getSpring("sprintspring").d = p140:getWeaponStat("unsprintdamping") or 0.9
			_characterObject:getSpring("sprintspring").t = 0

			local v359 = p140:getCurrentReloadFile()

			if v359 and (p140:animationStateCheck("chamberedReloading", v359.reloadName, v356) or p140:animationStateCheck("unchamberedReloading", v359.reloadName, v356)) then
				p140:fireInput("reloadFinish", v356)

				return
			end
		else
			if p140:stateTimeCheck("chamberedReloadCancelling", p140._reloadCancelTime, v356) or p140:stateTimeCheck("unchamberedReloadCancelling", p140._reloadCancelTime, v356) then
				p140:fireInput("reloadCancelFinish", v356)

				return
			end

			if p140:stateTimeCheck("chamberCancelling", p140._reloadCancelTime, v356) or p140:stateTimeCheck("chamberedReloadCancelResetting", p140._reloadCancelTime, v356) or p140:stateTimeCheck("unchamberedReloadCancelResetting", p140._reloadCancelTime, v356) then
				p140:fireInput("reloadResume", v356)

				return
			end

			if p140:stateTimeCheck("chamberCancelling", p140._reloadCancelTime, v356) then
				p140:fireInput("chamberCancelFinish", v356)
			end
		end
	end
end
function t1.step(p142, p143) -- line: 2161
	-- upvalues: v18 (copy), v36 (copy), v14 (copy), v11 (copy), v44 (copy)
	local v362 = v18.getActiveCamera("MainCamera")
	local _characterObject = p142._characterObject
	local basec0 = p142._animData.larm.basec0
	local v365 = basec0:ToObjectSpace(p142._animData.larm.weld.C0)
	local basec0_2 = p142._animData.rarm.basec0
	local v367 = basec0_2:ToObjectSpace(p142._animData.rarm.weld.C0)
	local vector3 = Vector3.new(0, 0, 0)
	local vector3_2 = Vector3.new(0, 0, 0)
	local vector3_3 = Vector3.new(0, 0, 0)
	local vector3_4 = Vector3.new(0, 0, 0)
	local vector3_5 = Vector3.new(0, 0, 0)
	local vector3_6 = Vector3.new(0, 0, 0)

	p142._blackScoped = false

	local n3 = 0

	for _, v376 in p142:getActiveAimStats() do
		local _ = v376.sightmagspring.p
		local p = v376.sightaimspring.p

		vector3 += p * v376.aimoffsetp
		vector3_2 += p * v376.aimoffsetr
		vector3_3 += p * v376.larmaimoffsetp
		vector3_4 += p * v376.larmaimoffsetr
		vector3_5 += p * v376.rarmaimoffsetp
		vector3_6 += p * v376.rarmaimoffsetr
		n3 += p

		if v376.blackscope and p > v376.scopebegin then
			p142._blackScoped = true
		end
	end

	local v379 = vector3_3 + (1 - n3) * basec0.p
	local v380 = vector3_4 + (1 - n3) * v36.toAxisAngle(basec0)
	local v381 = vector3_5 + (1 - n3) * basec0_2.p
	local v382 = vector3_6 + (1 - n3) * v36.toAxisAngle(basec0_2)
	local p = _characterObject:getSpring("equipspring").p
	local p2 = _characterObject:getSpring("crouchspring").p
	local p3 = _characterObject:getSpring("pronespring").p
	local v386 = math.max(_characterObject:getSpring("walkspeedspring").p, 0.1)

	p142._sprintPoseSpring.t = math.min(_characterObject:getSpring("truespeedspring").p / v386 * _characterObject:getSpring("sprintspring").p, 1)

	local p4 = p142._sprintPoseSpring.p
	local v388 = p142:getActiveAimStat("blackscope") and 1 - n3 * 0.8 or (p142:getActiveAimStat("midscope") and 1 - n3 * 0.6 or 1 - n3 * 0.4)
	local v389 = p142:getActiveAimStat("blackscope") and 1 - n3 * 0.9 or (p142:getActiveAimStat("midscope") and 1 - n3 * 0.8 or 1 - n3 * 0.7)
	local v390 = v388 * (p142:isAiming() and p142:getWeaponStat("aimswingmod") or (p142:getWeaponStat("swingmod") or 1))
	local v391 = v389 * (p142:isAiming() and p142:getWeaponStat("aimswingmod") or (p142:getWeaponStat("swingmod") or 1))
	local v392 = v36.fromAxisAngle(v380) + v379
	local v393 = v36.fromAxisAngle(v382) + v381
	local v394 = v36.fromAxisAngle(vector3_2) + vector3
	local weldC0 = p142._animData[p142:getWeaponStat("mainpart")].weld.C0
	local v396 = p142._sprintCF(0)
	local v397 = p142._sprintCF(1)
	local v398 = p142:getWeaponStat("equipoffset")
	local p5 = p142._aimArmSpring.p
	local v400 = math.min(n3, (1 + p5) / 2)
	local v401 = p142:getWeaponStat("aimanimposmult") or Vector3.new(0.25, 0.25, 1)
	local v402 = p142:getWeaponStat("aimanimangmult") or Vector3.new(0.25, 0.25, 1)
	local v403 = shared.require("CFrameMath")
	local v404, v405 = v403.toAxisAngle(weldC0)
	local v406 = v403.fromAxisAngle(v402 * v404, v401 * v405)
	local v407 = (v396 * weldC0):Lerp(v394 * v406, v400):Lerp(v397, p4):Lerp(v398, p)
	local v408 = (p142:getWeaponStat("swaypivotoffsethip") or Vector3.new(0, 0, 0)):Lerp(p142:getWeaponStat("swaypivotoffsetaim") or Vector3.new(0, 0, 0), n3)
	local v409 = CFrame.new(0, 0.5, 0) + v408
	local v410 = p142:getWeaponStat("walkswayamphipmult") or 0.7
	local v411 = p142:getWeaponStat("walkswayampaimmult") or 0.4
	local v412 = p142:getWeaponStat("walkswayrothipmult") or 1
	local v413 = p142:getWeaponStat("walkswayrotaimmult") or 0.2
	local v414 = v410 * (1 - n3) + v411 * n3
	local v415 = v412 * (1 - n3) + v413 * n3
	local v416 = _characterObject:getRootPart().CFrame:inverse() * v362:getShakeCFrame() * p142._mainOffset * p142._climbCF(_characterObject:getSpring("climbing").p) * CFrame.new(v407.p) * v409 * _characterObject.sway:getSwayCFrame(v390, v391) * v409:inverse() * p142:computeWalkSway(v414, v415) * p142:computeGunSway(n3) * p142._proneCF(p3 * (1 - n3)):Lerp(CFrame.identity, p142._reloadSpring.p):Lerp(CFrame.identity, p) * p142._crouchCF(p2):Lerp(CFrame.identity, p142._reloadSpring.p):Lerp(CFrame.identity, n3):Lerp(CFrame.identity, p) * v36.fromAxisAngle(p142._spreadSpring.p) * CFrame.new(p142._translationSprings:getP()) * v36.fromAxisAngle(p142._rotationSprings:getP()) * (v407 - v407.p)

	p142._mainC0 = v416
	p142._mainWeld.C0 = v416

	local v417, v418 = _characterObject:getArmWelds()

	v417.C0 = v416 * (basec0:Lerp(v392, p5) * v365):Lerp(p142:getWeaponStat("larmsprintoffset"), p4)
	v418.C0 = v416 * (basec0_2:Lerp(v393, p5) * v367):Lerp(p142:getWeaponStat("rarmsprintoffset"), p4)
	p142.threadWeapon:step()

	if _characterObject:getSpring("climbing").t == 1 and p142:isAiming() then
		p142:setAim(false)
	end

	local v419 = v14.getSteadySize()
	local v420 = _characterObject:getMovementMode()

	if p142._blackScoped then
		local v421 = p142:getActiveAimStat("swayamp") or 0

		if v420 == "stand" then
			v421 *= p142:getActiveAimStat("standswayampmult") or 1
		end

		v362:setSway(v421)

		if p142:getActiveAimStat("breathspeed") then
			if v419 < 1 and (v11.isInputActionDown("Steady Scope") or p142._steadyToggle) then
				v362:setSwaySpeed(v420 == "stand" and p142:getActiveAimStat("standsteadyspeed") or 0)
				v14.setSteadyBar(UDim2.new(v419 < 1 and v419 + p143 * 60 * p142:getActiveAimStat("breathspeed") or v419, 0, 1, 0))
			else
				p142._steadyToggle = false

				local v422 = p142:getActiveAimStat("swayspeed") or 1

				if v420 == "stand" then
					v422 *= p142:getActiveAimStat("standswayspeedmult") or 1
				end

				v362:setSwaySpeed(v422)
				v14.setSteadyBar(UDim2.new(v419 > 0 and v419 - p143 * 60 * p142:getActiveAimStat("recoverspeed") or 0, 0, 1, 0))
			end
		end
	else
		if not p142:isAiming() then
			p142._steadyToggle = false
		end

		v362:setSwaySpeed(0)
		v14.setSteadyBar(UDim2.new(v419 > 0 and v419 - p143 * 60 * (p142:getActiveAimStat("recoverspeed") or 0.005) or 0, 0, 1, 0))
	end

	p142:updateScope()
	p142:stepStateMachines(p143)
	p142:stepAttachments(p143)
	p142:fireRound(n3)
	p142._translationSprings:step()
	p142._rotationSprings:step()
	p142.fixedTimeStepper:step()

	if v44 and p142._forceHidden then
		p142:hideModel()
	end
end
function t1.processInputDown(p144, p145) -- line: 2355
	-- upvalues: v11 (copy), v2 (copy), v22 (copy)
	if v11.isInputAction(p145, "Shoot Weapon") then
		p144:shoot(true)
	end

	if v11.isInputAction(p145, "Aim Weapon Hold") then
		p144:setAim(true)
	end

	if v11.isInputAction(p145, "Reload Weapon") then
		p144:reload()
	end

	if v11.isInputAction(p145, "Alt Aim Weapon Toggle") then
		p144:toggleSight()
	end

	if v11.isInputAction(p145, "Aim Weapon Toggle") then
		if p144:isInspecting() then
			p144:cancelAnimation()
		end

		p144:setAim(not p144:isAiming())
	end

	if v11.isInputAction(p145, "Inspect Weapon") then
		if p144._characterObject.spotting then
			return
		end

		if p144:isBlackScoped() or p144:isInspecting() then
			return
		end

		p144:playAnimation("inspect")
	end

	if v2.roundLock then
		return
	end

	if v11.isInputAction(p145, "Steady Toggle") and p144:isAiming() and p144:isBlackScoped() then
		p144._steadyToggle = not p144._steadyToggle
	end

	if v11.isInputAction(p145, "Interact Action") then
		p144:toggleNextFiremode()
	end

	if p145 == "MouseButton2" then
		v22.lockFirstPerson()
	end
end
function t1.processInputUp(p146, p147) -- line: 2405
	-- upvalues: v11 (copy)
	if v11.isInputAction(p147, "Shoot Weapon") then
		p146:shoot(false)
	end

	if v11.isInputAction(p147, "Aim Weapon Hold") then
		p146:setAim(false)
	end
end
function t1.processTouchInput(p148, p149, p150, ...) -- line: 2414
	local v430 = p149:getActionType()

	if v430 == "shoot" then
		if p149:getOption("aimOnPressed") then
			if p150 == "pressed" then
				local v431 = p148:isAiming()

				p149:setFlag("wasAiming", v431)

				if not v431 then
					if p148:isInspecting() then
						p148:cancelAnimation()
					end

					p148:setAim(true)
				end
			elseif not p149:getFlag("wasAiming") then
				p148:setAim(false)
			end
		end

		if p149:getOption("steadyScopeOnPressed") then
			if p150 == "pressed" then
				p148._steadyToggle = true
			else
				p148._steadyToggle = false
			end
		end

		local v432 = p149:getOption("singleFireOnRelease")

		if p148:getFiremode() ~= "BINARY" and v432 then
			if p150 == "released" then
				p148:shoot(true, 1)

				return
			end
		else
			if p150 == "pressed" then
				p148:shoot(true)

				return
			end

			if p150 == "released" or p150 == "canceled" then
				p148:shoot(false)

				return
			end
		end
	elseif v430 == "aim" then
		if p149:getOption("hold") then
			if p150 == "pressed" then
				p148:setAim(true)

				return
			end

			if p150 == "released" or p150 == "canceled" then
				p148:setAim(false)

				return
			end
		elseif p150 == "activated" then
			if p148:isInspecting() then
				p148:cancelAnimation()
			end

			p148:setAim(not p148:isAiming())

			return
		end
	elseif v430 == "reload" then
		if p150 == "activated" then
			p148:reload()

			return
		end
	elseif v430 == "inspect" then
		if p150 == "activated" then
			if p148._characterObject.spotting then
				return
			end

			if p148:isInspecting() then
				return
			end

			p148:playAnimation("inspect")

			return
		end
	elseif v430 == "steadyScope" then
		if p149:getOption("hold") then
			if p150 == "pressed" then
				p148._steadyToggle = true

				return
			end

			p148._steadyToggle = false

			return
		end

		if p150 == "activated" then
			p148._steadyToggle = not p148._steadyToggle

			return
		end
	elseif v430 == "altAim" and p150 == "activated" then
		p148:toggleSight()
	end
end
function t1._logStateTransition(p151, _, p153, p154) -- line: 2511
	p151._stateChangeTimes[p153] = p154
end
function t1._processEquipStateChange(p155, _, p157, _) -- line: 2515
	-- upvalues: v18 (copy), v11 (copy), v43 (copy), v30 (copy), v23 (copy), v37 (copy), v5 (copy), v34 (copy), currentCamera (copy), v41 (copy)
	local v441 = v18.getActiveCamera("MainCamera")
	local _characterObject = p155._characterObject

	if p157 == "equipped" then
		if v11.isInputActionDown("Aim Weapon Hold") then
			p155:setAim(true)
		end

		if _characterObject:isSprinting() then
			_characterObject:getSpring("sprintspring").s = p155:getWeaponStat("sprintspeed")
			_characterObject:getSpring("sprintspring").d = p155:getWeaponStat("sprintdamping") or 0.9
			_characterObject:getSpring("sprintspring").t = 1
		end

		p155:updateBeltLinks()

		return
	end

	if p157 == "equipping" then
		_characterObject:setBaseWalkSpeed(p155:getWeaponStat("walkspeed"))
		_characterObject:getSpring("zoommodspring").s = p155:getActiveAimStat("aimspeed")
		_characterObject:getSpring("zoommodspring").t = 0
		_characterObject:getSpring("sprintspring").s = p155:getWeaponStat("sprintspeed")
		_characterObject:getSpring("sprintspring").d = p155:getWeaponStat("sprintdamping") or 0.9
		_characterObject:getSpring("equipspring").s = p155:getWeaponStat("equipspeed")
		_characterObject:getSpring("equipspring").d = p155:getWeaponStat("equipdamping") or 0.75
		_characterObject:getSpring("equipspring").p = 1
		_characterObject:getSpring("equipspring").t = 0
		v441:getSpring("swayspring").s = p155:getActiveAimStat("steadyspeed") or 4
		v441:setSwaySpeed(p155:getActiveAimStat("swayspeed") or 1)
		v441:setSway(0)

		if p155:getWeaponStat("simpleswayparameters") then
			local v443 = v43.swayParametersToConfig(p155:getWeaponStat("simpleswayparameters"))

			_characterObject.sway:setConfig(v443)
		elseif p155:getWeaponStat("swayparameters") then
			_characterObject.sway:setConfig(p155:getWeaponStat("swayparameters"))
		else
			_characterObject.sway:setConfig(v43.config)
		end

		v441:setBodyParameters(p155._recoilParameters.hipCameraBody, p155._recoilParameters.aimCameraBody, p155._recoilParameters.hipCameraBodyRecovery, p155._recoilParameters.aimCameraBodyRecovery)
		v441:setHeadParameters(p155._recoilParameters.hipCameraHead, p155._recoilParameters.aimCameraHead, p155._recoilParameters.hipCameraHeadRecovery, p155._recoilParameters.aimCameraHeadRecovery)
		p155._aimArmSpring.s = p155:getActiveAimStat("aimspeed")
		p155._reloadSpring.t = 0
		v30.play("equipCloth", 11, 0.25)
		v30.play("equipGear", 11, 0.1)
		v23:send("equip", p155.weaponIndex, v37.getTime())
		p155:setAim(false)
		p155:updateAimStats()
		p155:updateFiremodeStability()
		p155._inspecting = false

		for _, child in p155._mainPart:GetChildren() do
			if child:IsA("Weld") and (not child.Part1 or child.Part1.Parent ~= p155._weaponModel) then
				child:Destroy()
			end
		end

		p155._mainWeld.Part0 = _characterObject:getRootPart()
		p155._mainWeld.Part1 = p155._mainPart
		p155._mainWeld.Parent = p155._mainPart
		_characterObject.thread:clear()
		_characterObject.reloading = false

		if p155._boltOpen then
			p155._animData[p155:getWeaponStat("bolt")].weld.C0 = p155._boltCF(1)
		else
			p155._animData[p155:getWeaponStat("bolt")].weld.C0 = p155._boltCF(0)
		end

		local v446 = p155:getWeaponStat("crossstyle")

		if not v446 then
			local v447 = p155:getWeaponStat("type")

			v446 = if v447 ~= "SHOTGUN" then v447 ~= "KNIFE" and "Cross" or "Dot" else "Shot"
		end

		v5.setCrossSettings(v446, p155:getWeaponStat("crosssize"), p155:getWeaponStat("crossspeed"), p155:getWeaponStat("crossdamper"), p155:getActiveAimStat("sightpart"), p155:getActiveAimStat("centermark"))
		_characterObject.thread:add(v34.reset(p155._animData, 0, p155:getWeaponStat("keepanimvisibility")))
		_characterObject.thread:add(function() -- line: 2624
			-- upvalues: p155 (copy), currentCamera (copy)
			p155._weaponModel.Parent = currentCamera
			p155:updateBeltLinks()
		end)

		return
	end

	if p157 == "unequipped" then
		p155._mainWeld.Part1 = nil

		if p155._weaponModel then
			p155._weaponModel.Parent = nil
		end

		p155._yieldToAnimation = false
		_characterObject.animating = false

		return
	end

	if p157 == "unequipping" then
		for _, child in p155._barrelPart:GetChildren() do
			if child:IsA("Sound") then
				child:Stop()
			end
		end

		p155._auto = false

		if not p155:getWeaponStat("burstcam") then
			p155._burst = 0
		end

		if p155:isAiming() then
			p155:setAim(false)
		end

		p155._inspecting = false
		_characterObject.reloading = false
		_characterObject:getSpring("equipspring").t = 1
		_characterObject:getSpring("equipspring").s = p155:getWeaponStat("unequipspeed") or p155:getWeaponStat("equipspeed") * 2
		_characterObject:getSpring("equipspring").d = p155:getWeaponStat("unequipdamping") or 0.75

		if _characterObject.animating then
			_characterObject.thread:clear()
			_characterObject.thread:add(v34.reset(p155._animData, 0.1, p155:getWeaponStat("keepanimvisibility")))
		end

		v41.applyeffects(p155:getWeaponStat("effectsettings"), false)
	end
end
function t1._processChamberStateChange(p159, _, p161, _) -- line: 2665
	-- upvalues: v11 (copy), v34 (copy)
	local v454 = p159:getWeaponStat("animations")
	local _characterObject = p159._characterObject
	local _ = p159._animData
	local thread = _characterObject.thread

	if p161 == "chambering" then
		if p159._needRechambering then
			local v458 = p159:getFiremode() == "SINGLE"

			if p159._needRechambering == "onfire" then
				p159:playAnimation("onfire", v458, true)

				return
			end

			if v454.pullbolt then
				p159:playAnimation("pullbolt", v458, true)

				return
			end

			warn(string.format("Missing animation pullbolt on %s", p159.weaponName))

			return
		end
	elseif p161 == "chambered" then
		thread:add(function() -- line: 2686
			-- upvalues: v11 (copy), p159 (copy)
			if v11.isInputActionDown("Aim Weapon Hold") then
				p159:setAim(true)
			end
		end)
		p159._boltOpen = false

		if p159._canShoot then
			p159._canShoot = false
			_characterObject.animating = false
			_characterObject.reloading = false

			return
		end
	else
		if p161 == "unchambered" then
			return
		end

		if p161 == "chamberCancelling" then
			if _characterObject.animating then
				thread:clear()
				thread:add(v34.reset(p159._animData, p159._reloadCancelTime, p159:getWeaponStat("keepanimvisibility")))
			end

			_characterObject.animating = false
			_characterObject.reloading = false

			return
		end

		if p161 == "chamberedReloading" or p161 == "unchamberedReloading" then
			local v459 = p159:getCurrentReloadFile()

			if not v459 then
				error(string.format("No reload file found for %s (%s)", p159, p161))
			end

			local reloadName = v459.reloadName

			_characterObject.animating = true
			_characterObject.reloading = true
			p159._yieldToAnimation = false
			p159._burst = 0
			p159._auto = false
			p159._inspecting = false
			p159._reloadSpring.t = 1

			if not v454[reloadName] then
				warn(script.Name .. ": Missing", reloadName, "animations for", p159.weaponName)
			end

			thread:add(v34.player(p159._animData, v454[reloadName], p159, reloadName))

			return
		end

		if p161 == "chamberedReloadCancelling" or p161 == "unchamberedReloadCancelling" then
			if p161 == "unchamberedReloadCancelling" then
				p159._needRechambering = true
			end

			thread:clear()
			thread:add(v34.reset(p159._animData, p159._reloadCancelTime, p159:getWeaponStat("keepanimvisibility")))
			_characterObject.reloading = false
			_characterObject.animating = false
			thread:add(function() -- line: 2740
				-- upvalues: _characterObject (copy), p159 (copy), v11 (copy)
				_characterObject.animating = false
				p159._yieldToAnimation = false
				_characterObject:setSprint(v11.isInputActionDown("Sprint Hold") or (v11.isInputActionDown("Move Forward") and _characterObject.doubletap or p159._wasSprinting))

				if _characterObject:isSprinting() then
					_characterObject:getSpring("sprintspring").s = p159:getWeaponStat("sprintspeed")
					_characterObject:getSpring("sprintspring").d = p159:getWeaponStat("sprintdamping") or 0.9
					_characterObject:getSpring("sprintspring").t = 1
				end

				if v11.isInputActionDown("Aim Weapon Hold") then
					p159:setAim(true)
				end

				p159:updateBeltLinks()
			end)

			return
		end

		if p161 == "chamberedReloadCancelResetting" or p161 == "unchamberedReloadCancelResetting" then
			_characterObject.reloading = false
			_characterObject.animating = false
			thread:clear()
			thread:add(v34.reset(p159._animData, p159._reloadCancelTime, p159:getWeaponStat("keepanimvisibility")))
			task.delay(function() -- line: 2766
				-- upvalues: p159 (copy)
				p159:updateBeltLinks()
			end)
		end
	end
end
function t1._printStates(p163) -- line: 2772
	print("FirearmObject: ", p163.weaponName, "Equipped state:", p163._equipState:getState())
	print("FirearmObject: ", p163.weaponName, "Chambered state:", p163._chamberState:getState())
	print(p163._characterObject.animating, p163._yieldToAnimation, p163._characterObject:getSpring("sprintspring").t)
end

return t1