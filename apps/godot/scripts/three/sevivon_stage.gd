## A cena do sevivon: mesa, luzes, câmera e o giro (porte de components/Sevivon.tsx).
##
## Parado, o sevivon paira de pé girando devagar. Ao girar, cai na mesa rodando, bambeia,
## tomba e balança até parar com a face sorteada para cima; a câmera chega perto e a face
## brilha. O resultado vem sempre do servidor: a tela chama spin_to(sliceIndex).
##
## Luz de estúdio: os reflexos do ouro e do verniz vêm de um panorama gerado aqui mesmo
## (duas caixas de luz quentes e um contraluz de tekhelet), como numa foto de produto.
class_name SevivonStage
extends Node3D

signal landed(face: int)

enum Mode { IDLE, SPIN, LANDED }

const CAM_IDLE_POS := Vector3(0, 2.45, 5.9)
const CAM_IDLE_LOOK := Vector3(0, 0.82, 0)
const CAM_FACE_POS := Vector3(0, 3.7, 2.7)
static var CAM_FACE_LOOK := Vector3(0, SevivonMath.INNER_RADIUS * 2.0 - 0.1, -0.15)

var reduced_motion := false
## Noite de Chanucá (1 a 8): a chanukiá aparece acesa atrás do sevivon. Definir antes de
## entrar na árvore.
var hanukkah_night := 0
## Desloca o quadro na vertical (metros): positivo desce a mesa na tela.
var frame_shift := 0.0:
	set(v):
		frame_shift = v
		if camera:
			camera.v_offset = v

var camera: Camera3D
var _rig: Dictionary
var _mode := Mode.IDLE
var _since := 0.0
var _idle_yaw := 0.0
var _plan: Dictionary = {}
var _face := 0
var _last_face := -1
var _landed_at := -1.0
var _zoom := 0.0


func _ready() -> void:
	_build_environment()
	add_child(SevivonModel.build_table())
	# ?hanukkah=n força uma noite (para conferir o visual fora da festa).
	var forced := Main.query("hanukkah")
	if forced != "":
		hanukkah_night = clampi(forced.to_int(), 0, 8)
	if hanukkah_night > 0:
		var c := Hanukkah.build(hanukkah_night)
		# Atrás e um pouco ao lado: com a câmera deste cliente, bem atrás ela some atrás do sevivon.
		c.position = Vector3(1.2, 0, -0.85)
		c.rotation.y = -0.55
		c.scale = Vector3.ONE * 0.95
		add_child(c)
	_rig = SevivonModel.build()
	add_child(_rig.root)
	_since = _now()
	_apply(SevivonMath.idle_pose(0.0, 0.0))


static func _now() -> float:
	return Time.get_ticks_msec()


func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Ui.NIGHT
	var sky := Sky.new()
	var pano := PanoramaSkyMaterial.new()
	pano.panorama = _studio_panorama()
	sky.sky_material = pano
	sky.radiance_size = Sky.RADIANCE_SIZE_128
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.35
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.0
	env.tonemap_white = 6.0
	env.glow_enabled = true
	env.glow_intensity = 0.55
	env.glow_strength = 1.0
	env.glow_bloom = 0.0
	env.glow_hdr_threshold = 1.1
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	camera = Camera3D.new()
	camera.keep_aspect = Camera3D.KEEP_WIDTH
	camera.fov = 34.0
	camera.near = 0.1
	camera.far = 60.0
	camera.position = CAM_IDLE_POS
	camera.v_offset = frame_shift
	add_child(camera)
	camera.look_at(CAM_IDLE_LOOK)
	# Fundo preso à câmera: halo suave atrás do sevivon.
	var back := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(70, 70)
	back.mesh = quad
	var bm := ShaderMaterial.new()
	bm.shader = preload("res://shaders/backdrop.gdshader")
	back.material_override = bm
	back.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	back.position = Vector3(0, -1.2, -16)
	camera.add_child(back)

	# Luz quente de cima, num cone estreito: uma poça de luz no feltro.
	var spot := SpotLight3D.new()
	spot.light_color = Color("#FFE1AE")
	spot.light_energy = 4.8
	spot.spot_range = 12.0
	spot.spot_angle = 17.0
	spot.spot_angle_attenuation = 0.9
	spot.spot_attenuation = 0.6
	spot.shadow_enabled = true
	spot.shadow_blur = 2.0
	spot.shadow_bias = 0.08
	spot.shadow_normal_bias = 2.0
	add_child(spot)
	spot.position = Vector3(0.3, 6.4, 2.4)
	spot.look_at(Vector3(0, 0.3, 0))
	# Contraluz de tekhelet: o contorno do sevivon não some no fundo escuro.
	var rim := DirectionalLight3D.new()
	rim.light_color = Color("#8E9BFF")
	rim.light_energy = 1.1
	add_child(rim)
	rim.position = Vector3(-3, 3.5, -4.5)
	rim.look_at(Vector3.ZERO)
	# Preenchimento quente e fraco, de frente.
	var fill := OmniLight3D.new()
	fill.light_color = Color("#FFD9A8")
	fill.light_energy = 0.6
	fill.omni_range = 9.0
	add_child(fill)
	fill.position = Vector3(2.2, 2.0, 4.0)


