## O sevivon e a mesa em 3D, com materiais físicos (PBR): madeira envernizada com veios
## (shader), ouro de verdade (metálico, refletindo o estúdio de luz), faces esmaltadas e
## as palavras hebraicas em relevo (תורה, נ״ך, משנה, תלמוד, הלכה, מדרש), a Coroa e a
## moeda do Prêmio. Medidas e orientação iguais às do app (SevivonMath).
class_name SevivonModel

const WOOD_LIGHT := Color("#B47A43")
const WOOD_DARK := Color("#6A3F1F")
const GOLD := Color("#E9B54A")
const CROWN_PANEL := Color("#1E2766")
const TABLE_RADIUS := 1.55

static var _wood_shader: Shader = preload("res://shaders/wood.gdshader")
static var _felt_shader: Shader = preload("res://shaders/felt.gdshader")


static func wood(light := WOOD_LIGHT, dark := WOOD_DARK, ring_scale := 13.0, gloss := 0.78) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _wood_shader
	m.set_shader_parameter("light_wood", light)
	m.set_shader_parameter("dark_wood", dark)
	m.set_shader_parameter("ring_scale", ring_scale)
	m.set_shader_parameter("gloss", gloss)
	return m


static func gold(roughness := 0.22) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = GOLD
	m.metallic = 0.92
	m.roughness = roughness
	m.metallic_specular = 0.6
	return m


