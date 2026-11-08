## Personagens do Golem (porte de apps/mobile/src/three/costumes.ts): fantasias, como no
## Purim, feitas com as mesmas primitivas. Cada uma cobre cabeça, corpo e mão; o rosto de
## barro e as letras אמת continuam à mostra.
class_name Costumes

const C := Kit.C


static func _robe(color: String, length := 0.98, flare := 0.64) -> Node3D:
	return Kit.mesh(Geo.cyl(0.52, flare, length, 9), Kit.mat(color), {"p": [0, -0.06 - (length - 0.98) / 2, 0], "s": [1, 1, 0.8]})


static func _bands(colors: Array, top := 0.34, height := 0.98, flare := 0.64) -> Node3D:
	var h := height / colors.size()
	var parts: Array = []
	for i in colors.size():
		var y := top - h * (i + 0.5)
		var t := (i + 0.5) / colors.size()
		var r := 0.525 + (flare + 0.005 - 0.525) * t
		parts.append(Kit.mesh(Geo.cyl(r, r + (flare - 0.52) / colors.size(), h, 9), Kit.mat(colors[i]), {"p": [0, y, 0], "s": [1, 1, 0.8]}))
	return Kit.group({}, parts)


static func _beard(color: String, long := 0.46) -> Node3D:
	return Kit.mesh(Geo.cone(0.3, long, 6), Kit.mat(color), {"p": [0, -0.22 - long / 2, 0.36], "r": [PI, 0, 0], "s": [1, 1, 0.55]})


static func _headcloth(color: String, band := "") -> Node3D:
	var cloth := Kit.mat(color)
	var parts: Array = [
		Kit.mesh(Geo.sphere(0.7, 12, 6, PI / 2), cloth, {"p": [0, 0.18, -0.02], "s": [0.86, 0.62, 0.72]}),
		Kit.mesh(Geo.rbox(1.08, 0.9, 0.14, 0.06), cloth, {"p": [0, -0.08, -0.46]}),
		Kit.mesh(Geo.rbox(0.12, 0.72, 0.62, 0.05), cloth, {"p": [0.56, -0.02, -0.12]}),
		Kit.mesh(Geo.rbox(0.12, 0.72, 0.62, 0.05), cloth, {"p": [-0.56, -0.02, -0.12]}),
	]
	if band != "":
		parts.append(Kit.mesh(Geo.cyl(0.6, 0.6, 0.07, 14), Kit.mat(band), {"p": [0, 0.3, -0.02], "s": [0.9, 1, 0.76]}))
	return Kit.group({}, parts)


static func _hair(color: String, long := false) -> Node3D:
	var m := Kit.mat(color)
	var parts: Array = [Kit.mesh(Geo.ball(0.6, 1), m, {"p": [0, 0.32, -0.04], "s": [1, 0.45, 0.88]})]
	if long:
		parts.append(Kit.mesh(Geo.rbox(1.02, 1.02, 0.22, 0.1), m, {"p": [0, -0.16, -0.42]}))
	return Kit.group({}, parts)


static func _crown(color: String = C.gold, gem: String = C.red) -> Node3D:
	var gold := Kit.mat(color, {"emissive": color, "emissiveIntensity": 0.15})
	var parts: Array = [Kit.mesh(Geo.cyl(0.36, 0.38, 0.2, 10), gold, {"p": [0, 0.54, 0]})]
	for i in 5:
		var a := float(i) / 5.0 * TAU
		parts.append(Kit.mesh(Geo.cone(0.07, 0.2, 4), gold, {"p": [sin(a) * 0.34, 0.74, cos(a) * 0.34]}))
	parts.append(Kit.mesh(Geo.ball(0.06, 0), Kit.mat(gem), {"p": [0, 0.56, 0.38]}))
	return Kit.group({}, parts)


static func _staff(color: String = C.woodDark) -> Node3D:
	var m := Kit.mat(color)
	return Kit.group({"p": [0, -0.5, 0.12]}, [Kit.mesh(Geo.cyl(0.035, 0.035, 1.8, 6), m, {"p": [0, 0.3, 0]}), Kit.mesh(Geo.torus(0.1, 0.035, PI, 8), m, {"p": [0.1, 1.2, 0]})])


