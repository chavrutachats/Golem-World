## A cena de uma fase do Golem World (porte de three/level.ts e de LevelScene3D.tsx): um
## diorama visto de lado, com céu em degradê, as peças da parashá no fundo (em paralaxe),
## uma faixa de chão e enfeites que passam pelo Golem. O Golem fica parado em golemX; o
## cenário e os obstáculos é que andam.
class_name LevelStage
extends Node3D

const C := Kit.C
const GOLEM_X := -2.4
const STOP_X := -0.6
const SPAWN_X := 6.2
const PASS_X := -5.2
const GOAL_X := -0.4

const SKY_STOPS := {
	"day": ["#5FA8F0", "#9ED0FF", "#DDF0FF"], "dawn": ["#6F7FD3", "#F2A3B5", "#FFE0B5"],
	"dusk": ["#3F3683", "#DD7A7E", "#FFC48A"], "night": ["#0B1033", "#1C2766", "#373C86"],
	"gold": ["#F1BC48", "#FFE29C", "#FFF4D6"], "desert": ["#5DA2E6", "#A9D2F2", "#F6E2B8"],
	"storm": ["#35404F", "#5F6B7E", "#8F9BAD"], "void": ["#04050C", "#0B0D28", "#17193F"],
}
## Luz de cada céu (porte de lighting.ts): céu, chão, força do céu, sol, força do sol (÷π, como no app).
const MOODS := {
	"day": ["#DCEBFF", "#8E7A5C", 1.9, "#FFF1D6", 2.6], "dawn": ["#FFE1C8", "#7E6650", 1.7, "#FFC58A", 2.3],
	"dusk": ["#FFC9A8", "#5E4A52", 1.5, "#FF9E66", 2.1], "night": ["#8FA2FF", "#2A2440", 1.0, "#C9D6FF", 1.3],
	"gold": ["#FFF0C2", "#9A7A3A", 1.8, "#FFE09A", 2.5], "storm": ["#AAB6C8", "#4C5560", 1.4, "#DCE6F2", 1.4],
	"void": ["#6A6F9A", "#1A1A2E", 0.9, "#B9C2FF", 1.0],
}
const SKY_MOOD := {"day": "day", "dawn": "dawn", "dusk": "dusk", "night": "night", "gold": "gold", "desert": "day", "storm": "storm", "void": "void"}
const GROUND := {
	"grass": ["#8BC46A", "#6E4A2E", "#6FA853"], "sand": ["#E8C88E", "#B98C55", "#D4AE6E"],
	"mud": ["#8E6A48", "#5E422A", "#77583A"], "water": ["#3C8FD8", "#2A5E9A", "#7CC0F2"],
	"stone": ["#C9C3B5", "#8E887C", "#AFA898"], "field": ["#D9C25A", "#7A5A32", "#C4A944"],
}
const NEAR_DECOR := {"grass": ["flower", "bush", "flower", "rock"], "sand": ["rock", "flower", "rock"], "mud": ["reeds", "rock", "reeds"], "water": [], "stone": ["rock", "flower", "rock"], "field": ["flower", "bush", "flower"]}
const MID_DECOR := {"grass": ["tree", "bush", "tree", "cypress"], "sand": ["palm", "dune", "rock", "palm"], "mud": ["reeds", "tree", "rock"], "water": [], "stone": ["cypress", "rock", "cypress"], "field": ["tree", "bush", "tree"]}
const SKY_PROPS := ["sun", "moon", "rainbow", "stars"]

var golem: Golem
var obstacle: Node3D
var goal: Node3D
var camera := Camera3D.new()
var scroll := 0.0
var _env_root := Node3D.new()
var _layers: Array = []
var _env := Environment.new()
var _sun := DirectionalLight3D.new()
var _stage_key := ""
var _t := 0.0