static func enamel(color: Color, emission := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.34
	m.metallic = 0.0
	m.metallic_specular = 0.4
	if emission > 0.0:
		m.emission_enabled = true
		m.emission = color
		m.emission_energy_multiplier = emission
	return m


static func _mi(mesh: Mesh, material: Material, pos := Vector3.ZERO, shadow := true) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	m.mesh = mesh
	m.material_override = material
	m.position = pos
	m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return m


## {root: Node3D, panels: Array[StandardMaterial3D]} (o material de cada face, para a sorteada brilhar).
static func build() -> Dictionary:
	var R := SevivonMath.RADIUS
	var H := SevivonMath.BODY
	var P := SevivonMath.POINT
	var S := SevivonMath.SHOULDER
	var K := SevivonMath.HANDLE
	var root := Node3D.new()
	root.name = "Sevivon"
	var body_wood := wood()
	var dark_wood := wood(WOOD_DARK.lightened(0.08), WOOD_DARK.darkened(0.35), 18.0, 0.7)
	# Corpo com chanfros: as quinas pegam a luz e o octógono fica nítido.
	var c := 0.028
	root.add_child(_mi(MeshKit.lathe_flat(PackedVector2Array([Vector2(R * 0.955, -H / 2 - c), Vector2(R, -H / 2 + c * 0.4), Vector2(R, H / 2 - c * 0.4), Vector2(R * 0.955, H / 2 + c)]), 8), body_wood))
	root.add_child(_mi(MeshKit.lathe_flat(PackedVector2Array([Vector2(0.0, -H / 2 - P), Vector2(0.05, -H / 2 - P + 0.04), Vector2(R * 0.955, -H / 2 - c)]), 8, false), dark_wood))
	root.add_child(_mi(MeshKit.lathe_flat(PackedVector2Array([Vector2(R * 0.955, H / 2 + c), Vector2(R * 0.44, H / 2 + S), Vector2(SevivonMath.HANDLE_RADIUS * 1.2, H / 2 + S)]), 8, false), dark_wood))
	# Frisos de ouro em cima e embaixo das faces.
	var gold_mat := gold()
	for y in [H / 2 - 0.035, -H / 2 + 0.035]:
		root.add_child(_mi(MeshKit.lathe_flat(PackedVector2Array([Vector2(R * 1.02, y - 0.022), Vector2(R * 1.03, y), Vector2(R * 1.02, y + 0.022)]), 8, false), gold_mat))
	var handle := CylinderMesh.new()
	handle.top_radius = SevivonMath.HANDLE_RADIUS
	handle.bottom_radius = SevivonMath.HANDLE_RADIUS * 1.15
	handle.height = K
	handle.radial_segments = 20
	root.add_child(_mi(handle, body_wood, Vector3(0, H / 2 + S + K / 2, 0)))
	var knob := SphereMesh.new()
	knob.radius = SevivonMath.KNOB_RADIUS
	knob.height = SevivonMath.KNOB_RADIUS * 2
	knob.radial_segments = 24
	knob.rings = 12
	root.add_child(_mi(knob, gold(0.15), Vector3(0, H / 2 + S + K + SevivonMath.KNOB_RADIUS * 0.6, 0)))

	var panels: Array[StandardMaterial3D] = []
	var face_w := 2.0 * R * sin(PI / 8.0)
	var panel_w := face_w * 0.8
	var panel_h := H * 0.78
	var font: Font = Ui.fonts.display
	var widest := 0.0
	for id in Ui.CATEGORIES:
		widest = maxf(widest, font.get_string_size(Ui.CATEGORIES[id].word, HORIZONTAL_ALIGNMENT_LEFT, -1, 64).x)
	var pixel := minf(0.0031, panel_w * 0.84 / widest)
	for k in SevivonMath.FACE_COUNT:
		var slice := Ui.WHEEL_SLICES[k]
		var panel_color: Color
		var ink: Color
		if slice == "crown":
			panel_color = CROWN_PANEL
			ink = Ui.CROWN_COLOR
		elif slice == "prize":
			panel_color = Ui.PRIZE_COLOR
			ink = Ui.PRIZE_ON
		else:
			panel_color = Ui.CATEGORIES[slice].color
			ink = Ui.CATEGORIES[slice].on
		var panel_mat := enamel(panel_color, 0.06)
		panels.append(panel_mat)
		var face := Node3D.new()
		face.name = "face-%s" % slice
		var plate := BoxMesh.new()
		plate.size = Vector3(panel_w, panel_h, 0.018)
		face.add_child(_mi(plate, panel_mat, Vector3.ZERO, false))
		var ink_mat: Material = gold(0.2) if ink == Ui.CROWN_COLOR else enamel(ink, 0.12)
		if slice == "crown":
			face.add_child(_crown(gold(0.18)))
		elif slice == "prize":
			face.add_child(_coin())
		else:
			var word := TextMesh.new()
			word.text = Ui.CATEGORIES[slice].word
			word.font = font
			word.font_size = 64
			word.pixel_size = pixel
			word.depth = 0.014
			word.curve_step = 0.5
			word.text_direction = TextServer.DIRECTION_RTL
			face.add_child(_mi(word, ink_mat, Vector3(0, -0.005, 0.016), false))
			# Dois losangos de ouro emolduram a palavra, como nos sevivonim pintados.
			for y in [panel_h * 0.36, -panel_h * 0.36]:
				var d := BoxMesh.new()
				d.size = Vector3(0.042, 0.042, 0.012)
				var dm := _mi(d, gold(0.25), Vector3(0, y, 0.012), false)
				dm.rotation.z = PI / 4
				face.add_child(dm)
		var a := k * SevivonMath.FACE_ANGLE
		var r := SevivonMath.INNER_RADIUS + 0.009
		face.position = Vector3(sin(a) * r, 0, cos(a) * r)
		face.rotation.y = a
		root.add_child(face)
	return {"root": root, "panels": panels}


## Coroa em relevo (o desenho do selo da Coroa, em 32×32 com y para baixo).
static func _crown(mat: Material) -> Node3D:
	var s := 0.0105
	var pts := PackedVector2Array()
	for p in [[5, 25], [3.5, 10.5], [10.5, 16], [16, 6.5], [21.5, 16], [28.5, 10.5], [27, 25]]:
		pts.append(Vector2((p[0] - 16) * s, (16 - p[1]) * s))
	var g := Node3D.new()
	g.add_child(_mi(MeshKit.extrude(pts, 0.03), mat, Vector3(0, 0.02, 0.006), false))
	var band := BoxMesh.new()
	band.size = Vector3(22 * s, 3 * s, 0.032)
	g.add_child(_mi(band, mat, Vector3(0, (16 - 26.5) * s + 0.02, 0.022), false))
	for p in [[16, 5], [3.5, 9.5], [28.5, 9.5]]:
		var j := SphereMesh.new()
		j.radius = 0.022
		j.height = 0.044
		g.add_child(_mi(j, mat, Vector3((p[0] - 16) * s, (16 - p[1]) * s + 0.02, 0.035), false))
	return g


## Moeda do Prêmio: aro de ouro, miolo claro e a romã do shekel.
static func _coin() -> Node3D:
	var g := Node3D.new()
	var rim := CylinderMesh.new()
	rim.top_radius = 0.155
	rim.bottom_radius = 0.155
	rim.height = 0.03
	rim.radial_segments = 40
	var rim_i := _mi(rim, gold(0.18), Vector3(0, 0, 0.015), false)
	rim_i.rotation.x = PI / 2
	g.add_child(rim_i)
	var face := CylinderMesh.new()
	face.top_radius = 0.125
	face.bottom_radius = 0.125
	face.height = 0.034
	face.radial_segments = 40
	var face_i := _mi(face, enamel(Color("#FFFDF7")), Vector3(0, 0, 0.018), false)
	face_i.rotation.x = PI / 2
	g.add_child(face_i)
	var fruit := SphereMesh.new()
	fruit.radius = 0.062
	fruit.height = 0.124
	var fruit_i := _mi(fruit, enamel(Color("#C4283E")), Vector3(0, -0.012, 0.05), false)
	fruit_i.scale = Vector3(1, 0.95, 0.55)
	g.add_child(fruit_i)
	return g


## A mesa redonda: tampo de nogueira envernizada, feltro tekhelet e um filete de ouro.
static func build_table() -> Node3D:
	var R0 := TABLE_RADIUS
	var g := Node3D.new()
	g.name = "Mesa"
	var top := CylinderMesh.new()
	top.top_radius = R0
	top.bottom_radius = R0 * 0.96
	top.height = 0.16
	top.radial_segments = 96
	var walnut := wood(Color("#6B3C1E"), Color("#2E170A"), 9.0, 0.82)
	var wood_i := _mi(top, walnut, Vector3(0, -0.085, 0))
	g.add_child(wood_i)
	var felt := CylinderMesh.new()
	felt.top_radius = R0 - 0.2
	felt.bottom_radius = R0 - 0.2
	felt.height = 0.1
	felt.radial_segments = 96
	var felt_mat := ShaderMaterial.new()
	felt_mat.shader = _felt_shader
	felt_mat.set_shader_parameter("felt", Color("#1B2263"))
	g.add_child(_mi(felt, felt_mat, Vector3(0, -0.042, 0)))
	var inlay := TorusMesh.new()
	inlay.inner_radius = R0 - 0.2
	inlay.outer_radius = R0 - 0.165
	inlay.rings = 128
	inlay.ring_segments = 8
	var inlay_i := _mi(inlay, gold(0.2), Vector3(0, 0.003, 0), false)
	inlay_i.scale = Vector3(1, 0.5, 1)
	g.add_child(inlay_i)
	return g
