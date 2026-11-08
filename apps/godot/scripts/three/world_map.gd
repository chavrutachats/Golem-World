## O mapa do Golem World em 3D (porte de apps/mobile/src/three/map.ts e de buildBeitMidrash):
## cada livro da Torá é uma ilha no mar, com o caminho de pedrinhas ligando as parashiot e a
## casa de estudos no fim. A câmera é ortográfica e inclinada (vista de cima, na diagonal).
class_name WorldMap

const C := Kit.C
const MAP_W := 120.0
const MAP_UNIT := 0.1
const MAP_SPAN := MAP_W * MAP_UNIT
const MAP_TILT := deg_to_rad(42.0)


## Do mapa (x, y em unidades do mapa, y do topo do mapa inteiro) para o mundo.
static func to_world(mx: float, my: float) -> Vector3:
	return Vector3((mx - MAP_W / 2.0) * MAP_UNIT, 0.0, my * MAP_UNIT)


## A ilha de um livro: terra, praia, barranco e enfeites (tudo numa malha só).
static func island(w: Dictionary, top: float) -> Node3D:
	var d := JourneyData.data()
	var t: Dictionary = d.terrain[w.terrain]
	var layout: Dictionary = w.layout
	var depth := float(layout.height) * MAP_UNIT
	var z0 := top * MAP_UNIT
	var r := Kit.seeded(Kit.hash_string(str(w.id)))
	var g := Node3D.new()
	var land := Kit.mesh(Geo.rbox(MAP_SPAN - 0.2, 0.5, depth - 0.3, 0.35, 3), Kit.mat(t.land), {"p": [0, -0.25, z0 + depth / 2]})
	var shore := Node3D.new()
	shore.add_child(Kit.mesh(Geo.rbox(MAP_SPAN + 0.5, 0.36, depth + 0.4, 0.4, 3), Kit.mat(t.edge), {"p": [0, -0.42, z0 + depth / 2]}))
	shore.add_child(Kit.mesh(Geo.rbox(MAP_SPAN + 0.2, 1.4, depth + 0.1, 0.5, 2), Kit.mat(t.cliff), {"p": [0, -1.25, z0 + depth / 2]}))
	var trees := Node3D.new()
	for item in layout.decor:
		var kind := str(item.sprite)
		var o := Nature.decor(kind, floori(r.next() * 1000))
		var fp := float(d.footprint.get(kind, 10))
		o.position = to_world(float(item.x) + fp / 2.0, top + float(item.y) + fp * 0.6)
		o.rotation.y = r.next() * TAU
		o.scale = Vector3.ONE * float(d.decorScale.get(kind, 0.62)) * (0.85 + r.next() * 0.3)
		trees.add_child(o)
	g.add_child(land)
	# A terra recebe as sombras das árvores e do Golem; ela mesma não projeta.
	land.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	g.add_child(MeshKit.merge(shore, false))
	g.add_child(MeshKit.merge(trees, true))
	return g


## Pedrinhas do caminho entre duas fases (só aparecem quando o trecho está aberto).
static func path_stones(dots: Array, top: float, seed: int) -> Node3D:
	var r := Kit.seeded(seed)
	var raw := Node3D.new()
	for d in dots:
		var p := to_world(float(d.x), top + float(d.y))
		raw.add_child(Kit.mesh(Geo.dodeca(0.13), Kit.mat("#F4EBD6"), {"p": [p.x, 0.02, p.z], "s": [1.2, 0.35, 1], "r": [0, r.next() * 3, 0]}))
	return MeshKit.merge(raw, false)


