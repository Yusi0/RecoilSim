-- SharedModules.Utilities.Runtime.RenderSteppedUpdater

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
	self._lastStepTime = os.clock()
	game:GetService("RunService").RenderStepped:connect(function() -- line: 28
		-- upvalues: self (copy)
		local elapsed = os.clock()
		local v10 = elapsed - self._lastStepTime

		self._lastStepTime = elapsed
		self._orderedFuncStepper:step(v10)
		self._dependencyTaskStepper:step(v10)
	end)

	return self
end
function t1.add(p1, ...) -- line: 41
	return p1._orderedFuncStepper:addFunc(...)
end
function t1.addTask(p2, ...) -- line: 45
	return p2._dependencyTaskStepper:addTask(...)
end
function t1.lock(p3) -- line: 49
	p3._dependencyTaskStepper:lock()
end
function t1.unlock(p4) -- line: 53
	p4._dependencyTaskStepper:unlock()
end

return t1.new()