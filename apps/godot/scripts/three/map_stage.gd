## A cena 3D do mapa do Golem World (porte de components/journey/Map3D.tsx): as ilhas dos
## livros abertos (e a primeira fechada), as pedras das fases, o caminho e o Golem andando.
## A câmera ortográfica, inclinada 42°, desce e sobe com a rolagem da tela.
class_name MapStage
extends Node3D

const PROLOGUE_H := 100.0
const WORLD_GAP := 24.0
const SIN := 0.6691306
const COS := 0.7431448

## [{world: Dictionary, top: float}] na ordem do mapa.
var placed: Array = []
var total_height := 0.0
var camera := Camera3D.new()
var golem: Golem
var sun := DirectionalLight3D.new()
var _target_z := 0.0
var _pieces := Node3D.new()
var _facing := {"x": NAN, "z": 0.0, "heading": 0.0}
var _walking := false
var _rings: Array[Node3D] = []
## Cenas animadas entre as fases (só as dos mundos abertos) e a Criação no topo.
var _vignettes: Array[Node3D] = []
var creation: Vignettes.Creation
var still := false
var _t := 0.0


## statuses: JourneyState.worlds (da API).
func setup(statuses: Array, look: Dictionary) -> void:
	var top := PROLOGUE_H
	var shown_locked := false
	for w in JourneyData.worlds():
		var st := _status_of(statuses, str(w.id))
		if st.is_empty():
			continue
		if not bool(st.unlocked):
			if shown_locked:
				break
			shown_locked = true
		placed.append({"world": w, "top": top, "status": st})
		top += float(w.layout.height) + WORLD_GAP
	total_height = top - WORLD_GAP if not placed.is_empty() else 0.0
	_build_environment()
	add_child(WorldMap.sea(total_height * 0.1))
	for p in placed:
		add_child(WorldMap.island(p.world, p.top))
	add_child(_pieces)
	refresh_pieces(statuses)
	creation = Vignettes.Creation.new()
	creation.position = WorldMap.to_world(60, PROLOGUE_H / 2.0 - 4.0)
	add_child(creation)
	for p in placed:
		if not bool(p.status.unlocked):
			continue
		for v in p.world.layout.vignettes:
			var g := Vignettes.vignette(str(v.parashaId))
			if g == null:
				continue
			g.position = WorldMap.to_world(float(v.x), float(p.top) + float(v.y))
			# De frente para a câmera, com um leve giro para o lado do caminho.
			g.rotation.y = 0.25 if float(v.x) < 60 else -0.25
			add_child(g)
			_vignettes.append(g)
	golem = Golem.build(look)
	golem.scale = Vector3.ONE * 0.72
	add_child(golem)


static func _status_of(statuses: Array, book: String) -> Dictionary:
	for s in statuses:
		if s.book == book:
			return s
	return {}


## look: locked | open | done, conforme o estado da fase.
static func node_look(st: Dictionary, n: Dictionary) -> String:
	if st.is_empty():
		return "locked"
	var main: Dictionary = {}
	if n.kind == "beitMidrash":
		main = st.beitMidrash
	else:
		for p in st.parashot:
			if p.main.nodeId == n.id:
				main = p.main
	var state := str(main.get("state", "locked"))
	return "done" if state == "completed" else ("open" if state == "open" else "locked")


## Pedras das fases e pedrinhas do caminho, conforme os estados de agora.
func refresh_pieces(statuses: Array) -> void:
	for c in _pieces.get_children():
		c.queue_free()
	_rings.clear()
	for p in placed:
		var st := _status_of(statuses, str(p.world.id))
		p.status = st
		var layout: Dictionary = p.world.layout
		var nodes: Array = layout.nodes
		for i in nodes.size():
			var n: Dictionary = nodes[i]
			var look := node_look(st, n)
			var pos := WorldMap.to_world(float(n.x), p.top + float(n.y))
			var stone := WorldMap.node_stone(look)
			if n.kind == "beitMidrash":
				var b := WorldMap.beit_midrash(str(p.world.beitMidrash.style))
				b.scale = Vector3.ONE * 0.62
				b.position = pos
				_pieces.add_child(b)
				stone.position = Vector3(pos.x, 0, pos.z + 1.6)
				stone.scale = Vector3.ONE * 0.8
			else:
				stone.position = pos
			_pieces.add_child(stone)
			if look == "open":
				_rings.append(stone)
			# Pedrinhas até a próxima fase, depois que esta foi concluída.
			if look == "done" and i < (layout.dots as Array).size():
				_pieces.add_child(WorldMap.path_stones(layout.dots[i], p.top, i + int(p.top)))


