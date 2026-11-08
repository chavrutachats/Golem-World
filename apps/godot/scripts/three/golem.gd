## O Golem em 3D (porte de apps/mobile/src/three/golem.ts): barro facetado, olhos grandes
## e as letras אמת (verdade) na testa, como na lenda. Os itens vestidos vão nos pontos de
## encaixe (cabeça, rosto, corpo, mão direita e a chavruta ao lado).
##
## Golem.build() devolve o boneco com as peças com nome; pose() aplica a pose a cada quadro.
class_name Golem
extends Node3D

const C := Kit.C
## Altura do Golem (pés no chão em y = 0).
const HEIGHT := 2.05

## Traços de cada letra (x, y, largura, altura, giro) no espaço da letra.
const LETTERS := {
	"tav": [[0.5, 1.1, 1, 0.2], [0.88, 0.5, 0.2, 1.0], [0.22, 0.5, 0.2, 1.0], [0.08, 0.06, 0.2, 0.14]],
	"mem": [[0.5, 1.1, 1, 0.2], [0.88, 0.55, 0.2, 1.1], [0.12, 0.65, 0.2, 0.75], [0.62, 0.08, 0.6, 0.18]],
	"alef": [[0.5, 0.6, 0.22, 1.35, 0.72], [0.82, 0.95, 0.18, 0.45, -0.25], [0.2, 0.25, 0.18, 0.5, -0.25]],
}

var body: Node3D
var head: Node3D
var eyes: Node3D
var arm_l: Node3D
var arm_r: Node3D
var leg_l: Node3D
var leg_r: Node3D
var companion: Golem
var holding := false
var pose_name := "idle"
var still := false
var _t := 0.0


static func _letter(strokes: Array, size: float, m: Material) -> Node3D:
	var g := Node3D.new()
	for s in strokes:
		var rot: float = s[4] if s.size() > 4 else 0.0
		g.add_child(Kit.mesh(Geo.box(s[2] * size, s[3] * size, size * 0.18), m, {"p": [(s[0] - 0.5) * size, (s[1] - 0.6) * size, 0], "r": [0, 0, rot], "shadow": false}))
	return g


## אמת da direita para a esquerda, como se lê em hebraico.
static func _emet(size: float) -> Node3D:
	var m := Kit.mat(C.gold, {"emissive": C.gold, "emissiveIntensity": 0.75})
	var gap := size * 1.3
	var word := Node3D.new()
	word.name = "emet"
	var alef := _letter(LETTERS.alef, size, m)
	alef.position.x = gap
	var tav := _letter(LETTERS.tav, size, m)
	tav.position.x = -gap
	word.add_child(alef)
	word.add_child(_letter(LETTERS.mem, size, m))
	word.add_child(tav)
	return word


# --- Itens ------------------------------------------------------------------------------


static func _kippah(color: String, rim := "") -> Node3D:
	var parts: Array = [Kit.mesh(Geo.sphere(0.4, 16, 6, PI * 0.3), Kit.mat(color), {"p": [0, -0.24, 0]})]
	if rim != "":
		parts.append(Kit.mesh(Geo.torus(0.325, 0.022, TAU, 22), Kit.mat(rim, {"smooth": true}), {"p": [0, -0.06, 0], "r": [PI / 2, 0, 0]}))
	return Kit.group({"p": [0.04, 0.06, 0.02], "r": [0.12, 0, 0.1]}, parts)


static func _glasses() -> Node3D:
	var frame := Kit.mat("#3B2A20", {"smooth": true})
	var lens := Kit.mat("#DDF1FF", {"smooth": true, "opacity": 0.35})
	return Kit.group({"p": [0, 0.02, 0.05]}, [
		Kit.mesh(Geo.torus(0.105, 0.018, TAU, 18), frame, {"p": [0.2, 0, 0]}),
		Kit.mesh(Geo.torus(0.105, 0.018, TAU, 18), frame, {"p": [-0.2, 0, 0]}),
		Kit.mesh(Geo.disc(0.1, 16), lens, {"p": [0.2, 0, 0.005], "shadow": false}),
		Kit.mesh(Geo.disc(0.1, 16), lens, {"p": [-0.2, 0, 0.005], "shadow": false}),
		Kit.mesh(Geo.box(0.1, 0.022, 0.022), frame, {"p": [0, 0.02, 0]}),
	])


static func _magnifier() -> Node3D:
	return Kit.group({"p": [0.24, -0.02, 0.1], "r": [0, 0, -0.5]}, [
		Kit.mesh(Geo.torus(0.15, 0.03, TAU, 20), Kit.mat(C.gold, {"smooth": true})),
		Kit.mesh(Geo.disc(0.14, 18), Kit.mat("#CFEAFF", {"smooth": true, "opacity": 0.4}), {"p": [0, 0, 0.01], "shadow": false}),
		Kit.mesh(Geo.cyl(0.03, 0.03, 0.28, 6), Kit.mat(C.woodDark), {"p": [0, -0.3, 0]}),
	])


