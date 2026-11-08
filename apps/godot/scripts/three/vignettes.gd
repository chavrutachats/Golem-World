## As cenas animadas do mapa (porte de apps/mobile/src/three/vignettes.ts). Entre uma fase
## e a seguinte, uma cena pequena conta a parashá que vem (Nôach construindo a arca e os
## bichos subindo, a escada de Yaakov…); no topo do mapa, a Criação.
##
## Cada cena é uma lista de peças com um movimento simples, calculado por uma função pura do
## tempo (o mesmo do app).
class_name Vignettes

const C := Kit.C
const SCALE := 1.2
const CREATION_PERIOD := 16.0

const PARASHA_VIGNETTE := {
	"noach": "ark", "lech-lecha": "stars", "vayera": "akedah", "chayei-sarah": "well", "toldot": "stew",
	"vayetze": "ladder", "vayishlach": "sunrise", "vayeshev": "dreams", "miketz": "cows", "vayigash": "wagons",
	"vayechi": "lion", "shemot": "bush", "vaera": "frogs", "bo": "darkness", "beshalach": "sea", "yitro": "sinai",
	"mishpatim": "sinai", "terumah": "building", "tetzaveh": "mishkan", "ki-tisa": "calf", "vayakhel": "building",
	"pekudei": "mishkan", "vayikra": "mishkan", "tzav": "mishkan", "shmini": "mishkan", "tazria": "camp",
	"metzora": "city", "acharei-mot": "mishkan", "kedoshim": "harvest", "emor": "harvest", "behar": "harvest",
	"bechukotai": "harvest", "bamidbar": "camp", "nasso": "camp", "behaalotcha": "mishkan", "shlach": "grapes",
	"korach": "mishkan", "chukat": "rock", "balak": "donkey", "pinchas": "camp", "matot": "city", "masei": "city",
	"devarim": "farewell", "vaetchanan": "sinai", "eikev": "harvest", "reeh": "harvest", "shoftim": "city",
	"ki-teitzei": "city", "ki-tavo": "harvest", "nitzavim": "farewell", "vayeilech": "farewell", "haazinu": "farewell",
	"vezot-haberachah": "farewell",
}


## Caixa (no espaço do nó) de todas as malhas de um objeto.
static func bounds(o: Node3D) -> AABB:
	var box := AABB()
	var first := true
	var stack: Array = [[o, Transform3D.IDENTITY]]
	while not stack.is_empty():
		var it: Array = stack.pop_back()
		var n: Node3D = it[0]
		var xf: Transform3D = it[1]
		if n is MeshInstance3D and (n as MeshInstance3D).mesh:
			var b: AABB = xf * (n as MeshInstance3D).mesh.get_aabb()
			box = b if first else box.merge(b)
			first = false
		for c in n.get_children():
			if c is Node3D:
				stack.append([c, xf * (c as Node3D).transform])
	return box


## Escala o objeto para que a maior medida seja `size`, apoiado no chão (y = 0).
static func fit(o: Node3D, size: float) -> Node3D:
	var box := bounds(o)
	var dims := box.size
	var k := size / maxf(maxf(dims.x, dims.y), maxf(dims.z, 1e-3))
	var holder := Node3D.new()
	o.scale *= k
	o.position.y -= box.position.y * k
	holder.add_child(o)
	return holder


static func _part(make: Callable, size: float, at: Array, motion: Dictionary = {}, phase := 0.0, rot_y := 0.0) -> Dictionary:
	return {"make": make, "size": size, "at": at, "motion": motion, "phase": phase, "rotY": rot_y}


