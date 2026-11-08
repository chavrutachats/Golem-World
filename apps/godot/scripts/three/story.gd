## Os episódios da Torá em 3D (porte de apps/mobile/src/three/story.ts): os obstáculos de
## cada fase (a serpente, os sapos, o bezerro de ouro…), as peças do fundo (a arca, a torre
## de Bavel, o Mishkan…) e as chegadas. Bichos simpáticos, nunca assustadores.
class_name Story

const C := Kit.C


static func eyes_at(p: Array, gap: float, r := 0.07) -> Node3D:
	var ink := Kit.mat(C.ink, {"smooth": true})
	var shine := Kit.glow("#FFFFFF")
	var eye := func(x: float) -> Node3D:
		return Kit.group({"p": [x, 0, 0]}, [Kit.mesh(Geo.ball(r, 1), ink), Kit.mesh(Geo.ball(r * 0.32, 0), shine, {"p": [r * 0.3, r * 0.4, r * 0.65], "shadow": false})])
	return Kit.group({"p": p}, [eye.call(gap / 2.0), eye.call(-gap / 2.0)])


## Quadrúpede de perfil, olhando para a câmera (vaca, camelo, burro, ovelha, leão).
static func quadruped(o: Dictionary) -> Node3D:
	var m := Kit.mat(o.color)
	var dark := Kit.mat(o.get("dark", o.color))
	var L: float = o.body[0]
	var H: float = o.body[1]
	var W: float = o.body[2]
	var leg: float = o.get("leg", 0.45)
	var parts: Array = [Kit.mesh(Geo.rbox(L, H, W, minf(H, W) * 0.3), m, {"p": [0, leg + H / 2, 0]})]
	for x in [L / 2 - 0.15, -L / 2 + 0.15]:
		for z in [W / 2 - 0.1, -W / 2 + 0.1]:
			parts.append(Kit.mesh(Geo.rbox(0.16, leg + 0.06, 0.16, 0.05), dark, {"p": [x, leg / 2, z]}))
	var hd: Array = o.get("head", [0.42, 0.36, 0.36])
	var neck: float = o.get("neck", 0.15)
	var head_pos := [L / 2 + hd[0] * 0.25, leg + H + neck, 0.05]
	parts.append(Kit.mesh(Geo.rbox(hd[0], hd[1], hd[2], 0.1), m, {"p": head_pos}))
	parts.append(eyes_at([head_pos[0] + 0.02, head_pos[1] + 0.06, head_pos[2] + hd[2] / 2], hd[2] * 0.55, 0.05))
	parts.append(Kit.mesh(Geo.rbox(0.12, 0.3, 0.12, 0.04), dark, {"p": [-L / 2 - 0.04, leg + H * 0.6, 0], "r": [0, 0, 0.6]}))
	if o.has("extra"):
		(o.extra as Callable).call(parts, head_pos)
	return Kit.group({"r": [0, 0.35, 0]}, parts)


static func flames(scale := 1.0) -> Node3D:
	var outer := Kit.glow(C.fire)
	var inner := Kit.glow(C.fireCore)
	return Kit.group({"s": scale}, [
		Kit.mesh(Geo.cone(0.42, 1.1, 6), outer, {"p": [0, 0.55, 0], "shadow": false, "name": "flame"}),
		Kit.mesh(Geo.cone(0.28, 0.8, 6), outer, {"p": [0.3, 0.4, 0.05], "shadow": false}),
		Kit.mesh(Geo.cone(0.25, 0.7, 6), outer, {"p": [-0.28, 0.35, 0.02], "shadow": false}),
		Kit.mesh(Geo.cone(0.22, 0.6, 6), inner, {"p": [0, 0.32, 0.18], "shadow": false}),
	])


static func _moved(o: Node3D, p: Vector3) -> Node3D:
	o.position += p
	return o


# --- Obstáculos --------------------------------------------------------------------------


static func obstacle(id: String) -> Node3D:
	var g := _obstacle(id)
	g.name = "obstacle-%s" % id
	return g