static func _tzitzit() -> Node3D:
	var cloth := Kit.mat(C.white)
	var stripe := Kit.mat(C.techelet)
	var parts: Array = [
		Kit.mesh(Geo.rbox(0.98, 0.62, 0.74, 0.12), cloth, {"p": [0, 0.04, 0]}),
		Kit.mesh(Geo.box(0.99, 0.06, 0.75), stripe, {"p": [0, -0.12, 0]}),
	]
	for x in [-0.42, 0.42]:
		for z in [0.3, -0.3]:
			parts.append(Kit.mesh(Geo.cyl(0.012, 0.012, 0.32, 4), cloth, {"p": [x, -0.42, z], "shadow": false}))
			parts.append(Kit.mesh(Geo.cyl(0.012, 0.012, 0.3, 4), stripe, {"p": [x + 0.03, -0.41, z], "shadow": false}))
	return Kit.group({}, parts)


static func _book_bag() -> Node3D:
	return Kit.group({"p": [0, 0, -0.42]}, [
		Kit.mesh(Geo.rbox(0.62, 0.62, 0.26, 0.08), Kit.mat("#6B4A9A")),
		Kit.mesh(Geo.rbox(0.5, 0.2, 0.06, 0.04), Kit.mat("#8C69BD"), {"p": [0, -0.12, 0.14]}),
		Kit.mesh(Geo.box(0.08, 0.7, 0.04), Kit.mat("#4E3473"), {"p": [0.24, 0.2, 0.4]}),
		Kit.mesh(Geo.box(0.08, 0.7, 0.04), Kit.mat("#4E3473"), {"p": [-0.24, 0.2, 0.4]}),
		Kit.mesh(Geo.box(0.16, 0.22, 0.12), Kit.mat(C.red), {"p": [-0.12, 0.36, 0]}),
		Kit.mesh(Geo.box(0.14, 0.18, 0.12), Kit.mat(C.techelet), {"p": [0.08, 0.34, 0]}),
	])


static func _lamp() -> Node3D:
	return Kit.group({"p": [0, -0.05, 0.14]}, [
		Kit.mesh(Geo.sphere(0.13, 10, 6, PI * 0.55), Kit.mat(C.clayLight), {"r": [PI, 0, 0], "s": [1.4, 0.8, 1]}),
		Kit.mesh(Geo.cyl(0.03, 0.05, 0.12, 6), Kit.mat(C.clayLight), {"p": [0.2, 0.0, 0], "r": [0, 0, -1.2]}),
		Kit.mesh(Geo.cone(0.05, 0.16, 6), Kit.glow(C.fireCore), {"p": [0.27, 0.12, 0], "name": "flame", "shadow": false}),
	])


static func _quill() -> Node3D:
	var feather := PackedVector2Array()
	# Contorno da pena: duas curvas (aproximadas por pontos).
	for i in 9:
		var t := float(i) / 8.0
		feather.append(Vector2(0, 0).lerp(Vector2(0.12, 0.25), t).lerp(Vector2(0.12, 0.25).lerp(Vector2(0.04, 0.62), t), t))
	for i in range(1, 8):
		var t := float(i) / 8.0
		feather.append(Vector2(0.04, 0.62).lerp(Vector2(-0.08, 0.3), t).lerp(Vector2(-0.08, 0.3).lerp(Vector2(0, 0), t), t))
	return Kit.group({"p": [0.02, 0.04, 0.12], "r": [0, 0, -0.35]}, [
		Kit.mesh(Geo.shape("quill", feather, 0.02), Kit.mat(C.cream), {"p": [0, 0.05, 0]}),
		Kit.mesh(Geo.cyl(0.012, 0.008, 0.72, 4), Kit.mat("#8C7B62"), {"p": [0.02, 0.28, 0.012]}),
	])


static func _shofar() -> Node3D:
	var pts := [Vector3(0, 0, 0), Vector3(0.18, 0.12, 0.05), Vector3(0.36, 0.36, 0), Vector3(0.38, 0.62, -0.05)]
	var curve := Curve3D.new()
	for p in pts:
		curve.add_point(p)
	var horn := Kit.mat("#D9B98A")
	var parts: Array = []
	var n := 9
	var length := curve.get_baked_length()
	for i in n:
		var t := float(i) / (n - 1)
		var p := curve.sample_baked(t * length)
		parts.append(Kit.mesh(Geo.ball(0.035 + t * 0.07, 0), Kit.mat("#B28E5C") if i == n - 1 else horn, {"p": p}))
	return Kit.group({"p": [-0.05, -0.05, 0.12], "r": [0, 0.3, 0]}, parts)