static func _dove() -> Node3D:
	var white := Kit.mat(C.white)
	return Kit.group({"p": [0.5, 0.48, 0.05]}, [
		Kit.mesh(Geo.ball(0.13, 1), white, {"s": [1.3, 0.9, 1]}),
		Kit.mesh(Geo.ball(0.08, 1), white, {"p": [0.12, 0.08, 0.06]}),
		Kit.mesh(Geo.box(0.22, 0.03, 0.12), white, {"p": [-0.05, 0.08, -0.05], "r": [0, 0, 0.5]}),
		Kit.mesh(Geo.cone(0.025, 0.07, 4), Kit.mat(C.gold), {"p": [0.21, 0.08, 0.06], "r": [0, 0, -PI / 2]}),
		Kit.mesh(Geo.cyl(0.01, 0.01, 0.2, 4), Kit.mat(C.leafDark), {"p": [0.26, 0.04, 0.06], "r": [0, 0, 1.2]}),
		Kit.mesh(Geo.ball(0.035, 0), Kit.mat(C.leaf), {"p": [0.33, 0.0, 0.06], "s": [1.6, 0.7, 0.8]}),
	])


static func _tambourine() -> Node3D:
	var parts: Array = [Kit.mesh(Geo.torus(0.2, 0.04, TAU, 14), Kit.mat(C.woodDark)), Kit.mesh(Geo.disc(0.19, 14), Kit.mat(C.cream), {"p": [0, 0, -0.01]})]
	for i in 6:
		var a := float(i) / 6.0 * TAU
		parts.append(Kit.mesh(Geo.cyl(0.045, 0.045, 0.02, 8), Kit.mat(C.gold), {"p": [cos(a) * 0.2, sin(a) * 0.2, 0.03], "r": [PI / 2, 0, 0]}))
	return Kit.group({"p": [0, -0.62, 0.2], "r": [0.3, 0, 0]}, parts)


static func _harp() -> Node3D:
	var gold := Kit.mat(C.gold, {"emissive": C.gold, "emissiveIntensity": 0.1})
	var string := Kit.mat(C.cream, {"smooth": true})
	var parts: Array = [
		Kit.mesh(Geo.cyl(0.03, 0.03, 0.62, 5), gold, {"p": [-0.12, 0, 0]}),
		Kit.mesh(Geo.cyl(0.03, 0.03, 0.5, 5), gold, {"p": [0.08, 0.18, 0], "r": [0, 0, -0.9]}),
		Kit.mesh(Geo.cyl(0.03, 0.03, 0.42, 5), gold, {"p": [0.12, -0.12, 0], "r": [0, 0, 0.35]}),
	]
	for i in 4:
		parts.append(Kit.mesh(Geo.cyl(0.006, 0.006, 0.42 - i * 0.07, 3), string, {"p": [-0.06 + i * 0.06, 0.02 + i * 0.03, 0], "shadow": false}))
	return Kit.group({"p": [0, -0.62, 0.22], "r": [0.2, 0, 0.2]}, parts)


static func _breastplate() -> Node3D:
	var stones := ["#D64545", "#5CC46A", "#4C8DF0", "#F4F4F4", "#9B5BE0", "#FF9A3C", "#1FA59A", "#E85D9C", "#8BD3F7", "#7A4B2A", "#FFD04A", "#2F6B3A"]
	var parts: Array = [Kit.mesh(Geo.box(0.46, 0.54, 0.05), Kit.mat(C.gold, {"emissive": C.gold, "emissiveIntensity": 0.12}))]
	for i in stones.size():
		parts.append(Kit.mesh(Geo.box(0.1, 0.1, 0.04), Kit.mat(stones[i], {"smooth": true}), {"p": [-0.13 + (i % 3) * 0.13, 0.19 - floori(i / 3.0) * 0.125, 0.04]}))
	return Kit.group({"p": [0, 0.06, 0.42]}, parts)


static func _pomegranate_hem() -> Node3D:
	var parts: Array = []
	for i in 14:
		var a := float(i) / 14.0 * TAU
		parts.append(Kit.mesh(Geo.ball(0.05, 0), Kit.mat(C.gold if i % 2 == 0 else C.red), {"p": [sin(a) * 0.66, -0.58, cos(a) * 0.52]}))
	return Kit.group({}, parts)


static func _big_fish() -> Node3D:
	var blue := Kit.mat("#7FC6E8")
	return Kit.group({"p": [-1.25, 0.95, -0.2], "r": [0, 0.5, 0]}, [
		Kit.mesh(Geo.ball(0.42, 1), blue, {"s": [1.6, 1, 0.85]}),
		Kit.mesh(Geo.cone(0.32, 0.42, 4), blue, {"p": [-0.78, 0, 0], "r": [0, 0, PI / 2], "s": [1, 1, 0.4]}),
		Kit.mesh(Geo.ball(0.06, 0), Kit.mat(C.ink, {"smooth": true}), {"p": [0.46, 0.12, 0.3]}),
		Kit.mesh(Geo.torus(0.1, 0.02, PI, 8), Kit.mat(C.ink), {"p": [0.6, -0.08, 0.25], "r": [0, 0.6, PI]}),
	])