static func _obstacle(id: String) -> Node3D:
	match id:
		"serpent":
			var body := Kit.mat("#5EA850")
			var parts: Array = []
			for i in 9:
				var t := i / 8.0
				parts.append(Kit.mesh(Geo.ball(0.2 - t * 0.06, 1), body if i % 2 else Kit.mat("#7CC26C"), {"p": [sin(t * 6) * 0.35 - 0.2, 0.18 + t * 1.0, cos(t * 6) * 0.2]}))
			parts.append(Kit.mesh(Geo.rbox(0.38, 0.26, 0.34, 0.1), body, {"p": [-0.1, 1.32, 0.1]}))
			parts.append(eyes_at([-0.08, 1.4, 0.28], 0.18, 0.055))
			parts.append(Kit.mesh(Geo.box(0.04, 0.02, 0.18), Kit.glow("#D9465F"), {"p": [-0.08, 1.24, 0.34], "shadow": false}))
			parts.append(Kit.mesh(Geo.ball(0.13, 1), Kit.mat(C.red), {"p": [0.42, 0.95, 0.15]}))
			return Kit.group({}, parts)
		"thorns":
			var r := Kit.seeded(11)
			var parts: Array = [Kit.mesh(Geo.ball(0.5, 1), Kit.mat("#6E7D3A"), {"p": [0, 0.45, 0], "s": [1.3, 0.9, 1]})]
			for i in 14:
				var a := r.next() * TAU
				var b := r.next() * 1.2
				parts.append(Kit.mesh(Geo.cone(0.05, 0.3, 4), Kit.mat("#C9B98A"), {"p": [cos(a) * 0.55 * cos(b), 0.45 + sin(b) * 0.42, sin(a) * 0.45], "r": [sin(a), 0, -cos(a) * 1.2]}))
			return Kit.group({}, parts)
		"tree":
			var t := Nature.tree(5)
			for p in [[0.3, 1.7, 0.4], [-0.35, 1.9, 0.3], [0.05, 2.15, 0.45]]:
				t.add_child(Kit.mesh(Geo.ball(0.1, 1), Kit.mat(C.red), {"p": p}))
			return t
		"darkness":
			return Kit.group({}, [
				Kit.mesh(Geo.ball(0.62, 1), Kit.mat("#2A2550"), {"p": [0, 0.75, 0]}),
				Kit.mesh(Geo.ball(0.42, 1), Kit.mat("#352F63"), {"p": [0.5, 0.5, 0.1]}),
				Kit.mesh(Geo.ball(0.4, 1), Kit.mat("#231F45"), {"p": [-0.5, 0.48, 0.05]}),
				eyes_at([0, 0.82, 0.58], 0.26, 0.07),
			])
		"wave":
			var water := Kit.mat(C.water)
			var foam := Kit.mat(C.white)
			return Kit.group({}, [
				Kit.mesh(Geo.torus(0.6, 0.32, PI * 1.1, 14), water, {"p": [0, 0.6, 0], "r": [0, 0, -0.2]}),
				Kit.mesh(Geo.ball(0.22, 1), foam, {"p": [-0.55, 1.05, 0.05]}),
				Kit.mesh(Geo.ball(0.16, 1), foam, {"p": [-0.3, 1.2, 0.1]}),
				Kit.mesh(Geo.box(1.6, 0.25, 0.8), water, {"p": [0, 0.12, 0]}),
			])
		"fish":
			var body := Kit.mat("#F2A23C")
			return Kit.group({"p": [0, 0.6, 0]}, [
				Kit.mesh(Geo.ball(0.45, 1), body, {"s": [1.3, 0.85, 0.6]}),
				Kit.mesh(Geo.cone(0.3, 0.45, 4), body, {"p": [-0.68, 0, 0], "r": [0, 0, PI / 2]}),
				eyes_at([0.32, 0.1, 0.24], 0.0, 0.07),
				Kit.mesh(Geo.box(0.6, 0.2, 0.05), Kit.glow(C.waterLight, 0.6), {"p": [0, -0.55, 0], "shadow": false}),
			])
		"frog":
			var g := Kit.mat("#5FB04B")
			return Kit.group({}, [
				Kit.mesh(Geo.ball(0.45, 1), g, {"p": [0, 0.4, 0], "s": [1.2, 0.85, 1]}),
				Kit.mesh(Geo.ball(0.17, 1), g, {"p": [0.2, 0.78, 0.18]}),
				Kit.mesh(Geo.ball(0.17, 1), g, {"p": [-0.2, 0.78, 0.18]}),
				eyes_at([0, 0.82, 0.32], 0.4, 0.07),
				Kit.mesh(Geo.torus(0.14, 0.025, PI, 10), Kit.mat(C.ink), {"p": [0, 0.48, 0.48], "r": [0, 0, PI]}),
				Kit.mesh(Geo.ball(0.16, 1), g, {"p": [0.42, 0.12, 0.2], "s": [1.3, 0.5, 1]}),
				Kit.mesh(Geo.ball(0.16, 1), g, {"p": [-0.42, 0.12, 0.2], "s": [1.3, 0.5, 1]}),
			])
		"locust":
			var g := Kit.mat("#9DB54A")
			return Kit.group({"p": [0, 0.5, 0]}, [
				Kit.mesh(Geo.capsule(0.16, 0.6, 6), g, {"r": [0, 0, PI / 2]}),
				Kit.mesh(Geo.ball(0.2, 1), g, {"p": [0.45, 0.06, 0]}),
				eyes_at([0.52, 0.12, 0.14], 0.18, 0.05),
				Kit.mesh(Geo.box(0.7, 0.03, 0.3), Kit.mat("#D8E6A8", {"opacity": 0.85}), {"p": [-0.1, 0.22, 0], "r": [0, 0, 0.25]}),
				Kit.mesh(Geo.box(0.06, 0.5, 0.06), g, {"p": [-0.2, -0.2, 0.15], "r": [0, 0, 0.7]}),
				Kit.mesh(Geo.box(0.06, 0.5, 0.06), g, {"p": [-0.2, -0.2, -0.15], "r": [0, 0, 0.7]}),
			])
		"scorpion":
			var g := Kit.mat("#B5743A")
			var parts: Array = [Kit.mesh(Geo.rbox(0.7, 0.24, 0.42, 0.1), g, {"p": [0, 0.22, 0]}), eyes_at([0.36, 0.32, 0.12], 0.14, 0.045)]
			for i in 4:
				parts.append(Kit.mesh(Geo.ball(0.13 - i * 0.015, 0), g, {"p": [-0.42 - i * 0.12, 0.35 + i * 0.2, 0]}))
			parts.append(Kit.mesh(Geo.cone(0.07, 0.2, 4), Kit.mat(C.ink), {"p": [-0.65, 1.12, 0], "r": [0, 0, -2.2]}))
			for z in [0.25, -0.25]:
				parts.append(Kit.mesh(Geo.rbox(0.3, 0.1, 0.16, 0.04), g, {"p": [0.52, 0.2, z]}))
			return Kit.group({}, parts)
		"bird":
			return Kit.group({"p": [0, 1.0, 0]}, [
				Kit.mesh(Geo.ball(0.32, 1), Kit.mat(C.white), {"s": [1.3, 0.9, 0.9]}),
				Kit.mesh(Geo.ball(0.2, 1), Kit.mat(C.white), {"p": [0.34, 0.2, 0]}),
				Kit.mesh(Geo.cone(0.06, 0.18, 4), Kit.mat(C.gold), {"p": [0.55, 0.18, 0], "r": [0, 0, -PI / 2]}),
				eyes_at([0.42, 0.26, 0.14], 0.0, 0.04),
				Kit.mesh(Geo.box(0.5, 0.05, 0.6), Kit.mat("#E9EEF5"), {"p": [-0.05, 0.12, 0], "r": [0.3, 0, 0], "name": "wing"}),
				Kit.mesh(Geo.box(0.22, 0.04, 0.08), Kit.mat(C.leaf), {"p": [0.62, 0.12, 0.05], "r": [0, 0, -0.3]}),
			])
		"cow":
			return quadruped({"color": "#F4EFE6", "dark": "#5B4636", "body": [1.3, 0.6, 0.6], "extra": func(p: Array, hp: Array):
				p.append(Kit.mesh(Geo.ball(0.16, 0), Kit.mat("#5B4636"), {"p": [0.1, 1.02, 0.3]}))
				p.append(Kit.mesh(Geo.ball(0.14, 0), Kit.mat("#5B4636"), {"p": [-0.35, 0.9, 0.3]}))
				p.append(Kit.mesh(Geo.cone(0.05, 0.16, 4), Kit.mat(C.cream), {"p": [hp[0], hp[1] + 0.24, 0.15]}))
				p.append(Kit.mesh(Geo.cone(0.05, 0.16, 4), Kit.mat(C.cream), {"p": [hp[0], hp[1] + 0.24, -0.08]}))})
		"calf":
			return quadruped({"color": C.gold, "dark": C.goldDeep, "body": [1.1, 0.5, 0.5], "leg": 0.32, "extra": func(p: Array, hp: Array):
				p.append(Kit.mesh(Geo.cone(0.05, 0.18, 4), Kit.mat(C.goldDeep), {"p": [hp[0], hp[1] + 0.24, 0.14]}))
				p.append(Kit.mesh(Geo.cone(0.05, 0.18, 4), Kit.mat(C.goldDeep), {"p": [hp[0], hp[1] + 0.24, -0.06]}))
				p.append(Kit.mesh(Geo.rbox(1.4, 0.2, 0.8, 0.06), Kit.mat(C.stone), {"p": [0, 0.0, 0]}))})
		"camel":
			return quadruped({"color": "#D6A867", "dark": "#B98848", "body": [1.2, 0.5, 0.5], "leg": 0.7, "neck": 0.55, "head": [0.45, 0.28, 0.3], "extra": func(p: Array, _hp: Array):
				p.append(Kit.mesh(Geo.sphere(0.36, 10, 5, PI / 2), Kit.mat("#D6A867"), {"p": [-0.1, 1.2, 0]}))
				p.append(Kit.mesh(Geo.rbox(0.2, 0.6, 0.22, 0.06), Kit.mat("#D6A867"), {"p": [0.55, 1.42, 0.05], "r": [0, 0, -0.3]}))
				p.append(Kit.mesh(Geo.box(0.7, 0.08, 0.56), Kit.mat("#B5373C"), {"p": [-0.05, 1.22, 0]}))})
		"donkey":
			return quadruped({"color": "#9A9187", "dark": "#6E665E", "body": [1.1, 0.5, 0.5], "leg": 0.5, "extra": func(p: Array, hp: Array):
				p.append(Kit.mesh(Geo.capsule(0.05, 0.26, 4), Kit.mat("#9A9187"), {"p": [hp[0] - 0.08, hp[1] + 0.32, 0.12], "r": [0, 0, 0.2]}))
				p.append(Kit.mesh(Geo.capsule(0.05, 0.26, 4), Kit.mat("#9A9187"), {"p": [hp[0] - 0.08, hp[1] + 0.32, -0.06], "r": [0, 0, 0.2]}))
				p.append(Kit.mesh(Geo.box(0.5, 0.06, 0.52), Kit.mat("#B5373C"), {"p": [0, 1.02, 0]}))})
		"sheep":
			return quadruped({"color": "#FAF7F0", "dark": "#3E3530", "body": [0.95, 0.55, 0.6], "leg": 0.32, "head": [0.32, 0.3, 0.3], "extra": func(p: Array, _hp: Array):
				var r := Kit.seeded(3)
				for i in 8:
					p.append(Kit.mesh(Geo.ball(0.2, 1), Kit.mat("#FFFFFF"), {"p": [(r.next() - 0.5) * 0.8, 0.85 + r.next() * 0.15, (r.next() - 0.5) * 0.4]}))})
		"lion":
			return quadruped({"color": "#E2A947", "dark": "#C98A2E", "body": [1.2, 0.55, 0.55], "leg": 0.45, "extra": func(p: Array, hp: Array):
				p.append(Kit.mesh(Geo.ball(0.36, 1), Kit.mat("#A8612A"), {"p": [hp[0] - 0.08, hp[1], hp[2] - 0.05]}))})
		"grapes":
			var r := Kit.seeded(9)
			var parts: Array = [
				Kit.mesh(Geo.cyl(0.045, 0.045, 1.8, 6), Kit.mat(C.woodDark), {"p": [0, 1.25, 0], "r": [0, 0, PI / 2]}),
				Kit.mesh(Geo.cyl(0.04, 0.05, 1.25, 5), Kit.mat(C.wood), {"p": [0.82, 0.62, 0]}),
				Kit.mesh(Geo.cyl(0.04, 0.05, 1.25, 5), Kit.mat(C.wood), {"p": [-0.82, 0.62, 0]}),
			]
			for i in 22:
				var row := i / 22.0
				var spread := 0.42 * (1.0 - row * 0.7)
				parts.append(Kit.mesh(Geo.ball(0.13, 1), Kit.mat("#7A3E9A" if i % 3 else "#8E52B0"), {"p": [(r.next() - 0.5) * spread * 2, 1.08 - row * 0.85, (r.next() - 0.5) * spread]}))
			parts.append(Kit.mesh(Geo.box(0.36, 0.04, 0.24), Kit.mat(C.leaf), {"p": [0.12, 1.18, 0.05], "r": [0, 0, 0.2]}))
			return Kit.group({}, parts)
		"jar":
			return Kit.group({}, [
				Kit.mesh(Geo.sphere(0.42, 10, 8), Kit.mat(C.clayLight), {"p": [0, 0.48, 0], "s": [1, 1.1, 1]}),
				Kit.mesh(Geo.cyl(0.16, 0.22, 0.3, 8), Kit.mat(C.clayLight), {"p": [0, 1.0, 0]}),
				Kit.mesh(Geo.torus(0.17, 0.04, TAU, 12), Kit.mat(C.clayDark), {"p": [0, 1.16, 0], "r": [PI / 2, 0, 0]}),
				Kit.mesh(Geo.disc(0.15, 12), Kit.glow(C.waterLight), {"p": [0, 1.16, 0], "r": [-PI / 2, 0, 0], "shadow": false}),
			])
		"pot":
			return Kit.group({}, [
				Kit.mesh(Geo.cyl(0.5, 0.4, 0.55, 10), Kit.mat("#4E4A4E"), {"p": [0, 0.48, 0]}),
				Kit.mesh(Geo.disc(0.46, 14), Kit.mat("#B5373C"), {"p": [0, 0.76, 0], "r": [-PI / 2, 0, 0], "shadow": false}),
				_moved(flames(0.5), Vector3(0, -0.05, 0)),
				Kit.mesh(Geo.ball(0.08, 0), Kit.glow("#FFFFFF", 0.7), {"p": [0.1, 0.95, 0.1], "shadow": false}),
				Kit.mesh(Geo.ball(0.06, 0), Kit.glow("#FFFFFF", 0.6), {"p": [-0.12, 1.1, 0.05], "shadow": false}),
			])
		"fire":
			return flames(1.0)
		"pit":
			return Kit.group({}, [
				Kit.mesh(Geo.cyl(0.7, 0.7, 0.3, 10), Kit.mat(C.stone), {"p": [0, 0.15, 0]}),
				Kit.mesh(Geo.cyl(0.52, 0.52, 0.31, 10), Kit.mat("#2B2420"), {"p": [0, 0.16, 0]}),
			])
		"planks":
			var parts: Array = []
			for i in 5:
				parts.append(Kit.mesh(Geo.box(1.4, 0.16, 0.36), Kit.mat(C.wood if i % 2 else C.woodDark), {"p": [0, 0.08 + i * 0.17, (i % 2) * 0.05], "r": [0, 0.08 if i % 2 else -0.06, 0]}))
			return Kit.group({}, parts)
		"bricks":
			var parts: Array = []
			for row in 4:
				for i in 4 - row:
					parts.append(Kit.mesh(Geo.rbox(0.42, 0.22, 0.3, 0.03), Kit.mat("#C9774B" if row % 2 else "#B7653E"), {"p": [(i - (3 - row) / 2.0) * 0.44, 0.11 + row * 0.23, 0]}))
			return Kit.group({}, parts)
		"wheat":
			var parts: Array = []
			for i in 9:
				var a := float(i) / 9.0 * TAU
				parts.append(Kit.mesh(Geo.cyl(0.025, 0.025, 1.2, 4), Kit.mat("#D9B54A"), {"p": [cos(a) * 0.12, 0.6, sin(a) * 0.12], "r": [sin(a) * 0.2, 0, cos(a) * 0.2]}))
				parts.append(Kit.mesh(Geo.capsule(0.06, 0.22, 4), Kit.mat("#E8C55A"), {"p": [cos(a) * 0.26, 1.25, sin(a) * 0.26]}))
			parts.append(Kit.mesh(Geo.torus(0.16, 0.05, TAU, 10), Kit.mat("#B58E2E"), {"p": [0, 0.55, 0], "r": [PI / 2, 0, 0]}))
			return Kit.group({}, parts)
		"basket":
			var parts: Array = [
				Kit.mesh(Geo.rbox(1.1, 0.35, 0.55, 0.12), Kit.mat("#B9884C"), {"p": [0, 0.26, 0]}),
				Kit.mesh(Geo.rbox(1.0, 0.1, 0.45, 0.04), Kit.mat(C.cream), {"p": [0, 0.44, 0]}),
				Kit.mesh(Geo.box(1.8, 0.08, 1.2), Kit.glow(C.water, 0.85), {"p": [0, 0.04, 0], "shadow": false}),
			]
			var xs := [-0.8, -0.65, 0.7, 0.85]
			for i in xs.size():
				parts.append(Kit.mesh(Geo.cyl(0.02, 0.02, 0.9 + (i % 2) * 0.3, 4), Kit.mat(C.leaf), {"p": [xs[i], 0.45, -0.4]}))
			return Kit.group({}, parts)
		"wagon":
			return Kit.group({}, [
				Kit.mesh(Geo.box(1.4, 0.35, 0.7), Kit.mat(C.wood), {"p": [0, 0.6, 0]}),
				Kit.mesh(Geo.cyl(0.32, 0.32, 0.08, 10), Kit.mat(C.woodDark), {"p": [0.45, 0.32, 0.38], "r": [PI / 2, 0, 0]}),
				Kit.mesh(Geo.cyl(0.32, 0.32, 0.08, 10), Kit.mat(C.woodDark), {"p": [-0.45, 0.32, 0.38], "r": [PI / 2, 0, 0]}),
				Kit.mesh(Geo.ball(0.2, 1), Kit.mat(C.gold), {"p": [0.2, 0.85, 0]}),
				Kit.mesh(Geo.ball(0.18, 1), Kit.mat("#E8C55A"), {"p": [-0.2, 0.85, 0.1]}),
			])
		"cloth":
			var stripes := ["#D64545", "#F2B630", "#3E7BD6", "#5E9E4B", "#8A6BD8"]
			var parts: Array = [
				Kit.mesh(Geo.cyl(0.04, 0.04, 1.4, 5), Kit.mat(C.woodDark), {"p": [0.55, 0.7, 0]}),
				Kit.mesh(Geo.box(1.0, 0.06, 0.06), Kit.mat(C.woodDark), {"p": [0.1, 1.38, 0]}),
			]
			for i in stripes.size():
				parts.append(Kit.mesh(Geo.box(0.16, 0.95, 0.04), Kit.mat(stripes[i]), {"p": [-0.25 + i * 0.16, 0.88, 0]}))
			return Kit.group({"p": [0, 0.1, 0]}, parts)
		"cloud":
			var c := Nature.cloud(4, "#B9C3D6")
			c.scale = Vector3.ONE * 0.65
			c.position.y = 0.6
			return c
		"banner":
			return Kit.group({}, [
				Kit.mesh(Geo.cyl(0.04, 0.04, 2.0, 5), Kit.mat(C.woodDark), {"p": [0, 1.0, 0]}),
				Kit.mesh(Geo.box(0.8, 0.55, 0.03), Kit.mat("#3E7BD6"), {"p": [0.42, 1.65, 0]}),
				Kit.mesh(Geo.ball(0.12, 0), Kit.mat(C.gold), {"p": [0.42, 1.65, 0.03]}),
				Kit.mesh(Geo.ball(0.06, 0), Kit.mat(C.gold), {"p": [0, 2.04, 0]}),
			])
	# "rock" (e qualquer outro): a pedra de onde sai água (Bamidbar 20).
	return Kit.group({}, [
		Kit.mesh(Geo.dodeca(0.62), Kit.mat(C.stone), {"p": [0, 0.5, 0], "s": [1.2, 0.9, 1]}),
		Kit.mesh(Geo.dodeca(0.3), Kit.mat(C.stoneDark), {"p": [0.6, 0.22, 0.2]}),
		Kit.mesh(Geo.capsule(0.08, 0.4, 5), Kit.glow(C.waterLight, 0.8), {"p": [0.15, 0.62, 0.62], "r": [1.2, 0, 0], "shadow": false}),
	])


