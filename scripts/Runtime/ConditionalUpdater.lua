-- SharedModules.Utilities.Runtime.ConditionalUpdater

local t1 = {}

t1.__index = t1

local v2 = shared.require("HeartbeatUpdater")

function t1.new(p1, p2) -- line: 15
	-- upvalues: t1 (copy)
	local self = setmetatable({}, t1)

	self._updateFunc = p1
	self._stopFunc = p2
	self._disconnection = nil

	return self
end
function t1.Destroy(p3) -- line: 26
	if p3._disconnection then
		p3._disconnection()
	end
end
function t1.start(p4) -- line: 32
	-- upvalues: v2 (copy)
	if p4._disconnection then
		p4._disconnection()
		p4._disconnection = nil
	end

	p4._disconnection = v2:add(function() -- line: 39
		-- upvalues: p4 (copy)
		p4._updateFunc()

		if p4._stopFunc and p4._stopFunc() then
			p4._disconnection()
			p4._disconnection = nil
		end
	end, 10)
end

return t1

