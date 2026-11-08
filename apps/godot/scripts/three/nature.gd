## Natureza do Golem World (porte de apps/mobile/src/three/nature.ts): árvores, palmeiras,
## pedras, dunas, colinas, pirâmides, tendas, flores e juncos, variados pela semente.
class_name Nature

const C := Kit.C


static func tree(seed := 1) -> Node3D:
	var r := Kit.seeded(seed)
	var h := 0.9 + r.next() * 0.5
	var crown: String = [C.leaf, C.leafDark, C.leafLight][floori(r.next() * 3)]
	return Kit.group({}, [
		Kit.mesh(Geo.cyl(0.09, 0.13, h, 6), Kit.mat(C.trunk), {"p": [0, h / 2, 0]}),
		Kit.mesh(Geo.ball(0.62, 1), Kit.mat(crown), {"p": [0, h + 0.38, 0], "s": [1, 0.9, 1]}),
		Kit.mesh(Geo.ball(0.42, 1), Kit.mat(crown), {"p": [0.34, h + 0.12, 0.12]}),
		Kit.mesh(Geo.ball(0.38, 1), Kit.mat(crown), {"p": [-0.32, h + 0.18, -0.08]}),
	])


static func cypress(seed := 1) -> Node3D:
	var r := Kit.seeded(seed)
	var h := 1.6 + r.next() * 0.8
	return Kit.group({}, [
		Kit.mesh(Geo.cyl(0.06, 0.08, 0.3, 5), Kit.mat(C.trunk), {"p": [0, 0.15, 0]}),
		Kit.mesh(Geo.cone(0.32, h, 7), Kit.mat(C.leafDark), {"p": [0, 0.3 + h / 2, 0]}),
	])


static func palm(seed := 1) -> Node3D:
	var r := Kit.seeded(seed)
	var h := 1.7 + r.next() * 0.6
	var lean := (r.next() - 0.5) * 0.3
	var parts: Array = []
	var segs := 5
	for i in segs:
		parts.append(Kit.mesh(Geo.cyl(0.09, 0.12, h / segs + 0.02, 6), Kit.mat(C.woodDark if i % 2 else C.wood), {"p": [lean * i * 0.4, (i + 0.5) * (h / segs), 0]}))
	var top := Vector3(lean * segs * 0.4, h, 0)
	for i in 7:
		var a := float(i) / 7.0 * TAU + r.next()
		parts.append(Kit.mesh(Geo.box(0.95, 0.04, 0.26), Kit.mat(C.leaf if i % 2 else C.leafDark), {"p": [top.x + cos(a) * 0.42, top.y - 0.12, sin(a) * 0.42], "r": [0, -a, -0.45]}))
	parts.append(Kit.mesh(Geo.ball(0.08, 0), Kit.mat(C.trunk), {"p": [top.x + 0.1, top.y - 0.12, 0.08]}))
	parts.append(Kit.mesh(Geo.ball(0.08, 0), Kit.mat(C.trunk), {"p": [top.x - 0.08, top.y - 0.14, 0.06]}))
	return Kit.group({}, parts)


static func bush(seed := 1) -> Node3D:
	var r := Kit.seeded(seed)
	var c: String = C.leaf if r.next() > 0.5 else C.leafLight
	return Kit.group({}, [
		Kit.mesh(Geo.ball(0.34, 1), Kit.mat(c), {"p": [0, 0.24, 0]}),
		Kit.mesh(Geo.ball(0.26, 1), Kit.mat(C.leafDark), {"p": [0.3, 0.18, 0.05]}),
		Kit.mesh(Geo.ball(0.24, 1), Kit.mat(c), {"p": [-0.28, 0.16, -0.04]}),
	])


static func rock(seed := 1, color: String = C.stone) -> Node3D:
	var r := Kit.seeded(seed)
	return Kit.group({}, [
		Kit.mesh(Geo.dodeca(0.38), Kit.mat(color), {"p": [0, 0.22, 0], "s": [1.2, 0.75 + r.next() * 0.3, 1], "r": [r.next(), r.next() * 3, r.next()]}),
		Kit.mesh(Geo.dodeca(0.22), Kit.mat(C.stoneDark), {"p": [0.36, 0.12, 0.1], "r": [r.next(), r.next(), r.next()]}),
	])


static func dune(seed := 1) -> Node3D:
	var r := Kit.seeded(seed)
	return Kit.group({}, [Kit.mesh(Geo.sphere(1.3, 10, 5, PI / 2), Kit.mat(C.sand if r.next() > 0.5 else C.sandDark), {"s": [1.4, 0.45 + r.next() * 0.2, 0.9]})])


static func hill(seed := 1, color: String = C.leafLight) -> Node3D:
	var r := Kit.seeded(seed)
	return Kit.group({}, [Kit.mesh(Geo.sphere(1.6, 10, 5, PI / 2), Kit.mat(color), {"s": [1.3, 0.55 + r.next() * 0.25, 1]})])


static func mountain(seed := 1, color := "#9C8F86", snow := true) -> Node3D:
	var r := Kit.seeded(seed)
	var h := 3.2 + r.next() * 1.4
	var parts: Array = [Kit.mesh(Geo.cone(2.2, h, 6), Kit.mat(color), {"p": [0, h / 2, 0], "r": [0, r.next(), 0]})]
	if snow:
		parts.append(Kit.mesh(Geo.cone(0.72, h * 0.32, 6), Kit.mat(C.cream), {"p": [0, h - h * 0.16 + 0.01, 0], "r": [0, r.next(), 0]}))
	parts.append(Kit.mesh(Geo.cone(1.5, h * 0.6, 6), Kit.mat("#8A7D74"), {"p": [1.6, h * 0.3, -0.4], "r": [0, r.next(), 0]}))
	return Kit.group({}, parts)