static func _flag() -> Node3D:
	return Kit.group({"p": [0, -0.05, 0.12]}, [
		Kit.mesh(Geo.cyl(0.022, 0.022, 1.0, 6), Kit.mat(C.woodDark), {"p": [0, 0.4, 0]}),
		Kit.mesh(Geo.box(0.46, 0.32, 0.02), Kit.mat(C.white), {"p": [0.25, 0.72, 0], "name": "cloth"}),
		Kit.mesh(Geo.box(0.46, 0.05, 0.025), Kit.mat(C.techelet), {"p": [0.25, 0.83, 0]}),
		Kit.mesh(Geo.box(0.46, 0.05, 0.025), Kit.mat(C.techelet), {"p": [0.25, 0.61, 0]}),
		Kit.mesh(Geo.cyl(0.025, 0.025, 0.14, 6), Kit.mat(C.goldDeep), {"p": [0.21, 0.72, 0.02]}),
		Kit.mesh(Geo.cyl(0.025, 0.025, 0.14, 6), Kit.mat(C.goldDeep), {"p": [0.29, 0.72, 0.02]}),
		Kit.mesh(Geo.ball(0.035, 0), Kit.mat(C.red), {"p": [0, 0.92, 0]}),
	])


static func _head_item(id: String) -> Node3D:
	match id:
		"kipa-azul":
			return _kippah(C.velvet, C.gold)
		"kipa-vermelha":
			return _kippah(C.red)
		"kipa-shabat":
			return _kippah(C.white, C.gold)
	return null


static func _face_item(id: String) -> Node3D:
	if id == "oculos":
		return _glasses()
	if id == "lupa":
		return _magnifier()
	return null


static func _body_item(id: String) -> Node3D:
	if id == "tzitzit":
		return _tzitzit()
	if id == "sacola":
		return _book_bag()
	return null


static func _hand_item(id: String) -> Node3D:
	match id:
		"lamparina":
			return _lamp()
		"pena":
			return _quill()
		"shofar":
			return _shofar()
		"bandeira":
			return _flag()
	return null


# --- O boneco ---------------------------------------------------------------------------


## look: {equipped: {slot: itemId}} (GolemLook da API). skin_clay: cor do barro do material vestido.
static func build(look: Dictionary = {}, clay_color := "", bare := false, skin_clay := "") -> Golem:
	var e: Dictionary = {} if bare else look.get("equipped", {})
	if skin_clay == "" and e.has("skin"):
		var skin_item := JourneyData.item(str(e.skin))
		if skin_item.get("clay") != null:
			skin_clay = str(skin_item.clay)
	var base := clay_color if clay_color != "" else (skin_clay if skin_clay != "" else C.clay)
	var clay := Kit.mat(base)
	var dark_c := C.clay if clay_color != "" else (Color(skin_clay).darkened(0.18).to_html(false) if skin_clay != "" else C.clayDark)
	var clay_dark := Kit.mat("#" + dark_c.trim_prefix("#"))
	var ink := Kit.mat(C.ink, {"smooth": true})
	var shine := Kit.glow("#FFFFFF")
	var g := Golem.new()
	g.name = "golem"

	g.leg_l = Kit.group({"p": [0.23, 0.38, 0]}, [Kit.mesh(Geo.rbox(0.3, 0.36, 0.34, 0.1), clay_dark, {"p": [0, -0.18, 0.02]})])
	g.leg_r = Kit.group({"p": [-0.23, 0.38, 0]}, [Kit.mesh(Geo.rbox(0.3, 0.36, 0.34, 0.1), clay_dark, {"p": [0, -0.18, 0.02]})])
	var arm := func() -> Array:
		return [Kit.mesh(Geo.capsule(0.12, 0.3, 6), clay, {"p": [0, -0.24, 0]}), Kit.mesh(Geo.ball(0.15, 1), clay, {"p": [0, -0.5, 0.02]})]
	g.arm_l = Kit.group({"p": [0.56, 1.02, 0]}, arm.call())
	g.arm_r = Kit.group({"p": [-0.56, 1.02, 0]}, arm.call())
	var torso := Kit.group({"p": [0, 0.76, 0]}, [Kit.mesh(Geo.rbox(0.94, 0.8, 0.7, 0.18), clay)])
	var eye := func(x: float) -> Node3D:
		return Kit.group({"p": [x, 0, 0]}, [
			Kit.mesh(Geo.ball(0.085, 1), ink, {"s": [1, 1.15, 0.6]}),
			Kit.mesh(Geo.ball(0.026, 0), shine, {"p": [0.025, 0.035, 0.045], "shadow": false}),
		])
	g.eyes = Kit.group({"p": [0, 0.02, 0.43], "name": "eyes"}, [eye.call(0.21), eye.call(-0.21)])
	g.head = Kit.group({"p": [0, 1.6, 0]}, [
		Kit.mesh(Geo.rbox(1.06, 0.88, 0.86, 0.24), clay),
		g.eyes,
		Kit.mesh(Geo.disc(0.075, 12), Kit.mat(C.blush), {"p": [0.34, -0.12, 0.432], "shadow": false}),
		Kit.mesh(Geo.disc(0.075, 12), Kit.mat(C.blush), {"p": [-0.34, -0.12, 0.432], "shadow": false}),
		Kit.mesh(Geo.torus(0.075, 0.02, PI, 10), ink, {"p": [0, -0.15, 0.43], "r": [0, 0, PI]}),
		Kit.group({"p": [0, 0.27, 0.432]}, [_emet(0.11)]),
	])
	var hides_costume := e.has("costume")
	var hat := null if hides_costume else _head_item(str(e.get("head", "")))
	if hat:
		hat.position.y += 0.44
		g.head.add_child(hat)
	var face := _face_item(str(e.get("face", "")))
	if face:
		face.position.z += 0.44
		g.head.add_child(face)
	var thing := null if hides_costume else _body_item(str(e.get("body", "")))
	if thing:
		torso.add_child(thing)
	var hand := null if hides_costume else _hand_item(str(e.get("hand", "")))
	if hand:
		hand.position.y -= 0.5
		hand.position.z += 0.12
		g.arm_r.add_child(hand)
		g.holding = true
	g.body = Kit.group({}, [torso, g.head, g.arm_l, g.arm_r])
	g.add_child(g.body)
	g.add_child(g.leg_l)
	g.add_child(g.leg_r)
	if hides_costume and Costumes.dress(str(e.costume), g.head, torso, g.arm_r, g):
		g.holding = true
	if not bare and str(e.get("companion", "")) == "chavruta":
		var c := build({}, C.clayLight, true)
		c.set_process(false)
		c.scale = Vector3.ONE * 0.55
		c.position = Vector3(-1.05, 0, -0.35)
		c.arm_l.add_child(Kit.mesh(Geo.box(0.34, 0.26, 0.08), Kit.mat(C.velvet), {"p": [-0.25, -0.55, 0.2], "r": [0.3, 0, 0.3]}))
		g.companion = c
		g.add_child(c)
	g.apply_pose(0.0)
	return g


