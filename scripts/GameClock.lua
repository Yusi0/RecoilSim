ClientModules.Network.GameClock

local t1 = {}
local v2 = shared.require("NetworkClient")
local u3 = nil
local elapsed = nil

function t1.isReady() -- line: 6
	-- upvalues: v2 (copy)
	return v2:timeSyncReady()
end
function t1.getTime() -- line: 10
	-- upvalues: u3 (ref), elapsed (ref), v2 (copy)
	if u3 then
		return u3 + (os.clock() - elapsed)
	end

	return v2:getTime()
end
function t1.setReplayOffset(_, p2) -- line: 17
	-- upvalues: elapsed (ref), u3 (ref)
	elapsed = os.clock()
	u3 = p2
end

return t1