func _ready() -> void:
	var we := WorldEnvironment.new()
	_env.background_mode = Environment.BG_COLOR
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	_env.tonemap_exposure = 1.05
	_env.adjustment_enabled = true
	_env.adjustment_saturation = 0.82
	_env.fog_enabled = true
	_env.fog_density = 0.012
	we.environment = _env
	add_child(we)
	_sun.shadow_enabled = true
	_sun.shadow_blur = 1.5
	_sun.directional_shadow_max_distance = 30.0
	add_child(_sun)
	_sun.position = Vector3(4, 8, 6)
	_sun.look_at(Vector3.ZERO)
	# Largura fixa: o Golem (x = −2,4) e o obstáculo cabem em qualquer tela.
	camera.fov = 48.0
	camera.keep_aspect = Camera3D.KEEP_WIDTH
	camera.position = Vector3(0, 2.15, 9.2)
	add_child(camera)
	camera.look_at(Vector3(0, 1.15, 0))
	add_child(_env_root)


func setup(look: Dictionary) -> void:
	golem = Golem.build(look)
	golem.position = Vector3(GOLEM_X, 0, 0)
	golem.rotation.y = 0.55
	add_child(golem)


## Monta o cenário de um trecho (só refaz se mudou).
func set_stage(stage: Dictionary, seed_text := "") -> void:
	var key := "%s|%s|%s|%s" % [seed_text, stage.sky, stage.ground, ",".join(PackedStringArray(stage.props))]
	if key == _stage_key:
		return
	_stage_key = key
	for c in _env_root.get_children():
		c.queue_free()
	_layers.clear()
	var seed := Kit.hash_string(key)
	var r := Kit.seeded(seed)
	var sky := str(stage.sky)
	var stops: Array = SKY_STOPS.get(sky, SKY_STOPS.day)
	var props: Array = stage.props
	var mood: Array = MOODS[SKY_MOOD.get(sky, "day")]
	_env.background_color = Color(stops[stops.size() - 1])
	_env.fog_light_color = Color(stops[stops.size() - 1])
	_env.ambient_light_color = Color(mood[0]).lerp(Color(mood[1]), 0.3)
	_env.ambient_light_energy = float(mood[2]) / PI
	_sun.light_color = Color(mood[3])
	_sun.light_energy = float(mood[4]) / PI
	# Céu em degradê, atrás de tudo.
	var sky_mesh := _sky_backdrop(stops, 120, 46)
	sky_mesh.position = Vector3(0, 14, -40)
	_env_root.add_child(sky_mesh)
	var dark := sky == "night" or sky == "void"
	if dark or props.has("stars"):
		var s := Nature.stars(40 if sky == "void" else 90, 70, 20, seed)
		s.position = Vector3(0, 4, -38)
		_env_root.add_child(s)
	for item in [["sun", Vector3(5.5, 6.2, -30), 1.4], ["moon", Vector3(5.8, 6.4, -30), 1.3], ["rainbow", Vector3(0, 0.5, -30), 3.2]]:
		if props.has(item[0]):
			var o := Story.prop(item[0])
			o.position = item[1]
			o.scale = Vector3.ONE * float(item[2])
			_env_root.add_child(o)
	var clouds := _Wrap.new(60, 0.08)
	if not dark and sky != "gold":
		var color := "#7D8799" if sky == "storm" else "#FFFFFF"
		for i in 6:
			var c := Nature.cloud(seed + i, color)
			c.position = Vector3(0, 5.5 + r.next() * 3.5, -24 - r.next() * 6)
			c.scale = Vector3.ONE * (1.6 + r.next() * 1.2)
			clouds.add(c, i * 10 + r.next() * 4)
	_add_layer(clouds)
	# Fundo: as peças da parashá, em paralaxe lenta, e morros no horizonte.
	var far := _Wrap.new(34, 0.22)
	var story := props.filter(func(p): return not SKY_PROPS.has(p) and p != "sea-walls")
	for i in story.size():
		var o := Story.prop(str(story[i]), seed + i)
		o.position = Vector3(0, -0.2, -11 - (i % 2) * 3)
		o.scale = Vector3.ONE * 1.25
		far.add(o, i * (34.0 / maxi(1, story.size())) + 4)
	var ground := str(stage.ground)
	var hill := C.sandDark if ground == "sand" else ("#B9B2A2" if ground == "stone" else ("#6FA0C8" if ground == "water" else "#79B05C"))
	for i in 5:
		var h := Kit.mesh(Geo.sphere(4 + r.next() * 3, 10, 5, PI / 2), Kit.mat(hill), {"p": [0, -0.4, -22 - r.next() * 4], "s": [1.6, 0.35 + r.next() * 0.25, 1], "shadow": false})
		far.add(h, i * 7 + r.next() * 3)
	_add_layer(far)
	if props.has("sea-walls"):
		# Kriat Yam Suf: as águas em pé dos dois lados do caminho.
		for z in [-3.2, 3.6]:
			_env_root.add_child(Kit.mesh(Geo.box(40, 4.5 if z < 0 else 1.2, 1.4), Kit.mat(C.water, {"opacity": 0.9 if z < 0 else 0.6}), {"p": [0, 2.1 if z < 0 else 0.5, z], "shadow": false}))
			_env_root.add_child(Kit.mesh(Geo.box(40, 0.18, 1.45), Kit.mat(C.waterLight), {"p": [0, 4.4 if z < 0 else 1.15, z], "shadow": false}))
	var mid := _Wrap.new(26, 0.55)
	var mid_kinds: Array = MID_DECOR.get(ground, [])
	for i in (7 if not mid_kinds.is_empty() else 0):
		var o := Nature.decor(mid_kinds[i % mid_kinds.size()], seed + 10 + i)
		o.position = Vector3(0, -0.1, -4 - r.next() * 3)
		o.scale = Vector3.ONE * (1 + r.next() * 0.4)
		mid.add(o, i * (26.0 / 7.0) + r.next() * 1.5)
	_add_layer(mid)
	# Chão: a faixa do diorama, com a terra à mostra na frente.
	var g: Array = GROUND.get(ground, GROUND.grass)
	var top := Kit.mesh(Geo.box(60, 0.5, 9), Kit.mat(g[0]), {"p": [0, -0.25, -1.8], "shadow": false})
	_env_root.add_child(top)
	_env_root.add_child(Kit.mesh(Geo.box(60, 1.6, 0.6), Kit.mat(g[1]), {"p": [0, -1.05, 2.4], "shadow": false}))
	var near := _Wrap.new(16, 1.0)
	for i in 14:
		var speck := Kit.mesh(Geo.box(0.5 + r.next() * 0.6, 0.02, 0.18 + r.next() * 0.2), Kit.mat(g[2]), {"p": [0, 0.011, -0.6 + r.next() * 2.6], "shadow": false})
		near.add(speck, i * (16.0 / 14.0) + r.next() * 0.6)
	var near_kinds: Array = NEAR_DECOR.get(ground, [])
	for i in near_kinds.size():
		var o := Nature.decor(near_kinds[i], seed + 30 + i)
		o.position = Vector3(0, 0, 1.2 + r.next() * 0.8)
		o.scale = Vector3.ONE * 0.7
		near.add(o, i * (16.0 / maxi(1, near_kinds.size())) + 2)
	if ground == "water":
		for i in 10:
			near.add(Kit.mesh(Geo.box(0.6, 0.03, 0.08), Kit.mat("#E8F6FF"), {"p": [0, 0.02, -0.8 + r.next() * 2.6], "shadow": false}), i * 1.6)
	_add_layer(near)
	_update_layers()