func _process(dt: float) -> void:
	_t += dt
	apply_pose(_t)


## Movimentos pequenos e redondos, como de massinha (porte de poseGolem).
func apply_pose(t: float) -> void:
	var s := 0.0 if still else 1.0
	body.position = Vector3.ZERO
	body.rotation = Vector3.ZERO
	head.rotation = Vector3.ZERO
	leg_l.rotation = Vector3.ZERO
	leg_r.rotation = Vector3.ZERO
	var hold := -0.75 if holding else 0.0
	arm_l.rotation = Vector3(0, 0, 0.14)
	arm_r.rotation = Vector3(hold, 0, -0.14)
	var blink := 0.15 if fmod(t, 3.7) < 0.12 and s > 0.0 else 1.0
	eyes.scale = Vector3(1, blink, 1)
	match pose_name:
		"idle":
			body.position.y = sin(t * 2.2) * 0.02 * s
			head.rotation.z = sin(t * 1.1) * 0.04 * s
		"walk":
			var w := t * 9.0
			var swing := sin(w) * 0.55 * s
			leg_l.rotation.x = swing
			leg_r.rotation.x = -swing
			arm_l.rotation.x = -swing * 0.8
			arm_r.rotation.x = hold + swing * (0.3 if holding else 0.8)
			body.position.y = absf(cos(w)) * 0.07 * s
			body.rotation.z = sin(w) * 0.04 * s
		"jump":
			leg_l.rotation.x = -0.7
			leg_r.rotation.x = -0.5
			arm_l.rotation.z = 2.4
			arm_r.rotation.z = -2.4
			head.rotation.x = -0.12
		"hurt":
			eyes.scale = Vector3(1.15, 0.25, 1)
			head.rotation.z = 0.22 + sin(t * 30.0) * 0.05 * s
			body.rotation.z = -0.1
			arm_l.rotation.z = 0.9
			arm_r.rotation.z = -0.9
		"cheer":
			var c := t * 7.0
			arm_l.rotation.z = 2.5 + sin(c) * 0.3 * s
			arm_r.rotation.z = -2.5 - sin(c) * 0.3 * s
			body.position.y = absf(sin(c * 0.5)) * 0.18 * s
			leg_l.rotation.x = sin(c) * 0.2 * s
			leg_r.rotation.x = -sin(c) * 0.2 * s
	if companion:
		companion.pose_name = "walk" if pose_name == "jump" else pose_name
		companion.still = still
		companion.apply_pose(t + 0.4)
