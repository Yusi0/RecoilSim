local _ = Vector3.new
local _ = Vector2.new
local _ = CFrame.new
local _ = Instance.new
local _ = CFrame.Angles

return {
	info = "A high-precision rifle round designed to give the AR-15 platform performance somewhat comparable to 7.62x51mm, but with around half of the recoil impulse. The larger bullet is still able to load into the AR-15's magazines, but with a lower maximum capacity.",
	unlockkills = 1515,
	displayname = "6.5 GRENDEL",
	attachmentModifiers = {
		setters = {
			{
				value = "6.5mm Grendel",
				indexPath = { "ammotype" }
			},
			{
				value = "7.62x39mm",
				indexPath = { "casetype" }
			},
			{
				value = 20,
				indexPath = { "magsize" }
			},
			{
				value = 100,
				indexPath = { "reserveammo" }
			},
			{
				value = "OtherNode",
				indexPath = { "node" }
			}
		},
		relativeMultipliers = {
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"hipTranslation",
					"x",
					1,
					3
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"hipTranslation",
					"y",
					1,
					3
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"hipTranslation",
					"z",
					1,
					3
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"hipTranslation",
					"x",
					2,
					3
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"hipTranslation",
					"y",
					2,
					3
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"hipTranslation",
					"z",
					2,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"hipRotation",
					"x",
					1,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"hipRotation",
					"y",
					1,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"hipRotation",
					"z",
					1,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"hipRotation",
					"x",
					2,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"hipRotation",
					"y",
					2,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"hipRotation",
					"z",
					2,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"x",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"y",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"z",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"x",
					1,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"y",
					1,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"z",
					1,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"x",
					2,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"y",
					2,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"z",
					2,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"x",
					2,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"y",
					2,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraBody",
					"z",
					2,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraHead",
					"x",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraHead",
					"y",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraHead",
					"z",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraHead",
					"x",
					1,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraHead",
					"y",
					1,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"hipCameraHead",
					"z",
					1,
					4
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"aimTranslation",
					"x",
					1,
					3
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"aimTranslation",
					"y",
					1,
					3
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"aimTranslation",
					"z",
					1,
					3
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"aimTranslation",
					"x",
					2,
					3
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"aimTranslation",
					"y",
					2,
					3
				}
			},
			{
				value = 0.25,
				indexPath = {
					"recoil",
					"aimTranslation",
					"z",
					2,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"aimRotation",
					"x",
					1,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"aimRotation",
					"y",
					1,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"aimRotation",
					"z",
					1,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"aimRotation",
					"x",
					2,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"aimRotation",
					"y",
					2,
					3
				}
			},
			{
				value = 0.3,
				indexPath = {
					"recoil",
					"aimRotation",
					"z",
					2,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"x",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"y",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"z",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"x",
					1,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"y",
					1,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"z",
					1,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"x",
					2,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"y",
					2,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"z",
					2,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"x",
					2,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"y",
					2,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraBody",
					"z",
					2,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraHead",
					"x",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraHead",
					"y",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraHead",
					"z",
					1,
					3
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraHead",
					"x",
					1,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraHead",
					"y",
					1,
					4
				}
			},
			{
				value = 0.15,
				indexPath = {
					"recoil",
					"aimCameraHead",
					"z",
					1,
					4
				}
			},
			{
				value = 0.2,
				indexPath = { "suppression" }
			},
			{
				value = -0.275,
				indexPath = { "bulletspeed" }
			},
			{
				value = 0.15,
				indexPath = { "penetrationdepth" }
			}
		},
		trueMultipliers = {
			{
				value = 0.95,
				indexPath = { "firerate" }
			},
			{
				value = 1.05,
				indexPath = { "multtorso" }
			},
			{
				value = 0.87,
				indexPath = { "firepitch" }
			}
		},
		tableTrueMultipliers = {
			{
				valueIndex = "damage",
				value = 1.14,
				indexPath = { "damageGraph" },
				indexList = {
					1,
					2
				}
			},
			{
				valueIndex = "distance",
				value = 0.675,
				indexPath = { "damageGraph" },
				indexList = {
					1,
					2
				}
			}
		}
	}
}