## Monta as peças; os movimentos ficam na meta "anims" do grupo.
static func build_parts(parts: Array) -> Node3D:
	var g := Node3D.new()
	var anims: Array = []
	for p in parts:
		var o := fit((p.make as Callable).call(), float(p.size))
		o.position = Vector3(p.at[0], p.at[1], p.at[2])
		o.rotation.y = float(p.rotY)
		g.add_child(o)
		if not (p.motion as Dictionary).is_empty():
			anims.append({"obj": o, "m": p.motion, "phase": float(p.phase), "base": o.position, "rotY": float(p.rotY)})
	g.set_meta("anims", anims)
	return g


## Aplica os movimentos da cena no instante t (segundos).
static func animate(g: Node3D, t: float) -> void:
	for a in g.get_meta("anims", []):
		var m: Dictionary = a.m
		var o: Node3D = a.obj
		var base: Vector3 = a.base
		var ph: float = a.phase
		match str(m.kind):
			"bob":
				o.position.y = base.y + sin((t + ph * 10) * m.speed) * m.amp
			"spin":
				o.rotation.y = float(a.rotY) + t * m.speed
			"flicker":
				o.scale = Vector3(1, 0.85 + 0.25 * absf(sin((t + ph * 3) * m.speed)), 1)
			"pulse":
				o.scale = Vector3.ONE * (1 + sin((t + ph * 5) * m.speed) * m.amp)
			"sway":
				o.rotation.z = sin((t + ph * 4) * m.speed) * m.amp
			"walk":
				var u := fposmod(t / m.period + ph, 1.0)
				var hop: float = m.get("hop", 0.0)
				o.position = Vector3(m.from[0] + (m.to[0] - m.from[0]) * u, base.y + (absf(sin(u * TAU * 4)) * hop if hop > 0 else 0.0), m.from[1] + (m.to[1] - m.from[1]) * u)
				o.rotation.y = -atan2(m.to[1] - m.from[1], m.to[0] - m.from[0])
				# Aparece e some nas pontas, para o recomeço não "pular".
				o.scale = Vector3.ONE * maxf(0.001, minf(1.0, minf(u * 8, (1 - u) * 8)))
			"patrol":
				var u := fposmod(t / m.period + ph, 1.0)
				var k := u * 2 if u < 0.5 else 2 - u * 2
				var e := k * k * (3 - 2 * k)
				o.position = Vector3(m.from[0] + (m.to[0] - m.from[0]) * e, base.y, m.from[1] + (m.to[1] - m.from[1]) * e)
				var dir := 1.0 if u < 0.5 else -1.0
				o.rotation.y = -atan2((m.to[1] - m.from[1]) * dir, (m.to[0] - m.from[0]) * dir)
			"orbit":
				var ang: float = (t / float(m.period) + ph) * TAU
				o.position = Vector3(base.x + cos(ang) * m.r, m.y, base.z + sin(ang) * m.r)
				o.rotation.y = -ang - PI / 2
			"rise":
				var u := fposmod(t / m.period + ph, 1.0)
				o.position.y = m.from + (m.to - m.from) * u
				var s := maxf(0.05, 1 - u) if m.get("shrink", false) else maxf(0.001, minf(1.0, minf(u * 6, (1 - u) * 6)))
				o.scale = Vector3.ONE * s
			"grow":
				var u := fposmod(t / m.period + ph, 1.0)
				var k := clampf((u - m.at) / 0.08, 0.0, 1.0)
				o.scale = Vector3.ONE * maxf(0.001, k * ((1 - u) / 0.06 if u > 0.94 else 1.0))


# --- Peças pequenas ----------------------------------------------------------------------


static func _ob(id: String) -> Callable:
	return func(): return Story.obstacle(id)


static func _pr(id: String, seed := 1) -> Callable:
	return func(): return Story.prop(id, seed)


static func _sparkle(color := "#FFF3B0") -> Node3D:
	return Kit.group({}, [Kit.mesh(Geo.ball(0.5, 1), Kit.glow(color)), Kit.mesh(Geo.torus(0.75, 0.08, TAU, 16), Kit.glow(color, 0.6), {"r": [PI / 2, 0, 0], "shadow": false})])