## Panorama do estúdio (HDR): noite azul, duas caixas de luz quentes e um contraluz frio.
func _studio_panorama() -> ImageTexture:
	var w := 256
	var h := 128
	var img := Image.create(w, h, false, Image.FORMAT_RGBH)
	var warm := Color("#FFE1AE")
	var cold := Color("#8E9BFF")
	for y in h:
		var lat := (0.5 - (y + 0.5) / h) * PI
		var base := Ui.NIGHT.lerp(Color("#2A3478"), clampf(sin(lat) * 0.5 + 0.5, 0, 1) * 0.6) * 0.5
		for x in w:
			var lon := ((x + 0.5) / w) * TAU - PI
			var c := base
			# Faixa quente em volta, perto do horizonte: é o que o ouro e o verniz das faces refletem.
			c += warm * 1.4 * (1.0 - smoothstep(0.0, 0.5, absf(lat - 0.18)))
			# Caixa de luz grande, alta.
			c += warm * 3.5 * _softbox(lat, lon, deg_to_rad(62), deg_to_rad(0), deg_to_rad(40), deg_to_rad(24))
			# Tira estreita à direita (o brilho comprido no verniz).
			c += warm * 3.0 * _softbox(lat, lon, deg_to_rad(18), deg_to_rad(75), deg_to_rad(6), deg_to_rad(30))
			# Contraluz frio atrás, à esquerda.
			c += cold * 2.2 * _softbox(lat, lon, deg_to_rad(20), deg_to_rad(-140), deg_to_rad(16), deg_to_rad(10))
			img.set_pixel(x, y, Color(c.r, c.g, c.b, 1.0))
	return ImageTexture.create_from_image(img)


static func _softbox(lat: float, lon: float, lat0: float, lon0: float, half_lon: float, half_lat: float) -> float:
	var dl := wrapf(lon - lon0, -PI, PI) / half_lon
	var da := (lat - lat0) / half_lat
	var d := maxf(absf(dl), absf(da))
	return 1.0 - smoothstep(0.75, 1.05, d)


# --- Comandos ---------------------------------------------------------------------------


## Gira até cair com a face `index` (posição em WHEEL_SLICES) para cima; volta quando para.
func spin_to(index: int) -> void:
	var from := _idle_yaw
	if _mode == Mode.IDLE:
		from = SevivonMath.idle_pose(_now() - _since, _idle_yaw).yaw
	elif _mode == Mode.LANDED:
		from = SevivonMath.resting_pose(_face).yaw
	_plan = SevivonMath.plan_spin(index, from, reduced_motion, randf())
	# O som sai junto com a animação: a ponta bate na mesa aos hopMs, como no arquivo.
	if not reduced_motion:
		Sfx.play("spin", 0.9)
	_mode = Mode.SPIN
	_since = _now()
	_landed_at = -1.0
	await landed


## Deitado com a face para cima, sem animação (ao reabrir uma partida já girada).
func jump_to(index: int) -> void:
	_mode = Mode.LANDED
	_face = index
	_since = _now()


## Volta a pairar de pé, pronto para o próximo giro.
func rest() -> void:
	if _mode == Mode.IDLE:
		return
	_idle_yaw = SevivonMath.resting_pose(_face).yaw if _mode == Mode.LANDED else 0.0
	_mode = Mode.IDLE
	_since = _now()


func is_spinning() -> bool:
	return _mode == Mode.SPIN


# --- Quadro a quadro --------------------------------------------------------------------


func _process(dt: float) -> void:
	var t := _now()
	var pose: Dictionary
	var to_face := 0.0
	match _mode:
		Mode.IDLE:
			pose = SevivonMath.idle_pose(0.0 if reduced_motion else t - _since, _idle_yaw)
		Mode.SPIN:
			var elapsed := t - _since
			var total := SevivonMath.duration(_plan)
			pose = SevivonMath.pose_at(_plan, minf(elapsed, total))
			# Depois que o arquivo do giro some, um tique a cada face que passa na frente,
			# mais forte conforme ele bambeia.
			var face := floori((pose.yaw + SevivonMath.FACE_ANGLE / 2.0) / SevivonMath.FACE_ANGLE)
			var fall_end: float = _plan.hopMs + _plan.spinMs + _plan.fallMs
			if face != _last_face:
				if elapsed >= SevivonMath.ticks_from(_plan) and elapsed < fall_end:
					var sway := minf(1.0, pose.tilt / _plan.wobble) if _plan.wobble > 0.0 else 0.0
					Sfx.play("tick", 0.26 + 0.2 * sway)
				_last_face = face
			if elapsed >= fall_end and _landed_at < 0.0:
				_landed_at = t
				Sfx.play("topple", 0.85)
			to_face = 1.0 if elapsed > fall_end - 150.0 else 0.0
			if elapsed >= total:
				_mode = Mode.LANDED
				_face = _plan.face
				_since = t
				landed.emit(_face)
		Mode.LANDED:
			pose = SevivonMath.resting_pose(_face)
			to_face = 1.0
	_apply(pose)

	# A face sorteada brilha (pulsando de leve) enquanto o sevivon está deitado nela.
	var lit := _face if _mode == Mode.LANDED else -1
	var panels: Array = _rig.panels
	for i in panels.size():
		var m: StandardMaterial3D = panels[i]
		m.emission_energy_multiplier = (0.22 + 0.12 * sin((t - _since) / 160.0)) if i == lit else 0.06

	# Câmera: de frente para a mesa; perto da face de cima quando ele para.
	_zoom = to_face if reduced_motion else _zoom + (to_face - _zoom) * minf(1.0, dt * 4.5)
	var k := _zoom * _zoom * (3.0 - 2.0 * _zoom)
	camera.position = CAM_IDLE_POS.lerp(CAM_FACE_POS, k)
	camera.look_at(CAM_IDLE_LOOK.lerp(CAM_FACE_LOOK, k))


func _apply(pose: Dictionary) -> void:
	var q := SevivonMath.orientation(pose)
	var root: Node3D = _rig.root
	root.quaternion = q
	root.position = Vector3(0, SevivonMath.rest_height(q) + pose.lift, 0)
