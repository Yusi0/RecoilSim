--[[
    PFCaptureHarness.lua

    Roblox Studio Luau Telemetry Capture Harness for Phantom Forces Zero-Variance Cross-Validation (Phase A).
    
    Instructions:
    1. Run this script in Roblox Studio Command Bar or via execute_luau MCP tool during Playtest.
    2. It zeroes out impulseVariance in C25 weapon data (Phase A Zero-Variance Mode).
    3. Samples high-frequency internal spring states, CFrames, and firing timestamps.
    4. Serializes output to JSON for RecoilSim automated comparison tests.
--]]

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")

local PFCaptureHarness = {}
PFCaptureHarness.__index = PFCaptureHarness

-- Helper to zero out impulseVariance in recoil table (Phase A Zero-Variance Mode)
local function setZeroVariance(recoilData)
	if type(recoilData) ~= "table" then return end
	for _, v in pairs(recoilData) do
		if type(v) == "table" then
			if type(v[1]) == "table" and #v[1] >= 4 then
				for _, layer in ipairs(v) do
					if type(layer) == "table" and #layer >= 4 then
						layer[4] = 0.0 -- Set variance to 0
					end
				end
			else
				setZeroVariance(v)
			end
		end
	end
end

-- Helper to convert CFrame to flat 12-element array [r00, r01, r02, r10, r11, r12, r20, r21, r22, px, py, pz]
local function cframeToArray(cf)
	if not cf then return {1,0,0,0,1,0,0,0,1, 0,0,0} end
	local px, py, pz, r00, r01, r02, r10, r11, r12, r20, r21, r22 = cf:GetComponents()
	return { r00, r01, r02, r10, r11, r12, r20, r21, r22, px, py, pz }
end

-- Helper to convert Vector3 to array [x, y, z]
local function vectorToArray(vec)
	if not vec then return {0, 0, 0} end
	return { vec.X, vec.Y, vec.Z }
end

function PFCaptureHarness.new(firearmObject, mainCameraObject, options)
	options = options or {}
	local self = setmetatable({}, PFCaptureHarness)

	self.firearm = firearmObject
	self.camera = mainCameraObject
	self.testName = options.testName or "C25_PhaseA_Test"
	self.aimState = options.aimState or "ADS"
	self.stance = options.stance or "stand"
	self.device = options.device or "mouse"

	self.telemetry = {
		metadata = {
			weaponName = firearmObject._weaponData and firearmObject._weaponData.name or "C25",
			testName = self.testName,
			phase = "PhaseA_ZeroVariance",
			timestamp = os.time(),
			aimState = self.aimState,
			stance = self.stance,
			device = self.device
		},
		shots = {},
		frameSamples = {}
	}

	self.recording = false
	self.connection = nil
	self.startTime = 0

	-- Enforce Zero-Variance Mode on weapon recoil data
	if firearmObject._weaponData and firearmObject._weaponData.recoil then
		setZeroVariance(firearmObject._weaponData.recoil)
	end

	return self
end

function PFCaptureHarness:startRecording()
	self.recording = true
	self.startTime = workspace:GetServerTimeNow()

	self.connection = RunService.Heartbeat:Connect(function()
		if not self.recording then return end

		local now = workspace:GetServerTimeNow() - self.startTime
		local firearm = self.firearm
		local cam = self.camera

		local sample = {
			time = now,
			aimProgress = firearm._aimSpring and firearm._aimSpring.p or 0,
			springs = {
				translation_p = vectorToArray(firearm._translationSprings and firearm._translationSprings:getP() or Vector3.zero),
				rotation_p = vectorToArray(firearm._rotationSprings and firearm._rotationSprings:getP() or Vector3.zero),
				cameraBody_p = vectorToArray(cam._cameraBodySprings and cam._cameraBodySprings:getP() or Vector3.zero),
				cameraHead_p = vectorToArray(cam._cameraHeadSprings and cam._cameraHeadSprings:getP() or Vector3.zero),
				spread_p = vectorToArray(firearm._spreadSpring and firearm._spreadSpring.p or Vector3.zero)
			},
			cframes = {
				v185 = cframeToArray(cam:getBaseCFrame()),
				v186 = cframeToArray(cam._shakeCFrame),
				shakeCFrame = cframeToArray(cam._shakeCFrame),
				mainC0 = cframeToArray(firearm._mainC0),
				v187 = cframeToArray(workspace.CurrentCamera and workspace.CurrentCamera.CFrame)
			},
			state = {
				nextShotTime = firearm._nextShot or 0,
				firemodeStability = firearm._firemodeStability or 0
			}
		}

		table.insert(self.telemetry.frameSamples, sample)
	end)
end

function PFCaptureHarness:recordShot(shotInfo)
	local now = workspace:GetServerTimeNow() - self.startTime
	table.insert(self.telemetry.shots, {
		fireCount = shotInfo.fireCount or #self.telemetry.shots,
		fireTimestamp = now,
		recoilImpulseTimestamp = now + (shotInfo.recoildelay or 0),
		shotGenerateTimestamp = now + (shotInfo.firedelay or 0),
		capturedAimProgress = shotInfo.aimProgress or (self.firearm._aimSpring and self.firearm._aimSpring.p or 0),
		shotOutputs = {
			v474 = cframeToArray(shotInfo.v474),
			origin = vectorToArray(shotInfo.origin),
			direction = vectorToArray(shotInfo.direction)
		}
	})
end

function PFCaptureHarness:stopRecording()
	self.recording = false
	if self.connection then
		self.connection:Disconnect()
		self.connection = nil
	end
end

function PFCaptureHarness:exportJSON()
	return HttpService:JSONEncode(self.telemetry)
end

return PFCaptureHarness
