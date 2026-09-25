-- SharedModules.Weapons.StatModifierInterface

--!native
local t1 = {}
local v2 = shared.require("StatModifierUtils")
local v3 = shared.require("LuaUtils")

function t1.compileModifiers(p1, p2) -- line: 7
	-- upvalues: v3 (copy), v2 (copy)
	local v6 = v3.deepCopy(p1)

	for _, v8 in v2.modifierTypeOrder do
		local v9 = p2[v8]

		if v9 then
			v2.operators[v8](v6, v9)
		end
	end

	return v6
end

return t1

--------------------------------------------------------------------------------
-- SharedModules.Weapons.StatModifierUtils

--!native
local t1 = {}
local t2 = {}

local function cloneValue(p1) -- line: 7
	if type(p1) == "table" then
		return table.clone(p1)
	end

	return p1
end
local function resolveKey(p2, p3) -- line: 15
	if type(p3) == "number" and p3 < 0 then
		return #p2 + 1 + p3
	end

	return p3
end
local function resolveInsertIndex(p4, p5) -- line: 23
	if p5 >= 0 then
		return p5
	end

	local v30 = #p4

	if v30 == 0 then
		v30 = 1
	end

	return v30 + 1 + p5
end
local function expandElement(p6, p7) -- line: 36
	-- upvalues: t2 (copy)
	if p7 == t2 then
		local t3 = {}

		for v34 in p6 do
			table.insert(t3, v34)
		end

		return t3
	end

	if type(p7) == "table" and p7.conditionFunc then
		local t4 = {}

		for v36, v37 in p6 do
			if p7.conditionFunc(p6, v36, v37) then
				table.insert(t4, v36)
			end
		end

		return t4
	end

	if type(p7) == "table" then
		local t5 = {}

		for _, v40 in p7 do
			table.insert(t5, if type(v40) ~= "number" or not (v40 < 0) then v40 else #p6 + 1 + v40)
		end

		return t5
	end

	return { if type(p7) ~= "number" or not (p7 < 0) then p7 else #p6 + 1 + p7 }
end
local function debugWarn(...) -- line: 66
	if shared.debugHook then
		shared.debugHook(script.Name .. ": ", ...)
	end
end
local function collectTargets(p8, p9, p10, p11) -- line: 74
	-- upvalues: expandElement (copy), collectTargets (copy), debugWarn (copy)
	local v45 = p11 == #p10

	for _, v47 in expandElement(p9, p10[p11]) do
		if v45 then
			table.insert(p8, {
				parent = p9,
				key = v47
			})
		else
			local v48 = p9[v47]

			if type(v48) == "table" then
				collectTargets(p8, v48, p10, p11 + 1)
			else
				debugWarn("indexPath cut off early", p10, p11, v47)
			end
		end
	end
end
local function resolveTargets(p12, p13) -- line: 90
	-- upvalues: debugWarn (copy), collectTargets (copy)
	local t6 = {}

	if #p13 <= 0 then
		debugWarn("empty indexPath", p13)

		return t6
	end

	collectTargets(t6, p12, p13, 1)

	return t6
end
local function getEffectivePath(p14) -- line: 104
	-- upvalues: t2 (copy)
	if not p14.valueIndex then
		return p14.indexPath
	end

	local v53 = table.clone(p14.indexPath)

	if p14.indexList then
		table.insert(v53, p14.indexList)
	elseif p14.indexConditionFunc then
		table.insert(v53, {
			conditionFunc = p14.indexConditionFunc
		})
	else
		table.insert(v53, t2)
	end

	table.insert(v53, p14.valueIndex)

	return v53
end
local function getAbsolutePriority(p15) -- line: 123
	return p15.absolutePriority or 0
end
local function getPriority(p16) -- line: 127
	return p16.priority or 0
end
local function isHigherPriority(p17, p18, p19, p20) -- line: 131
	local v60 = p17.absolutePriority or 0
	local v61 = p19.absolutePriority or 0

	if v60 ~= v61 then
		return v61 < v60
	end

	local v62 = p17.priority or 0
	local v63 = p19.priority or 0

	if v62 ~= v63 then
		return v63 < v62
	end

	return p20 < p18
end
local function getPriorityAscending(p21) -- line: 146
	local t7 = {}

	for v66, v67 in p21 do
		table.insert(t7, {
			entry = v67,
			sequence = v66
		})
	end

	table.sort(t7, function(p22, p23) -- line: 152
		local entry = p23.entry
		local sequence = p23.sequence
		local entry2 = p22.entry
		local sequence2 = p22.sequence
		local v221 = entry.absolutePriority or 0
		local v222 = entry2.absolutePriority or 0

		if v221 ~= v222 then
			return v222 < v221
		end

		local v223 = entry.priority or 0
		local v224 = entry2.priority or 0

		if v223 ~= v224 then
			return v224 < v223
		end

		return sequence2 < sequence
	end)

	return t7
end
local function normalizeList(p24) -- line: 158
	if type(p24) == "table" then
		return p24
	end

	return { p24 }
end
local function applySetters(p25, p26) -- line: 165
	-- upvalues: debugWarn (copy), collectTargets (copy)
	local t8 = {}

	for v72, v73 in p26 do
		local indexPath = v73.indexPath
		local t9 = {}
		local v76, v77

		if #indexPath <= 0 then
			debugWarn("empty indexPath", indexPath)
			v76 = nil
			v77 = nil
		else
			collectTargets(t9, p25, indexPath, 1)
			v76 = nil
			v77 = nil
		end

		for _, v79 in t9, v76, v77 do
			local v80 = t8[v79.parent]

			if not v80 then
				v80 = {}
				t8[v79.parent] = v80
			end

			local v81 = v80[v79.key]

			if v81 then
				local entry = v81.entry
				local sequence = v81.sequence
				local v84 = v73.absolutePriority or 0
				local v85 = entry.absolutePriority or 0
				local v86

				if v84 ~= v85 then
					v86 = v85 < v84
				else
					local v87 = v73.priority or 0
					local v88 = entry.priority or 0

					v86 = if v87 == v88 then sequence < v72 else v88 < v87
				end

				if not v86 then
					continue
				end
			end

			v80[v79.key] = {
				entry = v73,
				sequence = v72
			}
		end
	end

	for v89, v90 in t8 do
		for v91, v92 in v90 do
			local value = v92.entry.value

			v89[v91] = if type(value) ~= "table" then value else table.clone(value)
		end
	end
end
local function applyAdders(p27, p28) -- line: 189
	-- upvalues: debugWarn (copy), collectTargets (copy)
	local t10 = {}

	for _, v98 in p28 do
		local indexPath = v98.indexPath
		local t11 = {}
		local v101, v102

		if #indexPath <= 0 then
			debugWarn("empty indexPath", indexPath)
			v101 = nil
			v102 = nil
		else
			collectTargets(t11, p27, indexPath, 1)
			v101 = nil
			v102 = nil
		end

		for _, v104 in t11, v101, v102 do
			local v105 = t10[v104.parent]

			if not v105 then
				v105 = {}
				t10[v104.parent] = v105
			end

			v105[v104.key] = (v105[v104.key] or 0) + v98.value
		end
	end

	for v106, v107 in t10 do
		for v108, v109 in v107 do
			v106[v108] = (v106[v108] or 0) + v109
		end
	end
end
local function gatherMultiplierGroups(p29, p30) -- line: 209
	-- upvalues: getEffectivePath (copy), debugWarn (copy), collectTargets (copy)
	local t12 = {}

	for _, v114 in p30 do
		local v115 = getEffectivePath(v114)
		local t13 = {}
		local v117, v118

		if #v115 <= 0 then
			debugWarn("empty indexPath", v115)
			v117 = nil
			v118 = nil
		else
			collectTargets(t13, p29, v115, 1)
			v117 = nil
			v118 = nil
		end

		for _, v120 in t13, v117, v118 do
			local v121 = t12[v120.parent]

			if not v121 then
				v121 = {}
				t12[v120.parent] = v121
			end

			local v122 = v121[v120.key]

			if not v122 then
				v122 = {}
				v121[v120.key] = v122
			end

			table.insert(v122, v114.value)
		end
	end

	return t12
end
local function applyTrueMultipliers(p31, p32) -- line: 230
	-- upvalues: gatherMultiplierGroups (copy), debugWarn (copy)
	for v125, v126 in gatherMultiplierGroups(p31, p32) do
		for v127, v128 in v126 do
			local n1 = 1

			for _, v131 in v128 do
				n1 *= v131
			end

			local v132 = v125[v127]

			if v132 == nil then
				debugWarn("trueMultiplier base is missing", v127)
			elseif type(v132) == "table" then
				for i = 1, #v132 do
					v132[i] = v132[i] * n1
				end
			elseif not pcall(function() -- line: 248
				-- upvalues: v125 (copy), v127 (copy), v132 (copy), n1 (ref)
				v125[v127] = v132 * n1
			end) then
				debugWarn("trueMultiplier base does not support multiply", v127, v132)
			end
		end
	end
end
local function applyRelativeMultipliers(p33, p34) -- line: 260
	-- upvalues: gatherMultiplierGroups (copy), debugWarn (copy)
	for v136, v137 in gatherMultiplierGroups(p33, p34) do
		for v138, v139 in v137 do
			local n2 = 1
			local n3 = 1

			for _, v143 in v139 do
				if v143 > 0 then
					n2 += v143
				else
					n3 += -v143
				end
			end

			local v144 = v136[v138]

			if v144 == nil then
				debugWarn("relativeMultiplier base is missing", v138)
			elseif not pcall(function() -- line: 278
				-- upvalues: v136 (copy), v138 (copy), v144 (copy), n2 (ref), n3 (ref)
				v136[v138] = v144 * n2 / n3
			end) then
				debugWarn("relativeMultiplier base does not support multiply", v138, v144)
			end
		end
	end
end
local function insertOne(p35, p36, p37) -- line: 289
	-- upvalues: cloneValue (copy)
	if type(p37) == "number" then
		if p37 >= 0 then
		else
			local v148 = #p35

			if v148 == 0 then
				v148 = 1
			end

			p37 = v148 + 1 + p37
		end

		table.insert(p35, p37, cloneValue(p36.value))

		return
	end

	if tonumber(p37) then
		local num = tonumber(p37)

		if num >= 0 then
		else
			local v150 = #p35

			if v150 == 0 then
				v150 = 1
			end

			num = v150 + 1 + num
		end

		table.insert(p35, num, cloneValue(p36.value))

		return
	end

	local value = p36.value

	p35[p37] = if type(value) ~= "table" then value else table.clone(value)
end
local function applyInserters(p38, p39) -- line: 299
	-- upvalues: getPriorityAscending (copy), debugWarn (copy), collectTargets (copy), insertOne (copy), cloneValue (copy)
	for _, v155 in getPriorityAscending(p39) do
		local entry = v155.entry
		local indexPath = entry.indexPath
		local t14 = {}
		local v159, v160

		if #indexPath <= 0 then
			debugWarn("empty indexPath", indexPath)
			v159 = nil
			v160 = nil
		else
			collectTargets(t14, p38, indexPath, 1)
			v159 = nil
			v160 = nil
		end

		for _, v162 in t14, v159, v160 do
			local v163 = v162.parent[v162.key]

			if type(v163) ~= "table" then
				v163 = {}
				v162.parent[v162.key] = v163
			end

			if entry.overrideIndex ~= nil then
				local overrideIndex = entry.overrideIndex
				local v165, v166

				if type(overrideIndex) == "table" then
					v165 = nil
					v166 = nil
				else
					overrideIndex = { overrideIndex }
					v165 = nil
					v166 = nil
				end

				for _, v168 in overrideIndex, v165, v166 do
					local value = entry.value

					v163[v168] = if type(value) ~= "table" then value else table.clone(value)
				end
			elseif entry.insertIndex ~= nil then
				local insertIndex = entry.insertIndex
				local v171, v172

				if type(insertIndex) == "table" then
					v171 = nil
					v172 = nil
				else
					insertIndex = { insertIndex }
					v171 = nil
					v172 = nil
				end

				for _, v174 in insertIndex, v171, v172 do
					insertOne(v163, entry, v174)
				end
			elseif entry.insertIndexFunc then
				table.insert(v163, entry.insertIndexFunc(v163, v162.parent), cloneValue(entry.value))
			end
		end
	end
end
local function applyRemovers(p40, p41) -- line: 325
	-- upvalues: debugWarn (copy), collectTargets (copy)
	local t15 = {}

	for _, v179 in p41 do
		local indexPath = v179.indexPath
		local t16 = {}
		local v182, v183

		if #indexPath <= 0 then
			debugWarn("empty indexPath", indexPath)
			v182 = nil
			v183 = nil
		else
			collectTargets(t16, p40, indexPath, 1)
			v182 = nil
			v183 = nil
		end

		for _, v185 in t16, v182, v183 do
			local v186 = v185.parent[v185.key]

			if type(v186) == "table" then
				local v187 = t15[v186]

				if not v187 then
					v187 = {
						arrayIndices = {},
						hashKeys = {}
					}
					t15[v186] = v187
				end

				if v179.removeIndexFunc then
					local arrayIndices = v187.arrayIndices
					local v189 = v179.removeIndexFunc(v186, v185.parent)

					table.insert(arrayIndices, if type(v189) ~= "number" or not (v189 < 0) then v189 else #v186 + 1 + v189)
				elseif v179.removeIndex ~= nil then
					local removeIndex = v179.removeIndex
					local v191, v192

					if type(removeIndex) == "table" then
						v191 = nil
						v192 = nil
					else
						removeIndex = { removeIndex }
						v191 = nil
						v192 = nil
					end

					for _, v194 in removeIndex, v191, v192 do
						if type(v194) == "number" then
							table.insert(v187.arrayIndices, if type(v194) ~= "number" or not (v194 < 0) then v194 else #v186 + 1 + v194)
						elseif tonumber(v194) then
							local arrayIndices = v187.arrayIndices
							local num = tonumber(v194)

							table.insert(arrayIndices, if type(num) ~= "number" or not (num < 0) then num else #v186 + 1 + num)
						else
							table.insert(v187.hashKeys, v194)
						end
					end
				end
			end
		end
	end

	for v197, v198 in t15 do
		table.sort(v198.arrayIndices, function(p42, p43) -- line: 358
			return p43 < p42
		end)

		local v199 = nil

		for _, v201 in v198.arrayIndices do
			if v201 ~= v199 then
				table.remove(v197, v201)
				v199 = v201
			end
		end

		for _, v203 in v198.hashKeys do
			v197[v203] = nil
		end
	end
end
local function applyFunctionMods(p44, p45) -- line: 377
	-- upvalues: getPriorityAscending (copy), debugWarn (copy), collectTargets (copy)
	for _, v207 in getPriorityAscending(p45) do
		local entry = v207.entry
		local indexPath = entry.indexPath
		local t17 = {}
		local v211, v212

		if #indexPath <= 0 then
			debugWarn("empty indexPath", indexPath)
			v211 = nil
			v212 = nil
		else
			collectTargets(t17, p44, indexPath, 1)
			v211 = nil
			v212 = nil
		end

		for _, v214 in t17, v211, v212 do
			entry.func(p44, v214.key, v214.parent, v214.parent[v214.key])
		end
	end
end

t1.modifierTypeOrder = {
	"setters",
	"adders",
	"tableInserters",
	"tableRemovers",
	"relativeMultipliers",
	"trueMultipliers",
	"tableRelativeMultipliers",
	"tableTrueMultipliers",
	"functionMods"
}
t1.operators = {
	setters = applySetters,
	adders = applyAdders,
	tableInserters = applyInserters,
	tableRemovers = applyRemovers,
	relativeMultipliers = applyRelativeMultipliers,
	trueMultipliers = applyTrueMultipliers,
	tableRelativeMultipliers = applyRelativeMultipliers,
	tableTrueMultipliers = applyTrueMultipliers,
	functionMods = applyFunctionMods
}

return t1

--------------------------------------------------------------------------------
-- SharedModules.Utilities.General.LuaUtils

--!native
local t1 = {
	isDirtyFloat = function(p1) -- line: 4
		return p1 ~= p1 or (p1 == 1e999 or p1 == -1e999)
	end
}

local function deepFreeze(p2) -- line: 8
	-- upvalues: deepFreeze (copy)
	if table.isfrozen(p2) then
		return p2
	end

	for _, v in next, p2 do
		if type(v) == "table" then
			deepFreeze(v)
		end
	end

	return table.freeze(p2)
end

t1.deepFreeze = deepFreeze

local t2 = {}

local function recurse(p3) -- line: 25
	-- upvalues: t2 (copy), recurse (copy)
	if t2[p3] then
		return t2[p3]
	end

	local v11 = table.clone(p3)

	t2[p3] = v11

	for k, v in next, v11 do
		if type(v) == "table" then
			v11[k] = recurse(v)
		end
	end

	return v11
end

function t1.deepCopy(p4) -- line: 43
	-- upvalues: t2 (copy), recurse (copy)
	if not p4 then
		return
	end

	table.clear(t2)

	return (recurse(p4))
end

local random = Random.new()

function t1.shuffle(p5) -- line: 52
	-- upvalues: random (copy)
	random:Shuffle(p5)

	return p5
end
function t1.generateRandomString(p6) -- line: 74
	local t3 = table.create(p6)

	for i = 1, p6 do
		t3[i] = string.char(math.random(48, 122))
	end

	return table.concat(t3)
end
function t1.unpackRGB(p7) -- line: 84
	if not p7 then
		return
	end

	return bit32.rshift(p7, 16), bit32.band(bit32.rshift(p7, 8), 255), (bit32.band(p7, 255))
end
function t1.packRGB(p8, p9, p10) -- line: 89
	if not p8 or (not p9 or not p10) then
		return
	end

	return (bit32.bor(bit32.lshift(p8, 16), bit32.lshift(p9, 8), (bit32.lshift(p10, 0))))
end
function t1.deepCompare(p11, p12) -- line: 94
	-- upvalues: t1 (copy)
	if type(p11) ~= "table" or type(p12) ~= "table" then
		return false
	end

	local n1 = 0
	local n2 = 0

	for _ in p11 do
		n1 += 1
	end

	for _ in p12 do
		n2 += 1
	end

	if n1 ~= n2 then
		return false
	end

	for v29, v30 in p11 do
		if type(v30) ~= "table" then
			if v30 == p12[v29] then
				continue
			end

			return false
		end

		if not t1.deepCompare(v30, p12[v29]) then
			return false
		end
	end

	return true
end
function t1.pickRandomUniqueSamples(p13, p14) -- line: 127
	-- upvalues: t1 (copy)
	local t4 = table.create(p14)
	local v34 = t1.deepCopy(p13)
	local v35 = t1.shuffle(v34)

	for _ = 1, p14 do
		table.insert(t4, table.remove(v35) or p13[math.random(1, #p13)])
	end

	return t4
end

return t1