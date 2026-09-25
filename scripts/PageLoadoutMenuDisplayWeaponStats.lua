local t1 = {}
local TweenService = game:GetService("TweenService")
local v3 = shared.require("MenuWeaponDisplayInterface")
local v4 = shared.require("PlayerDataClientInterface")
local v5 = shared.require("PageLoadoutMenuInterface")
local v6 = shared.require("MenuWeaponDisplayEvents")
local v7 = shared.require("PlayerDataClientEvents")
local v8 = shared.require("PageLoadoutMenuConfig")
local v9 = shared.require("PageLoadoutMenuEvents")
local v10 = shared.require("ActiveLoadoutEvents")
local v11 = shared.require("GuiInputInterface")
local v12 = shared.require("MenuPagesEvents")
local v13 = shared.require("UIScrollingList")
local v14 = shared.require("DestructorGroup")
local v15 = shared.require("MenuColorConfig")
local v16 = shared.require("PlayerDataUtils")
local v17 = shared.require("LoadoutConfig")
local v18 = shared.require("MenuScreenGui")
local v19 = shared.require("ContentUtils")
local v20 = shared.require("UIHighlight")
local v21 = shared.require("MenuUtils")
local v22 = v18.getPageFrame("PageLoadoutMenu")
local Templates = v22.Templates
local DisplayWeaponStats = v22.DisplayWeaponStats
local DisplayExportLoadout = v22.DisplayExportLoadout
local ButtonExportStats = DisplayWeaponStats.ButtonExportStats
local TitleWeaponName = DisplayWeaponStats.TitleWeaponName
local TitleWeaponRank = DisplayWeaponStats.TitleWeaponRank
local Container = DisplayWeaponStats.Container
local XOffset = DisplayWeaponStats.Size.X.Offset
local v31 = v14.new()
local BlackWhite = game:GetService("Lighting"):WaitForChild("BlackWhite")

local function convertValueToString(p1, p2) -- line: 43
	-- upvalues: v21 (copy)
	if type(p2) == "string" then
		return "\"" .. p2 .. "\""
	end

	if p1 == "OffsetStudsU" or p1 == "OffsetStudsV" or p1 == "StudsPerTileU" or p1 == "StudsPerTileV" then
		return v21.roundToDecimalPlaces(p2, 3)
	end

	if p1 == "Color" then
		return "Color3.fromRGB(" .. math.round(p2.r * 255) .. ", " .. math.round(p2.g * 255) .. ", " .. math.round(p2.b * 255) .. ")"
	end

	if tonumber(p2) or type(p2) == "boolean" then
		return (tostring(p2))
	end

	warn(script.Name .. ": Possibly unsupported index", p1, p2)

	return p2
end