## Veste a fantasia; devolve se ela segura algo na mão direita.
static func dress(id: String, head: Node3D, torso: Node3D, arm_r: Node3D, root: Node3D) -> bool:
	match id:
		"adao":
			torso.add_child(_robe("#8A5A34", 0.8))
			head.add_child(_hair("#3B2416"))
		"eva":
			torso.add_child(_robe("#B07A50", 0.85))
			head.add_child(_hair("#3B2416", true))
			head.add_child(Kit.group({"p": [0.48, 0.3, 0.26]}, [Kit.mesh(Geo.ball(0.09, 1), Kit.mat("#F4A6C1")), Kit.mesh(Geo.ball(0.04, 0), Kit.mat(C.gold), {"p": [0, 0, 0.07]})]))
		"serpente":
			var green := Kit.mat("#2F6B3A")
			var light := Kit.mat("#7FD06B")
			var eye := Kit.mat(C.gold, {"emissive": C.gold, "emissiveIntensity": 0.4})
			torso.add_child(_robe("#3E8C4A"))
			head.add_child(Kit.mesh(Geo.ball(0.62, 1), green, {"p": [0, 0.2, -0.08], "s": [1, 0.72, 0.95]}))
			head.add_child(Kit.group({"p": [0, 0.62, 0.22]}, [Kit.mesh(Geo.ball(0.24, 1), light, {"s": [1.1, 0.6, 1.4]}), Kit.mesh(Geo.ball(0.05, 0), eye, {"p": [0.1, 0.08, 0.22]}), Kit.mesh(Geo.ball(0.05, 0), eye, {"p": [-0.1, 0.08, 0.22]})]))
			root.add_child(Kit.mesh(Geo.torus(0.62, 0.12, PI * 1.4, 18), light, {"p": [0, 0.12, -0.1], "r": [PI / 2, 0, 0.8]}))
		"noe":
			torso.add_child(_robe("#6E4A2E"))
			head.add_child(_headcloth("#D9C9A0", "#8A5A34"))
			head.add_child(_beard("#F2F2F2"))
			torso.add_child(_dove())
		"abraao":
			torso.add_child(_robe("#C9A46A"))
			torso.add_child(_bands(["#C9A46A", "#7A5233", "#C9A46A", "#7A5233", "#C9A46A"]))
			head.add_child(_headcloth(C.linen, "#7A5233"))
			head.add_child(_beard("#CFCFCF"))
			arm_r.add_child(_staff())
			return true
		"jose":
			torso.add_child(_bands(["#D64545", "#F2B630", "#4C8DF0", "#5CC46A", "#9B5BE0", "#FF9A3C"]))
			head.add_child(_hair("#2A1A10"))
		"moises":
			torso.add_child(_robe("#8E3B2F"))
			head.add_child(_headcloth("#E9DCC0"))
			head.add_child(_beard("#F4F4F4", 0.56))
			arm_r.add_child(_staff("#6B4423"))
			return true
		"miriam":
			torso.add_child(_robe("#B0447A"))
			head.add_child(_headcloth("#F2D7E3", "#B0447A"))
			arm_r.add_child(_tambourine())
			return true
		"aarao":
			torso.add_child(_robe("#2A3C9C"))
			torso.add_child(_pomegranate_hem())
			torso.add_child(_breastplate())
			head.add_child(Kit.mesh(Geo.cyl(0.5, 0.48, 0.34, 10), Kit.mat(C.white), {"p": [0, 0.48, 0], "s": [1, 1, 0.9]}))
			head.add_child(Kit.mesh(Geo.box(0.36, 0.1, 0.03), Kit.mat(C.gold, {"emissive": C.gold, "emissiveIntensity": 0.3}), {"p": [0, 0.44, 0.45]}))
		"davi":
			torso.add_child(_robe("#6D3B9E"))
			head.add_child(_hair("#7A3E1D"))
			head.add_child(_crown())
			arm_r.add_child(_harp())
			return true
		"ester":
			torso.add_child(_robe("#8E3AA6", 1.02, 0.7))
			torso.add_child(Kit.mesh(Geo.torus(0.36, 0.035, TAU, 14), Kit.mat(C.gold, {"smooth": true}), {"p": [0, 0.38, 0.06], "r": [PI / 2 - 0.2, 0, 0]}))
			head.add_child(_hair("#2A1A10", true))
			head.add_child(_crown(C.gold, "#4C8DF0"))
		"mordecai":
			torso.add_child(_robe("#F4F6FB"))
			torso.add_child(_bands(["#F4F6FB", "#2D5DB8", "#F4F6FB", "#2D5DB8"], 0.1, 0.74))
			head.add_child(_beard("#4A3324"))
			head.add_child(_crown())
		"jonas":
			torso.add_child(_robe("#2E7FB8"))
			head.add_child(_hair("#3B2416"))
			root.add_child(_big_fish())
	return false