## A pedra de uma fase: dourada com estrela quando concluída, clara com anel quando
## aberta, cinza com cadeado quando fechada. look: locked | open | done.
static func node_stone(look: String) -> Node3D:
	var top_c := C.gold if look == "done" else ("#FFFFFF" if look == "open" else "#A7A9B3")
	var side_c := C.goldDeep if look == "done" else ("#D9DCE6" if look == "open" else "#7D808C")
	var parts: Array = [
		Kit.mesh(Geo.cyl(0.62, 0.7, 0.32, 14), Kit.mat(side_c), {"p": [0, 0.16, 0]}),
		Kit.mesh(Geo.cyl(0.6, 0.62, 0.06, 14), Kit.mat(top_c), {"p": [0, 0.35, 0]}),
	]
	if look == "done":
		var star := PackedVector2Array()
		for i in 10:
			var a := float(i) / 10.0 * TAU + PI / 2.0
			var rr := 0.13 if i % 2 else 0.3
			star.append(Vector2(cos(a) * rr, sin(a) * rr))
		parts.append(Kit.mesh(Geo.shape("node-star", star, 0.06), Kit.mat("#FFF1B8", {"emissive": "#FFD54A", "emissiveIntensity": 0.35}), {"p": [0, 0.4, 0], "r": [-PI / 2, 0, 0]}))
	elif look == "open":
		parts.append(Kit.mesh(Geo.torus(0.78, 0.05, TAU, 28), Kit.glow(C.gold), {"p": [0, 0.06, 0], "r": [PI / 2, 0, 0], "name": "ring", "shadow": false}))
	else:
		parts.append(Kit.mesh(Geo.rbox(0.3, 0.24, 0.12, 0.04), Kit.mat("#5E616D"), {"p": [0, 0.55, 0]}))
		parts.append(Kit.mesh(Geo.torus(0.1, 0.035, PI, 10), Kit.mat("#5E616D"), {"p": [0, 0.67, 0]}))
	return Kit.group({}, parts)


## O mar em volta das ilhas, com risquinhos de onda.
static func sea(length: float) -> Node3D:
	var water := Kit.mesh(Geo.plane(60, length + 40), Kit.mat("#3E8EDB", {"smooth": true}), {"p": [0, -0.9, length / 2], "r": [-PI / 2, 0, 0], "shadow": false})
	var r := Kit.seeded(77)
	var raw := Node3D.new()
	for i in floori(length * 1.2):
		raw.add_child(Kit.mesh(Geo.box(0.5 + r.next() * 0.6, 0.02, 0.08), Kit.glow("#9ED3FF", 0.8), {"p": [(r.next() - 0.5) * 24, -0.88, r.next() * (length + 20) - 10], "shadow": false}))
	var g := Node3D.new()
	g.add_child(water)
	g.add_child(MeshKit.merge(raw, false))
	return g


# --- Casas de estudo (o fim de cada livro) ----------------------------------------------


static func _lit_window(p: Array, w := 0.28, h := 0.4) -> MeshInstance3D:
	return Kit.mesh(Geo.rbox(w, h, 0.04, 0.06), Kit.mat("#FFE7A0", {"emissive": "#FFC94A", "emissiveIntensity": 0.8}), {"p": p, "shadow": false})


static func _books(p: Array) -> Node3D:
	var colors := [C.red, C.velvet, C.leafDark, C.goldDeep, "#6B4A9A"]
	var parts: Array = []
	for i in colors.size():
		parts.append(Kit.mesh(Geo.box(0.12, 0.42 - (i % 2) * 0.06, 0.3), Kit.mat(colors[i]), {"p": [(i - 2) * 0.13, 0.21, 0]}))
	return Kit.group({"p": p}, parts)


static func _cloud_pillar() -> Node3D:
	var parts: Array = []
	for i in 8:
		parts.append(Kit.mesh(Geo.ball(0.7 - (i % 2) * 0.12, 1), Kit.mat("#F2F4F8"), {"p": [sin(i) * 0.2, 0.6 + i * 0.75, 0], "shadow": false}))
	return Kit.group({}, parts)


static func goal_flag(color: String = C.gold) -> Node3D:
	return Kit.group({}, [
		Kit.mesh(Geo.cyl(0.04, 0.04, 2.0, 6), Kit.mat("#E9E2D0"), {"p": [0, 1.0, 0]}),
		Kit.mesh(Geo.box(0.7, 0.45, 0.03), Kit.mat(color), {"p": [0.36, 1.7, 0], "name": "cloth"}),
		Kit.mesh(Geo.ball(0.08, 1), Kit.mat(C.gold), {"p": [0, 2.05, 0]}),
	])


static func _scaled(o: Node3D, s: float) -> Node3D:
	o.scale = Vector3.ONE * s
	return o


static func _moved(o: Node3D, p: Vector3) -> Node3D:
	o.position += p
	return o