function t1.updateDisplay() -- line: 58
	-- upvalues: v31 (copy), v5 (copy), v3 (copy), v19 (copy), TitleWeaponName (copy), TitleWeaponRank (copy), v15 (copy), Templates (copy), v16 (copy), v4 (copy), Container (copy), v7 (copy), v17 (copy), v8 (copy), v21 (copy), v22 (copy), DisplayWeaponStats (copy), XOffset (copy), BlackWhite (copy), DisplayExportLoadout (copy), convertValueToString (copy), v13 (copy), v11 (copy), ButtonExportStats (copy), v9 (copy)
	local v36 = v31:runAndReplace("updateDisplay")
	local v37 = v5.getActiveLoadoutSlot()
	local v38, v39, v40, v41 = v3.getActiveWeaponDataToDisplay()
	local v42, v43 = v3.getPreviewSettings()
	local v44 = v19.getWeaponDisplayName(v38, v40)

	TitleWeaponName.TextFrame.Text = string.upper(v44)
	TitleWeaponRank.TextFrame.Text = string.upper("Rank " .. (v39.unlockrank or "Special"))

	if v42 == v38 then
		TitleWeaponName.TextFrame.TextColor3 = v15.previewDisplayTextStatsColor
	else
		TitleWeaponName.TextFrame.TextColor3 = v15.defaultDisplayTextStatsColor
	end

	local clone = Templates.DisplayWeaponStatText:Clone()

	clone.TextFrameStat.TextColor3 = v15.previewDisplayTextStatsColor
	clone.TextFrameStat.Text = "KILLS"
	clone.TextFrameValue.Text = v16.getGunKills(v4.getPlayerData(), v38)
	clone.Parent = Container
	v36:add(v7.onWeaponKillsUpdated:connect(function(p3, p4) -- line: 81
		-- upvalues: v38 (copy), clone (copy)
		if p3 == v38 then
			clone.TextFrameValue.Text = p4
		end
	end))
	v36:add(clone)

	local v46 = v17.attachmentSlots[v37]

	if not v46 then
		warn("PageLoadoutMenuDisplayWeaponStats: No attachment slot stat config found for", v37)

		return
	end

	for _, v in next, v46 do
		local clone2 = Templates.DisplayWeaponStatText:Clone()
		local v50 = nil

		if v40 then
			v50 = v40[v]
		end

		local v51 = v50

		if v50 then
			v51 = v19.getAttachmentDisplayName(v50, v38, v)

			if v50 == v43[v] then
				clone2.TextFrameValue.TextColor3 = v15.previewDisplayTextStatsColor
			end
		end

		clone2.TextFrameStat.Text = string.upper(v)
		clone2.TextFrameValue.Text = string.upper(if not not v51 and v51 ~= "" then v51 else "Default")
		clone2.Parent = Container
		v36:add(clone2)
	end

	local v52 = v8.loadoutSlotStatType[v37]
	local v53 = v8.loadoutSlotStatConfig[v52]

	if not v53 then
		warn("PageLoadoutMenuDisplayWeaponStats: No loadout slot stat config found for", v37)

		return
	end

	local v54, v55 = v19.compileWeaponData({
		weaponName = v38,
		weaponAttachments = v40
	})

	for _, v in next, v53 do
		if v == "" then
			local clone3 = Templates.DisplayWeaponStatEmpty:Clone()

			clone3.Parent = Container
			v36:add(clone3)
		else
			local v59 = shared.require(v)(v39, v54, v55, v36)

			if v59 then
				v59.Parent = Container
				v36:add(v59)
			end
		end
	end

	local v60 = v21.getScale(v22)
	local v61 = Container.UIListLayout.AbsoluteContentSize.Y / v60

	DisplayWeaponStats.Size = UDim2.new(0, XOffset, 0, 65 + v61)

	if v3.isPreviewing() then
		DisplayWeaponStats.BackFrame.BackgroundColor3 = v15.previewDisplayStatsColor
		BlackWhite.Saturation = -1
	else
		DisplayWeaponStats.BackFrame.BackgroundColor3 = v15.defaultDisplayStatsColor
		BlackWhite.Saturation = 0
	end

	local function updateExportOutput() -- line: 158
		-- upvalues: v31 (copy), DisplayExportLoadout (copy), v38 (copy), v40 (copy), v41 (copy), convertValueToString (copy), v60 (copy), v13 (copy)
		local v66 = v31:runAndReplace("updateExportOutput")

		DisplayExportLoadout.Visible = true

		local v67 = "-- Blueprint Name: INSERTNAME\n" .. "return {\n" .. "\titemName = script.Name;\n" .. "\titemStyle = \"communityBlueprint\";\n\n" .. "\tweaponName = \"" .. v38 .. "\";\n"

		if v40 and next(v40) then
			local v68 = v67 .. "\tweaponAttachments = {\n"

			for v69, v70 in v40 do
				v68 ..= "\t\t" .. v69 .. " = \"" .. v70 .. "\";\n"
			end

			v67 = v68 .. "\t};\n"
		end

		if v41 and next(v41) then
			print("weaponCamo", v41)

			local v71 = v67 .. "\tweaponCamo = {\n"
			local t2 = {}

			for v73 in v41 do
				table.insert(t2, v73)
			end

			table.sort(t2)

			for _, v75 in t2 do
				local v76 = v41[v75]

				if v76.Name then
					local v77 = v71 .. "\t\t[\"" .. v75 .. "\"] = {\n" .. "\t\t\tName = \"" .. v76.Name .. "\";\n"

					if v76.TextureProperties and next(v76.TextureProperties) then
						local t3 = {}

						for v79 in v76.TextureProperties do
							table.insert(t3, v79)
						end

						table.sort(t3)

						local v80 = v77 .. "\t\t\tTextureProperties = {\n"

						for _, v82 in t3 do
							local v83 = v76.TextureProperties[v82]

							v80 ..= "\t\t\t\t" .. v82 .. " = " .. convertValueToString(v82, v83) .. ";\n"
						end

						v77 = v80 .. "\t\t\t};\n"
					end

					if v76.BrickProperties and next(v76.BrickProperties) then
						local t4 = {}

						for v85 in v76.BrickProperties do
							table.insert(t4, v85)
						end

						table.sort(t4)

						local v86 = v77 .. "\t\t\tBrickProperties = {\n"

						for _, v88 in t4 do
							local v89 = v76.BrickProperties[v88]

							v86 ..= "\t\t\t\t" .. v88 .. " = " .. convertValueToString(v88, v89) .. ";\n"
						end

						v77 = v86 .. "\t\t\t};\n"
					end

					v71 = v77 .. "\t\t};\n"
				end
			end

			v67 = v71 .. "\t};\n"
		end

		local u90 = v67 .. "}"

		DisplayExportLoadout.Container.TextOutput.Text = u90

		local v91 = DisplayExportLoadout.Container.AbsoluteSize.Y / v60
		local v92 = math.max(DisplayExportLoadout.Container.TextOutput.TextBounds.Y / v60 + 10, v91)

		DisplayExportLoadout.Container.TextOutput.Size = UDim2.new(1, 0, 0, v92)
		v66:add(v13.new(DisplayExportLoadout.Container, DisplayExportLoadout.Container.UIListLayout))
		v66:add(DisplayExportLoadout.Container.TextOutput.FocusLost:Connect(function() -- line: 256
			-- upvalues: DisplayExportLoadout (copy), u90 (ref)
			DisplayExportLoadout.Container.TextOutput.Text = u90
		end))
	end

	if DisplayExportLoadout.Visible then
		updateExportOutput()
	end

	v36:add(v11.onReleased(ButtonExportStats, function() -- line: 265
		-- upvalues: DisplayExportLoadout (copy), updateExportOutput (copy)
		if DisplayExportLoadout.Visible then
			DisplayExportLoadout.Visible = false

			return
		end

		updateExportOutput()
	end))
	v9.onWeaponStatsChanged:fire(v37)