static func pyramid(seed := 1) -> Node3D:
	var r := Kit.seeded(seed)
	var s := 1.6 + r.next() * 0.6
	return Kit.group({}, [Kit.mesh(Geo.cone(s, s * 1.1, 4), Kit.mat(C.sandDark), {"p": [0, s * 0.55, 0], "r": [0, PI / 4, 0]})])


static func tent(seed := 1, cloth := "") -> Node3D:
	var r := Kit.seeded(seed)
	var colors := ["#C9A27A", "#B9875E", "#E2C9A3", "#9D6B4C"]
	var c: String = cloth if cloth != "" else colors[floori(r.next() * colors.size())]
	return Kit.group({}, [
		Kit.mesh(Geo.cone(0.95, 1.15, 4), Kit.mat(c), {"p": [0, 0.58, 0], "r": [0, PI / 4, 0], "s": [1.25, 1, 0.9]}),
		Kit.mesh(Geo.box(0.32, 0.5, 0.02), Kit.mat(C.ink), {"p": [0, 0.26, 0.6], "shadow": false}),
		Kit.mesh(Geo.cyl(0.025, 0.025, 1.45, 4), Kit.mat(C.woodDark), {"p": [0, 0.72, 0]}),
	])


static func flower(seed := 1) -> Node3D:
	var r := Kit.seeded(seed)
	var petal: String = ["#F7D046", "#F08FB0", "#FFFFFF", "#B28CF2"][floori(r.next() * 4)]
	return Kit.group({}, [
		Kit.mesh(Geo.cyl(0.015, 0.015, 0.28, 4), Kit.mat(C.leafDark), {"p": [0, 0.14, 0], "shadow": false}),
		Kit.mesh(Geo.ball(0.08, 0), Kit.mat(petal), {"p": [0, 0.3, 0], "shadow": false}),
		Kit.mesh(Geo.ball(0.035, 0), Kit.mat(C.gold), {"p": [0, 0.31, 0.06], "shadow": false}),
	])


static func reeds(seed := 1) -> Node3D:
	var r := Kit.seeded(seed)
	var parts: Array = []
	for i in 5:
		var h := 0.6 + r.next() * 0.5
		parts.append(Kit.mesh(Geo.cyl(0.02, 0.025, h, 4), Kit.mat(C.leaf), {"p": [(r.next() - 0.5) * 0.4, h / 2, (r.next() - 0.5) * 0.3], "r": [0, 0, (r.next() - 0.5) * 0.3], "shadow": false}))
		parts.append(Kit.mesh(Geo.capsule(0.035, 0.12, 4), Kit.mat(C.trunk), {"p": [(r.next() - 0.5) * 0.4, h, (r.next() - 0.5) * 0.3], "shadow": false}))
	return Kit.group({}, parts)


static func decor(kind: String, seed := 1) -> Node3D:
	match kind:
		"tree":
			return tree(seed)
		"cypress":
			return cypress(seed)
		"palm":
			return palm(seed)
		"bush":
			return bush(seed)
		"rock":
			return rock(seed)
		"dune":
			return dune(seed)
		"hill":
			return hill(seed)
		"mountain":
			return mountain(seed)
		"pyramid":
			return pyramid(seed)
		"tent":
			return tent(seed)
		"flower":
			return flower(seed)
		"reeds":
			return reeds(seed)
	return tree(seed)


static func cloud(seed := 1, color: String = C.white) -> Node3D:
	var r := Kit.seeded(seed)
	var parts: Array = []
	var n := 3 + floori(r.next() * 3)
	for i in n:
		parts.append(Kit.mesh(Geo.ball(0.45 + r.next() * 0.35, 1), Kit.mat(color), {"p": [(i - n / 2.0) * 0.55, r.next() * 0.25, r.next() * 0.3], "shadow": false}))
	return Kit.group({}, parts)


static func sun() -> Node3D:
	var parts: Array = [Kit.mesh(Geo.disc(0.9, 24), Kit.glow("#FFD23F"), {"shadow": false})]
	for i in 10:
		var a := float(i) / 10.0 * TAU
		parts.append(Kit.mesh(Geo.box(0.16, 0.5, 0.05), Kit.glow("#FFE07A"), {"p": [cos(a) * 1.25, sin(a) * 1.25, -0.05], "r": [0, 0, a - PI / 2], "shadow": false}))
	return Kit.group({}, parts)


static func moon() -> Node3D:
	return Kit.group({}, [
		Kit.mesh(Geo.disc(0.75, 24), Kit.glow("#F4F1DC"), {"shadow": false}),
		Kit.mesh(Geo.disc(0.62, 24), Kit.glow("#2A3170"), {"p": [0.38, 0.18, 0.01], "shadow": false}),
	])


static func rainbow() -> Node3D:
	var colors := ["#E8555A", "#F59B42", "#F5D547", "#6CC46A", "#4DA3E0", "#8A6BD8"]
	var parts: Array = []
	for i in colors.size():
		parts.append(Kit.mesh(Geo.torus(3.0 - i * 0.22, 0.11, PI, 28), Kit.glow(colors[i], 0.85), {"shadow": false}))
	return Kit.group({}, parts)


## Estrelas: pontinhos brilhantes numa malha só.
static func stars(count: int, width: float, height: float, seed := 7) -> Node3D:
	var r := Kit.seeded(seed)
	var raw := Node3D.new()
	for i in count:
		var s := 0.05 + r.next() * 0.05
		raw.add_child(Kit.mesh(Geo.box(s, s, 0.01), Kit.glow("#FFF7D6"), {"p": [(r.next() - 0.5) * width, r.next() * height, 0], "shadow": false}))
	return MeshKit.merge(raw, false)
