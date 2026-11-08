## Peças básicas do Golem World (porte de apps/mobile/src/three/kit.ts): a paleta, os
## materiais de barro e a montagem de malhas e grupos.
##
## Barro fosco e facetado, com luz de céu suave e sombra macia. Os materiais ficam em
## cache por cor e opções (são poucos, e cada cena nova sai de graça).
class_name Kit

const C := {
	"clay": "#A9714E", "clayDark": "#8A573A", "clayLight": "#C58D66", "ink": "#2A1C14",
	"white": "#FFFFFF", "cream": "#F6EBD3", "gold": "#F2B630", "goldDeep": "#C98A12",
	"velvet": "#1D2A78", "techelet": "#3E7BD6", "red": "#D64545", "blush": "#E79A86",
	"leaf": "#5E9E4B", "leafDark": "#3F7A38", "leafLight": "#8BC46A", "trunk": "#7A5233",
	"sand": "#E8C88E", "sandDark": "#CFA766", "stone": "#9C9A92", "stoneDark": "#77746D",
	"water": "#3C8FD8", "waterLight": "#7CC0F2", "wood": "#A87445", "woodDark": "#7E532D",
	"linen": "#EFE6D2", "fire": "#FF8A2A", "fireCore": "#FFD45C", "night": "#141B44",
}

static var _mats := {}


## Barro (ou outro material fosco), facetado. opts: emissive, emissiveIntensity, smooth, opacity, double.
static func mat(color: String, opts: Dictionary = {}) -> StandardMaterial3D:
	var key := "%s|%s" % [color, JSON.stringify(opts)]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(color)
	m.roughness = 0.82 if not opts.get("smooth", false) else 0.45
	m.metallic_specular = 0.35
	if opts.has("emissive"):
		m.emission_enabled = true
		m.emission = Color(opts.emissive)
		m.emission_energy_multiplier = float(opts.get("emissiveIntensity", 1.0))
	if float(opts.get("opacity", 1.0)) < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = float(opts.opacity)
		m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	if opts.get("double", false):
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.set_meta("smooth", bool(opts.get("smooth", false)))
	_mats[key] = m
	return m


## Material que não recebe luz (céu, brilhos, chamas).
static func glow(color: String, opacity := 1.0) -> StandardMaterial3D:
	var key := "glow|%s|%s" % [color, opacity]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(color)
	if opacity < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = opacity
		m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	m.set_meta("smooth", true)
	_mats[key] = m
	return m


## Uma malha posicionada. at: p (posição), r (rotação em radianos, ordem XYZ), s (escala:
## número ou vetor), name, shadow (projeta sombra; padrão sim).
static func mesh(spec: Dictionary, material: Material, at: Dictionary = {}) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = Geo.resolve(spec, bool(material.get_meta("smooth", false)))
	mi.material_override = material
	place(mi, at)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if at.get("shadow", true) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


static func group(at: Dictionary = {}, children: Array = []) -> Node3D:
	var g := Node3D.new()
	place(g, at)
	for c in children:
		if c:
			g.add_child(c)
	return g


static func place(o: Node3D, at: Dictionary) -> Node3D:
	if at.has("p"):
		o.position = _v(at.p)
	if at.has("r"):
		# O three.js gira em X, depois Y, depois Z (ordem "XYZ" intrínseca).
		o.basis = Basis.from_euler(_v(at.r), EULER_ORDER_XYZ) * Basis.from_scale(o.scale)
	if at.has("s"):
		var s: Variant = at.s
		o.scale = Vector3.ONE * float(s) if (s is float or s is int) else _v(s)
	if at.has("name"):
		o.name = str(at.name)
	return o


static func _v(a: Variant) -> Vector3:
	if a is Vector3:
		return a
	return Vector3(float(a[0]), float(a[1]), float(a[2]))


## Número estável a partir de um texto (FNV-1a de 32 bits, igual ao hashString do app).
static func hash_string(text: String) -> int:
	var h := 2166136261
	for i in text.length():
		h = h ^ text.unicode_at(i)
		h = (h * 16777619) & 0xFFFFFFFF
	return h


## Sorteio com semente (xorshift de 32 bits, igual ao `seeded` do app): o mesmo cenário em todo aparelho.
class Rng:
	var s := 1

	func _init(seed: int) -> void:
		s = seed & 0xFFFFFFFF
		if s == 0:
			s = 1

	func next() -> float:
		s = s ^ ((s << 13) & 0xFFFFFFFF)
		s = s ^ (s >> 17)
		s = s ^ ((s << 5) & 0xFFFFFFFF)
		return float(s % 100000) / 100000.0


static func seeded(seed: int) -> Rng:
	return Rng.new(seed)