static func _hammer() -> Node3D:
	return Kit.group({}, [Kit.mesh(Geo.box(0.12, 0.9, 0.12), Kit.mat(C.wood)), Kit.mesh(Geo.box(0.5, 0.22, 0.24), Kit.mat("#6F6A66"), {"p": [0, 0.5, 0]})])


static func _water() -> Node3D:
	return Kit.group({}, [Kit.mesh(Geo.cyl(1, 1, 0.12, 18), Kit.mat(C.water, {"smooth": true}))])


static func _bubble() -> Node3D:
	return Kit.group({}, [Kit.mesh(Geo.ball(0.4, 1), Kit.glow("#F4F0E6", 0.85))])


static func _well() -> Node3D:
	return Kit.group({}, [Kit.mesh(Geo.cyl(0.8, 0.9, 0.7, 12), Kit.mat(C.stone)), Kit.mesh(Geo.cyl(0.62, 0.62, 0.05, 12), Kit.mat(C.water), {"p": [0, 0.36, 0]})])


static func _drop() -> Node3D:
	return Kit.group({}, [Kit.mesh(Geo.ball(0.3, 1), Kit.glow(C.waterLight))])


## Bichos (ou coisas) andando em fila até um ponto.
static func _procession(ids: Array, from: Array, to: Array, period: float, size := 0.5) -> Array:
	var out: Array = []
	for i in ids.size():
		out.append(_part(_ob(ids[i]), size, [from[0], 0, from[1]], {"kind": "walk", "from": from, "to": to, "period": period}, float(i) / ids.size()))
	return out