func _add_layer(w: _Wrap) -> void:
	_layers.append(w)
	_env_root.add_child(w.root)


func _update_layers() -> void:
	for l in _layers:
		(l as _Wrap).update(scroll)


## Céu em degradê: um plano grande com cores por vértice.
static func _sky_backdrop(stops: Array, width: float, height: float) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rows := stops.size() - 1
	for i in rows:
		var y0 := -height / 2 + height * float(rows - i - 1) / rows
		var y1 := -height / 2 + height * float(rows - i) / rows
		var c_top := Color(stops[i])
		var c_bottom := Color(stops[i + 1])
		var quad := [[Vector3(-width / 2, y0, 0), c_bottom], [Vector3(width / 2, y0, 0), c_bottom], [Vector3(width / 2, y1, 0), c_top], [Vector3(-width / 2, y1, 0), c_top]]
		for k in [0, 2, 1, 0, 3, 2]:
			st.set_color(quad[k][1])
			st.add_vertex(quad[k][0])
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.vertex_color_use_as_albedo = true
	m.vertex_color_is_srgb = true
	m.disable_fog = true
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


## Põe um obstáculo (ou nenhum) na posição x.
func show_obstacle(id: String, x: float) -> void:
	if obstacle:
		obstacle.queue_free()
	obstacle = Story.obstacle(id) if id != "" else null
	if obstacle:
		obstacle.position = Vector3(x, 0, 0)
		add_child(obstacle)