# --- Peças da história -------------------------------------------------------------------


static func prop(id: String, seed := 1) -> Node3D:
	match id:
		"ark":
			return Kit.group({}, [
				Kit.mesh(Geo.rbox(4.2, 1.1, 1.6, 0.3), Kit.mat(C.woodDark), {"p": [0, 0.75, 0]}),
				Kit.mesh(Geo.box(2.4, 0.9, 1.2), Kit.mat(C.wood), {"p": [0, 1.7, 0]}),
				Kit.mesh(Geo.cone(1.3, 0.6, 4), Kit.mat("#8E5A34"), {"p": [0, 2.45, 0], "r": [0, PI / 4, 0], "s": [1.45, 1, 0.75]}),
				Kit.mesh(Geo.box(0.3, 0.3, 0.02), Kit.mat(C.ink), {"p": [0.6, 1.75, 0.61], "shadow": false}),
				Kit.mesh(Geo.box(0.3, 0.3, 0.02), Kit.mat(C.ink), {"p": [-0.6, 1.75, 0.61], "shadow": false}),
			])
		"tower":
			var parts: Array = []
			for i in 6:
				parts.append(Kit.mesh(Geo.cyl(1.4 - i * 0.2, 1.5 - i * 0.2, 0.75, 10), Kit.mat("#C9774B" if i % 2 else "#B7653E"), {"p": [0, 0.37 + i * 0.75, 0]}))
			return Kit.group({}, parts)
		"city":
			var r := Kit.seeded(seed)
			var parts: Array = []
			for i in 6:
				var h := 0.8 + r.next() * 1.4
				parts.append(Kit.mesh(Geo.box(0.9, h, 0.9), Kit.mat("#E8D2A8" if i % 2 else "#D9BE8C"), {"p": [(i - 2.5) * 0.95, h / 2, (r.next() - 0.5) * 0.6]}))
				if r.next() > 0.5:
					parts.append(Kit.mesh(Geo.sphere(0.36, 10, 5, PI / 2), Kit.mat("#EFE1C4"), {"p": [(i - 2.5) * 0.95, h, 0]}))
			parts.append(Kit.mesh(Geo.box(6, 0.6, 0.3), Kit.mat("#CDB083"), {"p": [0, 0.3, 0.7]}))
			return Kit.group({}, parts)
		"mishkan":
			var parts: Array = [
				Kit.mesh(Geo.box(3.4, 1.3, 1.6), Kit.mat(C.gold, {"emissive": C.goldDeep, "emissiveIntensity": 0.15}), {"p": [0, 0.65, 0]}),
				Kit.mesh(Geo.box(3.5, 0.1, 1.7), Kit.mat("#6C2C7A"), {"p": [0, 1.36, 0]}),
				Kit.mesh(Geo.box(1.0, 1.0, 0.04), Kit.mat("#3E5FB0"), {"p": [0, 0.55, 0.81], "shadow": false}),
			]
			for x in [-2.6, 2.6]:
				parts.append(Kit.mesh(Geo.box(0.06, 0.9, 2.6), Kit.mat(C.linen), {"p": [x, 0.45, 0]}))
			parts.append(_moved(Nature.cloud(8, "#FFFFFF"), Vector3(0, 2.6, -0.2)))
			return Kit.group({}, parts)
		"ladder":
			var parts: Array = [
				Kit.mesh(Geo.box(0.1, 6, 0.1), Kit.mat(C.wood), {"p": [0.5, 3, 0]}),
				Kit.mesh(Geo.box(0.1, 6, 0.1), Kit.mat(C.wood), {"p": [-0.5, 3, 0]}),
			]
			for i in 12:
				parts.append(Kit.mesh(Geo.box(1.0, 0.07, 0.07), Kit.mat(C.woodDark), {"p": [0, 0.3 + i * 0.5, 0]}))
			parts.append(_moved(Nature.cloud(5, "#FFF6D8"), Vector3(0.2, 6, 0)))
			return Kit.group({"r": [0, 0, -0.2]}, parts)
		"cloud-pillar":
			var parts: Array = []
			for i in 8:
				parts.append(Kit.mesh(Geo.ball(0.7 - (i % 2) * 0.12, 1), Kit.mat("#F2F4F8"), {"p": [sin(i) * 0.2, 0.6 + i * 0.75, 0], "shadow": false}))
			return Kit.group({}, parts)
		"candles":
			var candle := func(x: float) -> Node3D:
				return Kit.group({"p": [x, 0, 0]}, [
					Kit.mesh(Geo.cyl(0.14, 0.18, 0.12, 8), Kit.mat(C.goldDeep), {"p": [0, 0.06, 0]}),
					Kit.mesh(Geo.cyl(0.08, 0.08, 0.7, 8), Kit.mat(C.cream), {"p": [0, 0.47, 0]}),
					Kit.mesh(Geo.cone(0.07, 0.2, 6), Kit.glow(C.fireCore), {"p": [0, 0.92, 0], "shadow": false, "name": "flame"}),
				])
			return Kit.group({}, [Kit.mesh(Geo.rbox(1.3, 0.12, 0.6, 0.04), Kit.mat(C.white)), candle.call(0.3), candle.call(-0.3)])
		"bush-fire":
			return Kit.group({}, [Kit.mesh(Geo.ball(0.6, 1), Kit.mat(C.leafDark), {"p": [0, 0.5, 0]}), _moved(flames(0.9), Vector3(0, 0.5, 0))])
		"tablets":
			var stone := Kit.mat("#C9C3B5")
			var line := Kit.mat("#6E6A62")
			var tab := func(x: float) -> Node3D:
				var parts: Array = [Kit.mesh(Geo.box(0.5, 1.1, 0.14), stone), Kit.mesh(Geo.cyl(0.25, 0.25, 0.14, 12), stone, {"p": [0, 0.55, 0], "r": [PI / 2, 0, 0]})]
				for i in 4:
					parts.append(Kit.mesh(Geo.box(0.32, 0.03, 0.02), line, {"p": [0, 0.45 - i * 0.16, 0.08], "shadow": false}))
				return Kit.group({"p": [x, 0.65, 0]}, parts)
			return Kit.group({}, [tab.call(0.28), tab.call(-0.28), _moved(Nature.mountain(3, "#8C7E74", false), Vector3(0, -0.2, -2))])
		"rainbow":
			return Nature.rainbow()
		"sun":
			return Nature.sun()
		"moon":
			return Nature.moon()
		"palms":
			return Kit.group({}, [Nature.palm(seed), _moved(Nature.palm(seed + 3), Vector3(1.4, 0, -0.6))])
		"trees":
			return Kit.group({}, [Nature.tree(seed), _moved(Nature.tree(seed + 2), Vector3(1.5, 0, -0.5))])
		"tents":
			return Kit.group({}, [Nature.tent(seed), _moved(Nature.tent(seed + 1), Vector3(1.6, 0, -0.4)), _moved(Nature.tent(seed + 2), Vector3(-1.4, 0, -0.7))])
		"hills":
			return Kit.group({}, [Kit.mesh(Geo.sphere(2.4, 10, 5, PI / 2), Kit.mat(C.leafLight), {"s": [1.4, 0.55, 1]})])
		"mountain":
			return Nature.mountain(seed)
		"pyramids":
			return Kit.group({}, [
				Kit.mesh(Geo.cone(2, 2.2, 4), Kit.mat(C.sandDark), {"p": [0, 1.1, 0], "r": [0, PI / 4, 0]}),
				Kit.mesh(Geo.cone(1.3, 1.4, 4), Kit.mat(C.sand), {"p": [2.4, 0.7, -0.6], "r": [0, PI / 4, 0]}),
			])
	return Node3D.new()


static func signpost(color: String = C.gold) -> Node3D:
	return Kit.group({}, [
		Kit.mesh(Geo.cyl(0.06, 0.07, 1.6, 6), Kit.mat(C.woodDark), {"p": [0, 0.8, 0]}),
		Kit.mesh(Geo.rbox(0.9, 0.36, 0.08, 0.04), Kit.mat(C.wood), {"p": [0.3, 1.35, 0]}),
		Kit.mesh(Geo.cone(0.18, 0.2, 3), Kit.mat(C.wood), {"p": [0.82, 1.35, 0], "r": [0, 0, -PI / 2]}),
		Kit.mesh(Geo.rbox(0.3, 0.2, 0.04, 0.03), Kit.mat(color), {"p": [0.3, 1.35, 0.05]}),
	])


## A chegada da fase: a peça da parashá, a placa da trilha ou a casa de estudos.
static func goal(model: Dictionary) -> Node3D:
	match str(model.kind):
		"prop":
			return prop(str(model.prop), 3)
		"signpost":
			return signpost(str(model.color))
		"beitMidrash":
			return WorldMap.beit_midrash(str(model.style))
	return WorldMap.goal_flag()