end
function t1._init() -- line: 275
	-- upvalues: DisplayExportLoadout (copy), v21 (copy), Container (copy), t1 (copy), v6 (copy), v10 (copy), v18 (copy), BlackWhite (copy), v12 (copy), v3 (copy), TweenService (copy), v11 (copy), v20 (copy), v15 (copy), ButtonExportStats (copy)
	DisplayExportLoadout.Visible = false
	v21.clearContainer(Container)
	t1.updateDisplay()
	v6.onPreviewChanged:connect(t1.updateDisplay)
	v10.onWeaponClassChanged:connect(t1.updateDisplay)
	v10.onLoadoutChanged:connect(t1.updateDisplay)

	local tweenInfo = TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

	v18.onDisabled:connect(function() -- line: 291
		-- upvalues: BlackWhite (copy)
		BlackWhite.Enabled = false
	end)
	v18.onEnabled:connect(function() -- line: 295
		-- upvalues: BlackWhite (copy)
		BlackWhite.Enabled = true
	end)
	v12.onPageChanged:connect(function(p5) -- line: 300
		-- upvalues: v3 (copy), TweenService (copy), BlackWhite (copy), tweenInfo (copy)
		local t5 = {}

		if p5 == "PageLoadoutMenu" and v3.isPreviewing() then
			t5.Saturation = -1
		else
			t5.Saturation = 0
		end

		TweenService:Create(BlackWhite, tweenInfo, t5):Play()
	end)
	v11.onReleased(DisplayExportLoadout.ButtonClose, function() -- line: 310
		-- upvalues: DisplayExportLoadout (copy)
		DisplayExportLoadout.Visible = false
	end)
	v20.new(DisplayExportLoadout.ButtonClose, {
		highlightColor3 = v15.promptCancelColorConfig.highlighted.BackgroundColor3,
		defaultColor3 = v15.promptCancelColorConfig.default.BackgroundColor3
	})
	v20.new(ButtonExportStats, {
		highlightColor3 = v15.actionButton.highlightColor,
		defaultColor3 = v15.actionButton.defaultColor
	})
end

return t1