static func _scene(kind: String) -> Array:
	match kind:
		"ark":
			return [_part(_pr("ark"), 2.1, [0.55, 0, -0.1])] + _procession(["lion", "sheep", "camel", "cow", "donkey", "sheep"], [-1.7, 0.75], [-0.05, 0.05], 7) + [
				_part(_hammer, 0.4, [1.5, 0.6, 0.55], {"kind": "sway", "amp": 0.7, "speed": 6}),
				_part(_ob("bird"), 0.35, [0.55, 1.6, -0.1], {"kind": "orbit", "r": 0.9, "period": 5, "y": 1.7}),
			]
		"stars":
			var parts: Array = [_part(_pr("tents"), 1.6, [-0.5, 0, 0])]
			for k in 7:
				parts.append(_part(func(): return _sparkle(), 0.16, [-0.9 + k * 0.32, 1.6 + (k % 3) * 0.25, -0.4], {"kind": "pulse", "amp": 0.5, "speed": 3}, k / 7.0))
			parts.append(_part(_ob("camel"), 0.7, [1, 0, 0.3], {"kind": "patrol", "from": [0.6, 0.5], "to": [1.5, 0.1], "period": 7}))
			return parts
		"akedah":
			return [
				_part(_pr("mountain"), 1.9, [0, 0, -0.2]),
				_part(_ob("fire"), 0.35, [0.05, 1.2, -0.2], {"kind": "flicker", "speed": 9}),
				_part(_ob("sheep"), 0.5, [1.1, 0, 0.4], {"kind": "bob", "amp": 0.05, "speed": 5}),
				_part(_ob("thorns"), 0.45, [1.45, 0, 0.3]),
			]
		"well":
			return [_part(_well, 0.8, [0.2, 0, 0])] + _procession(["camel", "camel", "camel"], [-1.7, 0.6], [-0.4, 0.1], 8, 0.7) + [_part(_ob("jar"), 0.35, [0.9, 0, 0.3], {"kind": "bob", "amp": 0.08, "speed": 4})]
		"stew":
			var parts: Array = [_part(_ob("pot"), 0.7, [0, 0, 0]), _part(_ob("fire"), 0.35, [0, 0, 0.05], {"kind": "flicker", "speed": 10})]
			for k in 3:
				parts.append(_part(_bubble, 0.16, [0.1 * (k - 1), 0.7, 0], {"kind": "rise", "from": 0.7, "to": 1.6, "period": 2.4, "shrink": true}, k / 3.0))
			parts.append(_part(_ob("sheep"), 0.5, [1.2, 0, 0.2], {"kind": "patrol", "from": [0.9, 0.4], "to": [1.5, 0], "period": 6}))
			return parts
		"ladder":
			var parts: Array = [_part(_pr("ladder"), 2.2, [0, 0, 0])]
			for k in 4:
				parts.append(_part(func(): return _sparkle("#FFFFFF"), 0.2, [0.25 if k % 2 else -0.25, 0, 0.1], {"kind": "rise", "from": 2.1 if k % 2 else 0.2, "to": 0.2 if k % 2 else 2.1, "period": 4}, k / 4.0))
			parts.append(_part(_ob("rock"), 0.45, [0.9, 0, 0.4]))
			return parts
		"sunrise":
			return [_part(_pr("sun"), 0.7, [0, 0, -0.6], {"kind": "rise", "from": 0.1, "to": 1.9, "period": 8})] + _procession(["sheep", "sheep", "sheep", "cow"], [-1.6, 0.5], [1.6, 0.4], 9)
		"dreams":
			var parts: Array = []
			for k in 4:
				parts.append(_part(_ob("wheat"), 0.55, [-1 + k * 0.45, 0, -0.1], {"kind": "sway", "amp": 0.35, "speed": 2.4}, k / 4.0))
			parts.append(_part(_ob("wheat"), 0.7, [0.9, 0, 0.3], {"kind": "bob", "amp": 0.06, "speed": 2}))
			parts.append(_part(_ob("camel"), 0.6, [1.3, 0, -0.4]))
			return parts
		"cows":
			return [_part(_pr("pyramids"), 1.6, [0.8, 0, -0.5])] + _procession(["cow", "cow", "cow", "cow"], [-1.7, 0.5], [0.6, 0.6], 8, 0.5) + [_part(_ob("wheat"), 0.5, [-0.9, 0, -0.4], {"kind": "sway", "amp": 0.3, "speed": 2})]
		"wagons":
			return [
				_part(_pr("pyramids"), 1.3, [-1.1, 0, -0.5]),
				_part(_pr("tents"), 1.1, [1.2, 0, -0.4]),
				_part(_ob("wagon"), 0.7, [0, 0, 0.3], {"kind": "patrol", "from": [-0.9, 0.4], "to": [0.9, 0.3], "period": 7}),
				_part(_ob("donkey"), 0.55, [0, 0, 0.3], {"kind": "patrol", "from": [-0.5, 0.45], "to": [1.3, 0.35], "period": 7}),
			]
		"lion":
			var parts: Array = [_part(_ob("lion"), 0.8, [0, 0, 0.1], {"kind": "bob", "amp": 0.04, "speed": 3})]
			for k in 12:
				parts.append(_part(func(): return _sparkle(), 0.12, [cos(k / 12.0 * TAU) * 1.1, 1.3 + sin(k / 12.0 * TAU) * 0.35, -0.3], {"kind": "pulse", "amp": 0.6, "speed": 2.5}, k / 12.0))
			return parts
		"bush":
			return [
				_part(_pr("bush-fire"), 1.2, [0, 0, 0], {"kind": "flicker", "speed": 7}),
				_part(_ob("sheep"), 0.45, [1.1, 0, 0.3], {"kind": "patrol", "from": [0.9, 0.5], "to": [1.5, 0.1], "period": 6}),
				_part(_ob("sheep"), 0.45, [-1.1, 0, 0.3], {"kind": "patrol", "from": [-1.5, 0.4], "to": [-0.8, 0.1], "period": 7}, 0.4),
			]
		"frogs":
			var parts: Array = [_part(_pr("pyramids"), 1.4, [0.9, 0, -0.5]), _part(_water, 1.2, [-0.7, 0, 0], {"kind": "pulse", "amp": 0.04, "speed": 2})]
			for k in 4:
				parts.append(_part(_ob("frog"), 0.3, [0, 0, 0], {"kind": "walk", "from": [-0.7, 0.1], "to": [1.2, 0.6 - k * 0.15], "period": 5, "hop": 0.25}, k / 4.0))
			return parts
		"darkness":
			var parts: Array = [_part(_pr("moon"), 0.6, [0.6, 1.5, -0.4], {"kind": "bob", "amp": 0.1, "speed": 1}), _part(_ob("darkness"), 0.9, [-0.7, 0.2, 0], {"kind": "pulse", "amp": 0.15, "speed": 1.6})]
			for k in 5:
				parts.append(_part(_ob("locust"), 0.25, [0, 0, 0], {"kind": "orbit", "r": 0.9, "period": 3 + k * 0.4, "y": 0.8 + k * 0.12}, k / 5.0))
			parts.append(_part(_ob("sheep"), 0.45, [1.2, 0, 0.4]))
			return parts
		"sea":
			return [_part(_sea_walls, 2.3, [0, 0, 0], {"kind": "pulse", "amp": 0.03, "speed": 2.5})] + _procession(["sheep", "cow", "donkey", "sheep", "camel"], [-1.3, 0.05], [1.3, 0.05], 8, 0.38) + [_part(_pr("cloud-pillar"), 1.1, [1.6, 0, -0.5], {"kind": "bob", "amp": 0.1, "speed": 1.5})]
		"sinai":
			return [
				_part(_pr("mountain"), 2.1, [0, 0, -0.3]),
				_part(_ob("cloud"), 0.9, [0, 1.5, -0.3], {"kind": "bob", "amp": 0.1, "speed": 1.2}),
				_part(_ob("fire"), 0.35, [0.05, 1.25, -0.25], {"kind": "flicker", "speed": 11}),
				_part(_pr("tablets"), 0.7, [1.2, 0.1, 0.4], {"kind": "bob", "amp": 0.08, "speed": 2}),
			]
		"calf":
			return [
				_part(_ob("calf"), 0.7, [-0.4, 0, 0.1], {"kind": "spin", "speed": 0.6}),
				_part(_pr("tablets"), 0.75, [0.9, 0.1, 0], {"kind": "bob", "amp": 0.08, "speed": 2}),
				_part(_pr("mountain"), 1.4, [0.4, 0, -0.8]),
			]
		"mishkan":
			return [
				_part(_pr("mishkan"), 1.8, [0, 0, -0.1]),
				_part(_pr("cloud-pillar"), 1.1, [0, 1.0, -0.2], {"kind": "bob", "amp": 0.12, "speed": 1.3}),
				_part(_ob("fire"), 0.3, [1.25, 0, 0.45], {"kind": "flicker", "speed": 9}),
				_part(_ob("jar"), 0.3, [-1.2, 0, 0.45], {"kind": "bob", "amp": 0.05, "speed": 3}),
			]
		"building":
			return [_part(_pr("mishkan"), 1.5, [0.4, 0, -0.2])] + _procession(["planks", "cloth", "jar", "planks"], [-1.7, 0.6], [-0.3, 0.2], 7, 0.4) + [_part(_hammer, 0.35, [1.4, 0.5, 0.5], {"kind": "sway", "amp": 0.7, "speed": 6})]
		"camp":
			var parts: Array = [_part(_pr("tents"), 1.4, [0, 0, -0.2])]
			for k in 4:
				parts.append(_part(_ob("banner"), 0.55, [-1.3 + k * 0.85, 0, 0.5], {"kind": "sway", "amp": 0.12, "speed": 3}, k / 4.0))
			return parts
		"grapes":
			return [
				_part(_pr("city"), 1.5, [0.7, 0, -0.5]),
				_part(_ob("grapes"), 0.55, [-0.5, 0, 0.3], {"kind": "patrol", "from": [-1.4, 0.4], "to": [-0.1, 0.3], "period": 6}),
				_part(_ob("grapes"), 0.55, [-0.5, 0, 0.3], {"kind": "patrol", "from": [-1.6, 0.0], "to": [-0.3, -0.1], "period": 6}, 0.3),
			]
		"rock":
			var parts: Array = [_part(_ob("rock"), 0.9, [0, 0, 0])]
			for k in 4:
				parts.append(_part(_drop, 0.14, [0.35, 0.5, 0.2], {"kind": "walk", "from": [0.35, 0.2], "to": [1.2, 0.6], "period": 1.6, "hop": 0.3}, k / 4.0))
			parts.append(_part(_ob("serpent"), 0.5, [-1.1, 0, 0.3], {"kind": "bob", "amp": 0.05, "speed": 2}))
			return parts
		"donkey":
			return [
				_part(_ob("donkey"), 0.75, [0, 0, 0.2], {"kind": "patrol", "from": [-1.2, 0.3], "to": [0.6, 0.3], "period": 6}),
				_part(func(): return _sparkle("#FFFFFF"), 0.3, [1.2, 0.9, 0.1], {"kind": "pulse", "amp": 0.4, "speed": 3}),
				_part(_pr("tents"), 1.1, [1.2, 0, -0.6]),
			]
		"harvest":
			var parts: Array = []
			for k in 5:
				parts.append(_part(_ob("wheat"), 0.5, [-1.2 + k * 0.45, 0, -0.2 + (k % 2) * 0.3], {"kind": "sway", "amp": 0.3, "speed": 2.2}, k / 5.0))
			parts.append(_part(_ob("basket"), 0.45, [1.2, 0, 0.3], {"kind": "bob", "amp": 0.06, "speed": 3}))
			parts.append(_part(func(): return Nature.tree(4), 1.1, [1.3, 0, -0.5]))
			return parts
		"city":
			var parts: Array = [_part(_pr("city", 3), 1.7, [0, 0, -0.2])]
			for k in 3:
				parts.append(_part(_ob("bird"), 0.3, [0, 0, -0.2], {"kind": "orbit", "r": 1.1, "period": 6 + k, "y": 1.5 + k * 0.15}, k / 3.0))
			return parts
		"farewell":
			return [
				_part(_pr("mountain"), 2, [0, 0, -0.3]),
				_part(_ob("bird"), 0.3, [0, 0, -0.3], {"kind": "orbit", "r": 1.2, "period": 7, "y": 1.6}),
				_part(_ob("cloud"), 0.8, [-1, 1.4, -0.4], {"kind": "patrol", "from": [-1.4, -0.5], "to": [1.2, -0.5], "period": 14}),
				_part(_ob("banner"), 0.55, [1.2, 0, 0.5], {"kind": "sway", "amp": 0.15, "speed": 3}),
			]
	return []


