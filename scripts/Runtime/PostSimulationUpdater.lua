-- SharedModules.Utilities.Runtime.PostSimulationUpdater

local t1 = {}

t1.__index = t1

local v2 = shared.require("DependencyTaskStepper")
local v3 = shared.require("OrderedFuncStepper")

function t1.new() -- line: 17
	-- upvalues: t1 (copy), v2 (copy), v3 (copy)
	local self = setmetatable({}, t1)

	self._dependencyTaskStepper = v2.new()
	self._dependencyTaskStepper:lock()
	self._orderedFuncStepper = v3.new()
	game:GetService("RunService").PostSimulation:connect(function(p1) -- line: 26
		-- upvalues: self (copy)
		self._dependencyTaskStepper:step(p1)
		self._orderedFuncStepper:step(p1)
	end)

	return self
end
function t1.add(p2, ...) -- line: 34
	return p2._orderedFuncStepper:addFunc(...)
end
function t1.addTask(p3, ...) -- line: 38
	return p3._dependencyTaskStepper:addTask(...)
end
function t1.lock(p4) -- line: 42
	p4._dependencyTaskStepper:lock()
end
function t1.unlock(p5) -- line: 46
	p5._dependencyTaskStepper:unlock()
end

return t1.new()

