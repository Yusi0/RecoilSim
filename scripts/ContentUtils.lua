-- SharedModules.Content.ContentUtils

local t1 = {}
local v2 = shared.require("ContentInterface")
local v3 = shared.require("ContentConfig")
local v4 = shared.require("MenuUtils")
local v5 = shared.require("LuaUtils")

function t1.getWeaponClass(p1) -- line: 8
	-- upvalues: v2 (copy)
	local v10 = v2.getWeaponEntry(p1)

	if not v10 then
		return nil
	end

	return v10.weaponClass
end
function t1.getWeaponTypeFromClass(p2) -- line: 18
	-- upvalues: v3 (copy)
	for v12, v13 in v3.weaponTypes do
		if table.find(v13, p2) then
			return v12
		end
	end

	return nil
end
function t1.getWeaponType(p3) -- line: 28
	-- upvalues: t1 (copy)
	local v15 = t1.getWeaponClass(p3)

	return t1.getWeaponTypeFromClass(v15)
end
function t1.getLoadoutSlotFromWeapon(p4) -- line: 33
	-- upvalues: t1 (copy), v3 (copy)
	local v17 = t1.getWeaponClass(p4)

	for v18, v19 in v3.loadoutSlots do
		if table.find(v19, v17) then
			return v18
		end
	end

	return nil