## As águas em pé dos dois lados do caminho (Kriat Yam Suf), em miniatura.
static func _sea_walls() -> Node3D:
	var parts: Array = []
	for z in [-0.55, 0.65]:
		parts.append(Kit.mesh(Geo.box(2.6, 0.9 if z < 0 else 0.35, 0.3), Kit.mat(C.water, {"opacity": 0.9 if z < 0 else 0.7}), {"p": [0, 0.45 if z < 0 else 0.18, z], "shadow": false}))
		parts.append(Kit.mesh(Geo.box(2.6, 0.06, 0.32), Kit.mat(C.waterLight), {"p": [0, 0.92 if z < 0 else 0.37, z], "shadow": false}))
	return Kit.group({}, parts)


## A cena de uma parashá (null para Bereshit, contada pela Criação no topo do mapa), num
## "palco" de terra batida.
static func vignette(parasha_id: String) -> Node3D:
	var kind: String = PARASHA_VIGNETTE.get(parasha_id, "")
	if kind == "":
		return null
	var scene := build_parts(_scene(kind))
	var g := Kit.group({"s": SCALE}, [
		Kit.mesh(Geo.cyl(1.55, 1.65, 0.08, 28), Kit.mat("#E2CC92"), {"p": [0, 0.02, 0], "shadow": false}),
		Kit.mesh(Geo.torus(1.6, 0.04, TAU, 40), Kit.mat("#C9AE6E"), {"p": [0, 0.06, 0], "r": [PI / 2, 0, 0], "shadow": false}),
		scene,
	])
	g.name = "vignette-%s" % parasha_id
	g.set_meta("scene", scene)
	return g