func show_goal(model: Dictionary, x: float) -> void:
	if goal:
		goal.queue_free()
	goal = Story.goal(model)
	goal.position = Vector3(x, 0, -0.4)
	if model.kind == "beitMidrash":
		goal.scale = Vector3.ONE * 0.7
		goal.position.z = -1.4
	add_child(goal)


# --- Animações (as do diretor de cena do app) --------------------------------------------


## O obstáculo entra pela direita e para na frente do Golem; o cenário anda junto.
func approach(id: String) -> void:
	show_obstacle(id, SPAWN_X)
	golem.pose_name = "walk"
	var tw := create_tween().set_parallel(true)
	tw.tween_property(obstacle, "position:x", STOP_X, 1.1)
	tw.tween_method(_set_scroll, scroll, scroll + (SPAWN_X - STOP_X), 1.1)
	await tw.finished
	golem.pose_name = "idle"


func jump_over() -> void:
	Sfx.play("jump", 0.8)
	golem.pose_name = "jump"
	var tw := create_tween()
	tw.tween_property(golem, "position:y", 1.9, 0.28).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(golem, "position:y", 0.0, 0.32).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	var tw2 := create_tween().set_parallel(true)
	if obstacle:
		tw2.tween_property(obstacle, "position:x", PASS_X, 0.6)
	tw2.tween_method(_set_scroll, scroll, scroll + (STOP_X - PASS_X), 0.6)
	await tw.finished
	golem.pose_name = "idle"


## Tropeça; perdeu um coração, o Golem pisca três vezes.
func stumble(hurt: bool) -> void:
	Sfx.play("bump", 0.8)
	golem.pose_name = "hurt"
	var tw := create_tween()
	tw.tween_property(golem, "position:x", GOLEM_X + 0.35, 0.11).set_ease(Tween.EASE_OUT)
	tw.tween_property(golem, "position:x", GOLEM_X - 0.45, 0.16)
	tw.tween_property(golem, "position:x", GOLEM_X, 0.2).set_ease(Tween.EASE_OUT)
	if hurt:
		var blink := create_tween()
		for i in 6:
			blink.tween_callback(func(): golem.visible = i % 2 == 1).set_delay(0.09)
		blink.tween_callback(func(): golem.visible = true)
	await get_tree().create_timer(0.62).timeout
	golem.pose_name = "idle"


## A chegada entra e para logo depois do Golem; ele comemora.
func reach_goal(model: Dictionary) -> void:
	if obstacle:
		obstacle.queue_free()
		obstacle = null
	show_goal(model, SPAWN_X)
	golem.pose_name = "walk"
	var tw := create_tween().set_parallel(true)
	tw.tween_property(goal, "position:x", GOAL_X + 1.6, 1.3)
	tw.tween_method(_set_scroll, scroll, scroll + (SPAWN_X - GOAL_X), 1.3)
	await tw.finished
	golem.pose_name = "cheer"
	Sfx.play("clear", 0.8)


func _set_scroll(v: float) -> void:
	scroll = v
	_update_layers()


func _process(dt: float) -> void:
	_t += dt
	# A câmera sobe um pouco junto com o pulo.
	if golem:
		camera.position.y = 2.15 + golem.position.y * 0.4
	# As chamas tremulam.
	if obstacle:
		for f in obstacle.find_children("flame", "", true, false):
			(f as Node3D).scale = Vector3(1, 1.0 + 0.08 * sin(_t * 14.0 + (f as Node3D).position.x * 5.0), 1)


## Faixa de objetos que andam com a rolagem e voltam pelo outro lado.
class _Wrap:
	var root := Node3D.new()
	var items: Array = []
	var period := 1.0
	var parallax := 1.0

	func _init(p: float, px: float) -> void:
		period = p
		parallax = px

	func add(o: Node3D, base: float) -> void:
		items.append([o, base])
		root.add_child(o)

	func update(scroll: float) -> void:
		var shift := scroll * parallax
		var half := period / 2.0
		for it in items:
			(it[0] as Node3D).position.x = fposmod(float(it[1]) - shift, period) - half