func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#3E8EDB")
	# Luz de céu em hemisfério (claro em cima, terra embaixo), como no app.
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#DCEBFF").lerp(Color("#8E7A5C"), 0.3)
	env.ambient_light_energy = 0.4
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	# Tom linear com a saturação um pouco abaixo: o mesmo aspecto do ACES do three.js no app
	# (o ACES do Godot satura em vez de dessaturar).
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.tonemap_exposure = 1.05
	env.adjustment_enabled = true
	env.adjustment_saturation = 0.78
	env.adjustment_brightness = 1.0
	env.adjustment_contrast = 0.96
	# Sem brilho (glow): no renderizador da web ele clareia a cena inteira.
	env.glow_enabled = false
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun.light_color = Color("#FFF1D6")
	sun.light_energy = 0.7
	sun.shadow_enabled = true
	sun.shadow_blur = 1.5
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 70.0
	add_child(sun)
	sun.position = Vector3(4, 8, 6)
	sun.look_at(Vector3.ZERO)
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.keep_aspect = Camera3D.KEEP_WIDTH
	camera.size = WorldMap.MAP_SPAN + 3.4
	camera.near = 1.0
	camera.far = 140.0
	add_child(camera)
	set_scroll_z(0.0)


# --- Câmera ------------------------------------------------------------------------------


## Mira o ponto do chão (z) que fica no meio da tela.
func set_scroll_z(z: float) -> void:
	_target_z = clampf(z, min_z(), max_z())
	camera.position = Vector3(0, SIN * 40.0, _target_z + COS * 40.0)
	camera.look_at(Vector3(0, 0, _target_z))


func scroll_z() -> float:
	return _target_z


func min_z() -> float:
	return (PROLOGUE_H - 30.0) * WorldMap.MAP_UNIT


func max_z() -> float:
	return total_height * WorldMap.MAP_UNIT + 1.0


## Quantos pixels da tela correspondem a uma unidade do mundo.
func pixels_per_unit(view_width: float) -> float:
	return view_width / camera.size


# --- Golem ------------------------------------------------------------------------------


func place_golem(pos: Vector3) -> void:
	golem.position = Vector3(pos.x, 0.38, pos.z)
	_facing = {"x": pos.x, "z": pos.z, "heading": 0.0}
	golem.rotation.y = 0.0


## Anda pelos pontos (no mundo) até o último; um passinho de som a cada dois pontos.
func walk(points: Array) -> void:
	if points.size() < 2:
		return
	_walking = true
	golem.pose_name = "walk"
	var step := minf(0.11, 2.6 / points.size())
	var tw := create_tween()
	for i in range(1, points.size()):
		var p: Vector3 = points[i]
		tw.tween_property(golem, "position", Vector3(p.x, 0.38, p.z), step)
		if i % 2 == 0:
			tw.tween_callback(func(): Sfx.play("dot", 0.35))
	await tw.finished
	golem.pose_name = "idle"
	_walking = false


func _process(dt: float) -> void:
	_t += dt
	if golem == null:
		return
	# Para onde o Golem olha: na direção em que anda; parado, de frente para a câmera.
	var x := golem.position.x
	var z := golem.position.z
	var dx: float = 0.0 if is_nan(float(_facing.x)) else x - float(_facing.x)
	var dz: float = z - float(_facing.z)
	var target: float = atan2(dx, dz) if Vector2(dx, dz).length() > 1e-4 else (float(_facing.heading) if _walking else 0.0)
	var diff := wrapf(target - float(_facing.heading), -PI, PI)
	_facing.heading = float(_facing.heading) + diff * minf(1.0, dt * 15.0)
	_facing.x = x
	_facing.z = z
	golem.rotation.y = _facing.heading
	# Só o que está na tela se anima (e aparece).
	for g in _vignettes:
		var on := absf(g.position.z - _target_z) < 15.0
		g.visible = on
		if on and not still:
			Vignettes.animate(g.get_meta("scene"), _t)
	creation.visible = absf(creation.position.z - _target_z) < 16.0
	creation.still = still
	# As fases abertas pulsam de leve (o anel dourado).
	var k := 1.0 + 0.06 * sin(_t * 4.0)
	for s in _rings:
		if is_instance_valid(s):
			s.scale = Vector3(k, 1.0, k)