# --- A Criação ---------------------------------------------------------------------------


static func _smooth(a: float, b: float, x: float) -> float:
	var k := clampf((x - a) / (b - a), 0.0, 1.0)
	return k * k * (3 - 2 * k)


## O vazio sobre o mar, um disco escuro com estrelas; "haja luz" acende uma luz que vira o
## sol; a terra sobe das águas, brotam as árvores; o sol e a lua passam a girar; vêm as aves
## e, por fim, os bichos da terra. Recomeça a cada CREATION_PERIOD segundos.
class Creation:
	extends Node3D
	var light: Node3D
	var rays: Node3D
	var earth: Node3D
	var trees: Array = []
	var sun_orb: Node3D
	var moon_orb: Node3D
	var birds: Array = []
	var fish: Node3D
	var animals: Array = []
	var still := false
	var _t := 0.0

	func _init() -> void:
		name = "creation"
		add_child(Kit.mesh(Geo.cyl(4.6, 4.9, 0.3, 40), Kit.mat("#151A4E", {"smooth": true}), {"p": [0, -0.55, 0], "shadow": false}))
		add_child(Kit.mesh(Geo.torus(4.75, 0.06, TAU, 64), Kit.glow("#7C88FF", 0.8), {"p": [0, -0.4, 0], "r": [PI / 2, 0, 0], "shadow": false}))
		var sky := Nature.stars(70, 9, 5, 21)
		sky.rotation.x = -PI / 2
		sky.position = Vector3(0, -0.35, 2.5)
		add_child(sky)
		light = Kit.group({"p": [0, 1.2, 0]}, [Kit.mesh(Geo.ball(0.55, 2), Kit.glow("#FFF7D6")), Kit.mesh(Geo.ball(0.85, 2), Kit.glow("#FFE38A", 0.35))])
		rays = Node3D.new()
		for i in 12:
			rays.add_child(Kit.group({"r": [0, 0, float(i) / 12.0 * TAU]}, [Kit.mesh(Geo.box(0.06, 2.4, 0.06), Kit.glow("#FFF1B0", 0.7), {"p": [0, 1.6, 0], "shadow": false})]))
		rays.rotation.x = -0.6
		light.add_child(rays)
		earth = Kit.group({"p": [0, -0.35, 0]}, [
			Kit.mesh(Geo.cyl(1.7, 1.9, 0.5, 28), Kit.mat(Kit.C.water, {"smooth": true}), {"p": [0, 0.1, 0]}),
			Kit.mesh(Geo.cyl(1.1, 1.3, 0.55, 18), Kit.mat("#7CCB5E"), {"p": [0.25, 0.3, 0.05]}),
		])
		for k in 4:
			var t := Vignettes.fit(Nature.tree(k + 2), 0.75)
			var a := float(k) / 4.0 * TAU + 0.4
			t.position = Vector3(0.25 + cos(a) * 0.65, 0.22, 0.05 + sin(a) * 0.5)
			earth.add_child(t)
			trees.append(t)
		sun_orb = Kit.group({}, [Kit.mesh(Geo.ball(0.32, 2), Kit.glow("#FFD54A")), Kit.mesh(Geo.ball(0.46, 2), Kit.glow("#FFE38A", 0.3))])
		moon_orb = Kit.mesh(Geo.ball(0.22, 2), Kit.mat("#E9ECF5", {"smooth": true, "emissive": "#C9D6FF", "emissiveIntensity": 0.6}))
		for i in 3:
			birds.append(Vignettes.fit(Story.obstacle("bird"), 0.32))
		fish = Vignettes.fit(Story.obstacle("fish"), 0.35)
		for id in ["sheep", "lion", "cow"]:
			animals.append(Vignettes.fit(Story.obstacle(id), 0.42))
		for n in [light, earth, sun_orb, moon_orb, fish] + birds + animals:
			add_child(n)
		update(0.0)

	func _process(dt: float) -> void:
		if visible:
			_t += dt
			update(_t)

	func _vis(n: Node3D, k: float) -> void:
		n.visible = k > 0.01
		n.scale = Vector3.ONE * maxf(0.001, k)

	func update(time: float) -> void:
		var t := CREATION_PERIOD - 0.5 if still else fmod(time, CREATION_PERIOD)
		# 1. Trevas; 2. "haja luz": a luz acende e se abre em raios; depois vira o sol.
		var flash := Vignettes._smooth(1.2, 2.2, t) * (1.0 - Vignettes._smooth(3.4, 4.6, t))
		light.visible = flash > 0.01
		light.scale = Vector3.ONE * (0.2 + flash * 1.4)
		rays.rotation.z = time * 0.6
		rays.scale = Vector3.ONE * maxf(0.001, flash)
		# 3. A terra sobe das águas; as árvores brotam.
		var land: float = Vignettes._smooth(4.0, 5.2, t)
		earth.visible = land > 0.01
		earth.scale = Vector3(maxf(0.001, land), maxf(0.01, land), maxf(0.001, land))
		for k in trees.size():
			(trees[k] as Node3D).scale = Vector3.ONE * maxf(0.001, Vignettes._smooth(5.6 + k * 0.25, 6.4 + k * 0.25, t))
		# 4. O sol e a lua começam a girar em volta.
		var ang := time * 0.5
		_vis(sun_orb, Vignettes._smooth(3.6, 4.6, t))
		_vis(moon_orb, Vignettes._smooth(6.8, 7.6, t))
		sun_orb.position = Vector3(cos(ang) * 2.9, 1.7 + sin(ang * 2) * 0.15, sin(ang) * 1.6 - 0.4)
		moon_orb.position = Vector3(cos(ang + PI) * 2.9, 1.5, sin(ang + PI) * 1.6 - 0.4)
		# 5. As aves e os peixes; 6. os bichos da terra.
		var fly: float = Vignettes._smooth(8.5, 9.3, t)
		for k in birds.size():
			var b: Node3D = birds[k]
			var a := time * 0.9 + float(k) / 3.0 * TAU
			_vis(b, fly)
			b.position = Vector3(cos(a) * (1.6 + k * 0.2), 1.25 + k * 0.15, sin(a) * 1.1)
			b.rotation.y = -a - PI / 2
		_vis(fish, Vignettes._smooth(8.8, 9.6, t))
		var fa := -time * 0.7
		fish.position = Vector3(cos(fa) * 1.55, -0.05 + absf(sin(time * 2.4)) * 0.18, sin(fa) * 1.55)
		fish.rotation.y = -fa + PI / 2
		for k in animals.size():
			var an: Node3D = animals[k]
			_vis(an, Vignettes._smooth(10.5 + k * 0.6, 11.3 + k * 0.6, t))
			var a := float(k) / 3.0 * TAU + time * 0.25
			an.position = Vector3(0.25 + cos(a) * 0.45, 0.4, 0.05 + sin(a) * 0.32)
			an.rotation.y = -a - PI / 2