end
function t1.getWeaponDisplayName(p5, p6) -- line: 44
	-- upvalues: v2 (copy), v3 (copy)
	if p6 then
		local v22 = v2.getWeaponSource(p5)
		local attachmentSlotOrder = v3.attachmentSlotOrder
		local t2 = {}

		for i = 1, #attachmentSlotOrder do
			local v26 = attachmentSlotOrder[i]
			local v27 = p6[v26]

			if v27 ~= "" and v27 then
				local v28 = v2.getAttachmentData(v27)

				if not v28 then
					error(string.format("Attachment module not found %s %s", p5, v27))
				end

				local v29 = v28.attachmentModifiers and v28.attachmentModifiers.setters

				if v29 then
					for _, v31 in v29 do
						if v31.indexPath[1] == "displayname" then
							table.insert(t2, {
								displayName = v31.value,
								priority = v31.priority
							})
						end
					end
				end

				if not v22.baseAttachmentSet[v26][v27] then
					error(string.format("Attachment not found %s %s", p5, v27))
				end

				local v32 = v22.baseAttachmentSet[v26][v27]
				local v33 = v32.attachmentModifiers and v32.attachmentModifiers.setters

				if v33 then
					for _, v35 in v33 do
						if v35.indexPath[1] == "displayname" then
							table.insert(t2, {
								displayName = v35.value,
								priority = v35.priority
							})
						end
					end
				end
			end
		end

		table.sort(t2, function(p7, p8) -- line: 95
			return (p7.priority or 0) < (p8.priority or 0)
		end)

		local v36 = t2[#t2]

		return v36 and v36.displayName or (v22.baseWeaponData.displayname or p5)
	end

	local v37 = v2.getWeaponData(p5)

	if not v37 then
		return p5
	end

	return v37.displayname or p5
end
function t1.getAttachmentDisplayName(p9, p10, p11) -- line: 115
	-- upvalues: v2 (copy)
	if not p9 or p9 == "DEFAULT" then
		return p9
	end

	if p10 and p11 then
		local v41 = v2.getWeaponSource(p10).baseAttachmentSet[p11][p9]

		if v41 and v41.displayname then
			return v41.displayname
		end
	end

	local v42 = v2.getAttachmentData(p9)

	return v42 and v42.displayname or p9
end
function t1.getValidAttachmentSlots(p12) -- line: 132
	-- upvalues: t1 (copy), v3 (copy)
	local v44 = t1.getLoadoutSlotFromWeapon(p12)

	if not v44 then
		warn(script.Name .. ": No loadoutSlotName found for", p12)

		return {}
	end

	return v3.attachmentSlots[v44]
end

local t3 = {
	"Red Dots",
	"Scopes",
	"Iron Sights",
	"Special Sights",
	"Muzzles",
	"Suppressors",
	"Barrels",
	"Grips",
	"Accessories",
	"Canted Sights",
	"Stocks",
	"Ammo",
	"Conversions",
	"Mods",
	"Unlisted"
}

function t1.getSortedAttachmentCategories(p13) -- line: 150
	-- upvalues: v2 (copy), t3 (copy)
	local t4 = {}

	for v47 in p13 do
		local v48 = v2.getAttachmentCategory(v47)

		if not t4[v48] then
			t4[v48] = {}
		end

		table.insert(t4[v48], v47)
	end

	local t5 = {}

	for v50 in t4 do
		table.insert(t5, v50)
	end

	table.sort(t5, function(p14, p15) -- line: 166
		-- upvalues: t3 (copy)
		return (table.find(t3, p14) or 1e999) < (table.find(t3, p15) or 1e999)
	end)

	return t5, t4
end

local v7 = shared.require("StatModifierInterface")
local t6 = {
	"Optics",
	"Barrel",
	"Underbarrel",
	"Other",
	"Ammo"
}

function t1.compileWeaponData(p16, p17) -- line: 179
	-- upvalues: v2 (copy), t6 (copy), v5 (copy), v7 (copy), v4 (copy)
	debug.profilebegin("compileWeaponData")

	local weaponName = p16.weaponName
	local weaponAttachments = p16.weaponAttachments
	local v55 = v2.getWeaponSource(weaponName)
	local baseWeaponData = v55.baseWeaponData
	local baseAttachmentSet = v55.baseAttachmentSet

	if not weaponAttachments or not baseAttachmentSet then
		debug.profileend()

		return baseWeaponData
	end

	local t7 = {}

	for _, v60 in t6 do
		local v61 = weaponAttachments[v60]

		if v61 then
			if not baseAttachmentSet[v60][v61] then
				warn(script.Name .. ":", v60, v61, "not defined in sets for", weaponName)
			else
				local v62 = v2.getAttachmentData(v61)

				if not v62 then
					warn(script.Name .. ": No attachmentData found on compileWeaponData for", v61, weaponName)
				else
					local attachmentModifiers = v62.attachmentModifiers

					if attachmentModifiers then
						for v64, v65 in (v5.deepCopy(attachmentModifiers)) do
							if not t7[v64] then
								t7[v64] = {}
							end

							for _, v67 in v65 do
								if v67.indexPath[1] == "altaimdata" and #v67.indexPath == 1 and v67.value then
									if v64 == "setters" then
										for _, v69 in v67.value do
											v69.name = v61
										end
									elseif v64 == "tableInserters" then
										v67.value.name = v61
									end
								end

								table.insert(t7[v64], v67)
							end
						end
					end
				end
			end
		end
	end

	for _, v71 in t6 do
		local v72 = weaponAttachments[v71]

		if v72 and v72 ~= "" then
			local v73 = baseAttachmentSet[v71][v72]

			if not v73 then
				warn(script.Name .. ":", v71, v72, "not defined in sets for", weaponName)
			else
				for v74, v75 in v73.attachmentModifiers or {} do
					if not t7[v74] then
						t7[v74] = {}
					end

					for _, v77 in v75 do
						table.insert(t7[v74], v77)
					end
				end
			end
		end
	end

	local v78 = v7.compileModifiers(baseWeaponData, t7)

	if v78.sparerounds then
		v78.sparerounds = math.round(v78.sparerounds)
	end

	if v78.magsize then
		v78.magsize = math.round(v78.magsize)
	end

	if v78.damageGraph then
		local damageGraph = v78.damageGraph

		table.sort(damageGraph, function(p18, p19) -- line: 283
			return p18.distance < p19.distance
		end)

		if damageGraph[1].distance > 0 then
			table.insert(damageGraph, 1, {
				distance = 0,
				damage = damageGraph[1].damage
			})
		end
	end

	if v78.animationmods then
		for k, v in next, v78.animationmods do
			for v82, v83 in v do
				v78.animations[k][v82] = v83
			end
		end
	end

	local firerate = v78.firerate

	if firerate then
		local t8 = {}

		if v78.onfireanim then
			table.insert(t8, v4.getAnimationTime(v78.animations[`onfire{ v78.onfireanim }`], true))
		end

		if v78.requirechamber and v78.animations.onfire then
			local v86 = v78.onfireanim and `onfire{ v78.onfireanim }` or "onfire"

			table.insert(t8, v4.getAnimationTime(v78.animations[v86], true))
		end

		if v78.magsize == 1 and not v78.chambered then
			local v87 = `{ v78.altreloadlong or "" }reload`

			table.insert(t8, v4.getAnimationTime(v78.animations[v87], true))
		end

		local v88 = #t8 > 0 and math.max(unpack(t8)) or 0
		local v89 = v88 ~= 0 and 60 / v88 or 1e999

		if type(firerate) == "table" then
			for v90, v91 in firerate do
				firerate[v90] = math.min(v91, v89)
			end
		else
			v78.firerate = math.min(firerate, v89)
		end
	end

	if p17 then
		print("newweaponData", weaponName, v78)
	end

	debug.profileend()

	return v5.deepFreeze(v78)
end

return t1