static func beit_midrash(style: String) -> Node3D:
	var stone := Kit.mat("#E7D7B8")
	var stone_dark := Kit.mat("#CDB792")
	var roof := Kit.mat("#B05A3C")
	var door := Kit.mat("#6B4426")
	match style:
		"yeshiva":
			return Kit.group({}, [
				Kit.mesh(Geo.box(3, 2, 2), stone, {"p": [0, 1, 0]}),
				Kit.mesh(Geo.cone(2.3, 1.2, 4), roof, {"p": [0, 2.6, 0], "r": [0, PI / 4, 0], "s": [1, 1, 0.75]}),
				Kit.mesh(Geo.rbox(0.7, 1.2, 0.06, 0.3), door, {"p": [0, 0.6, 1.01]}),
				_lit_window([0.95, 1.3, 1.01]), _lit_window([-0.95, 1.3, 1.01]),
				_books([0.95, 0.0, 1.3]),
			])
		"tent":
			return Kit.group({}, [
				Kit.mesh(Geo.box(3.2, 1.7, 1.8), Kit.mat("#6E3F7E"), {"p": [0, 0.85, 0]}),
				Kit.mesh(Geo.box(3.3, 0.2, 1.9), Kit.mat("#3E5FB0"), {"p": [0, 1.75, 0]}),
				Kit.mesh(Geo.box(1.0, 1.3, 0.04), Kit.mat(C.linen), {"p": [0, 0.65, 0.91]}),
				_moved(_scaled(_cloud_pillar(), 0.55), Vector3(0, 1.9, 0)),
				Kit.mesh(Geo.cyl(0.05, 0.05, 1.8, 6), Kit.mat(C.gold), {"p": [-1.8, 0.9, 0.95]}),
				Kit.mesh(Geo.cyl(0.05, 0.05, 1.8, 6), Kit.mat(C.gold), {"p": [1.8, 0.9, 0.95]}),
			])
		"beit-midrash":
			return Kit.group({}, [
				Kit.mesh(Geo.box(3.4, 2.2, 2), stone, {"p": [0, 1.1, 0]}),
				Kit.mesh(Geo.sphere(1, 12, 6, PI / 2), Kit.mat(C.gold), {"p": [0, 2.2, 0]}),
				Kit.mesh(Geo.rbox(0.8, 1.3, 0.06, 0.35), door, {"p": [0, 0.65, 1.01]}),
				_lit_window([1.1, 1.4, 1.01]), _lit_window([-1.1, 1.4, 1.01]),
				Kit.mesh(Geo.box(3.6, 0.15, 2.2), stone_dark, {"p": [0, 0.07, 0]}),
			])
		"desert-yeshiva":
			return Kit.group({}, [
				_scaled(Nature.tent(4, "#E2C9A3"), 1.8),
				_moved(Nature.tent(5, "#C9A27A"), Vector3(1.8, 0, -0.6)),
				_moved(Nature.tent(6, "#B9875E"), Vector3(-1.8, 0, -0.6)),
				_lit_window([0, 0.35, 0.65], 0.3, 0.35),
				Kit.mesh(Geo.cyl(0.04, 0.04, 2.6, 5), Kit.mat(C.woodDark), {"p": [0.9, 1.3, 0.6]}),
				Kit.mesh(Geo.box(0.6, 0.4, 0.03), Kit.mat("#3E7BD6"), {"p": [1.22, 2.35, 0.6]}),
			])
	# "synagogue": a sinagoga com o Magen David na fachada.
	var star_a := PackedVector2Array()
	var star_b := PackedVector2Array()
	for i in 6:
		var a := float(i) / 6.0 * TAU + PI / 2.0
		star_a.append(Vector2(cos(a) * 0.32, sin(a) * 0.32))
		var b := float(i) / 6.0 * TAU - PI / 2.0
		star_b.append(Vector2(cos(b) * 0.32, sin(b) * 0.32))
	var blue := Kit.mat("#3E7BD6", {"emissive": "#3E7BD6", "emissiveIntensity": 0.3})
	return Kit.group({}, [
		Kit.mesh(Geo.box(3.6, 2.4, 2.2), stone, {"p": [0, 1.2, 0]}),
		Kit.mesh(Geo.box(3.8, 0.25, 2.4), stone_dark, {"p": [0, 2.5, 0]}),
		Kit.mesh(Geo.rbox(1, 1.5, 0.06, 0.45), door, {"p": [0, 0.75, 1.11]}),
		Kit.mesh(Geo.shape("magen-a", star_a, 0.05), blue, {"p": [0, 1.85, 1.12]}),
		Kit.mesh(Geo.shape("magen-b", star_b, 0.05), blue, {"p": [0, 1.85, 1.13]}),
		_lit_window([1.25, 1.4, 1.11]), _lit_window([-1.25, 1.4, 1.11]),
		_moved(goal_flag(C.techelet), Vector3(-1.6, 0, 1.4)),
		_moved(goal_flag(C.techelet), Vector3(1.6, 0, 1.4)),
	])
