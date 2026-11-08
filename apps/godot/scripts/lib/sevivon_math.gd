## Movimento do sevivon: porte direto de apps/mobile/src/lib/sevivon.ts (mesmas contas e
## mesmos tempos). O servidor sorteia a face; o cliente só calcula um giro que termina com
## ela virada para cima. tests/test_sevivon.gd confere os números com os do TypeScript.
##
## Eixos (iguais aos do three.js): Y para cima, câmera em +Z olhando o centro.
## - A face k tem a normal em (sen φk, 0, cos φk), φk = k·45°.
## - Pose Q = Inclinação(θ, β) · Giro(ψ). Caído (θ = 90°, β = 0), a face k fica para cima
##   quando ψ ≡ −φk.
## Etapas: cai da mão na mesa (hop), gira em pé bambeando (spin), tomba (fall) e balança
## deitado até parar (settle).
class_name SevivonMath

const FACE_COUNT := 8
const FACE_ANGLE := TAU / FACE_COUNT
const RADIUS := 0.7
const BODY := 0.82
const POINT := 0.5
const SHOULDER := 0.12
const HANDLE := 0.42
const HANDLE_RADIUS := 0.075
const KNOB_RADIUS := 0.11
## Raio até o meio das faces.
static var INNER_RADIUS := RADIUS * cos(PI / FACE_COUNT)
const HOVER := 0.32
## O arquivo spin.wav: dura 1450 ms e some a partir de 1130 ms.
const SPIN_SOUND_MS := 1450.0
const SPIN_SOUND_FADE_MS := 1130.0


static func modf(value: float, m: float) -> float:
	return fposmod(value, m)


static func yaw_for_face(face: int) -> float:
	return fposmod(-face * FACE_ANGLE, TAU)


static func face_up(yaw: float) -> int:
	return posmod(roundi(-yaw / FACE_ANGLE), FACE_COUNT)


## Plano do giro: {face, startYaw, endYaw, hopMs, spinMs, fallMs, settleMs, wobble, precession}.
static func plan_spin(face: int, start_yaw: float, reduced_motion := false, jitter := 0.5) -> Dictionary:
	var target := yaw_for_face(face)
	var turns := 1 if reduced_motion else 3 + roundi(jitter * 2.0)
	var end_yaw := start_yaw + fposmod(target - start_yaw, TAU) + turns * TAU
	if reduced_motion:
		return {"face": face, "startYaw": start_yaw, "endYaw": end_yaw, "hopMs": 0.0, "spinMs": 450.0, "fallMs": 300.0, "settleMs": 150.0, "wobble": 0.0, "precession": 0.0}
	return {
		"face": face, "startYaw": start_yaw, "endYaw": end_yaw,
		"hopMs": 260.0, "spinMs": 2300.0 + roundf(jitter * 500.0), "fallMs": 520.0, "settleMs": 620.0,
		"wobble": deg_to_rad(13.0), "precession": 2.0,
	}


## A partir de quando a tela toca um tique por face (antes disso, o arquivo spin.wav cobre).
static func ticks_from(plan: Dictionary) -> float:
	return 0.0 if plan.hopMs == 0.0 else plan.hopMs + plan.spinMs * 0.4


static func duration(plan: Dictionary) -> float:
	return plan.hopMs + plan.spinMs + plan.fallMs + plan.settleMs


static func _smooth(a: float, b: float, x: float) -> float:
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


## Pose {yaw, tilt, azimuth, lift} em `ms` desde o início do giro.
static func pose_at(plan: Dictionary, ms: float) -> Dictionary:
	var hop: float = plan.hopMs
	var spin: float = plan.spinMs
	var fall: float = plan.fallMs
	var settle: float = plan.settleMs
	var rolling := spin + fall
	var t := ms - hop
	var lift := 0.0
	if ms < hop:
		var u := ms / hop
		lift = HOVER * (1.0 - u * u)
	elif t < 220.0 and hop > 0.0:
		lift = 0.05 * sin((t / 220.0) * PI)
	var p := 1.6
	var span: float = plan.endYaw - plan.startYaw
	var ur := minf(1.0, ms / (hop + rolling))
	var yaw: float = plan.startYaw + span * (1.0 - pow(1.0 - ur, p + 1.0))
	if t <= 0.0:
		return {"yaw": yaw, "tilt": 0.0, "azimuth": 0.0, "lift": lift}
	var tilt: float
	var azimuth: float
	if t < spin:
		var u := t / spin
		tilt = plan.wobble * pow(_smooth(0.25, 1.0, u), 1.4)
		azimuth = TAU * plan.precession * u * u
	elif t < rolling:
		var u := (t - spin) / fall
		tilt = plan.wobble + (PI / 2.0 - plan.wobble) * u * u
		azimuth = 0.0
	else:
		var u := minf(1.0, (t - rolling) / maxf(1.0, settle))
		var on := 1.0 if settle > 200.0 else 0.0
		yaw = plan.endYaw + 0.16 * exp(-4.5 * u) * sin(u * PI * 3.2) * on
		tilt = PI / 2.0
		azimuth = 0.0
		lift = 0.04 * exp(-6.0 * u) * absf(sin(u * PI * 2.4)) * on
	return {"yaw": yaw, "tilt": tilt, "azimuth": azimuth, "lift": lift}


static func orientation(pose: Dictionary) -> Quaternion:
	var axis := Vector3(cos(pose.azimuth), 0.0, sin(pose.azimuth))
	var q_tilt := Quaternion(axis, -pose.tilt)
	var q_yaw := Quaternion(Vector3.UP, pose.yaw)
	return q_tilt * q_yaw


static var _hull: PackedVector3Array = []


static func _hull_points() -> PackedVector3Array:
	if _hull.is_empty():
		_hull.append(Vector3(0, -BODY / 2.0 - POINT, 0))
		for i in FACE_COUNT:
			var a := (i + 0.5) * FACE_ANGLE
			_hull.append(Vector3(RADIUS * sin(a), BODY / 2.0, RADIUS * cos(a)))
			_hull.append(Vector3(RADIUS * sin(a), -BODY / 2.0, RADIUS * cos(a)))
			_hull.append(Vector3(HANDLE_RADIUS * sin(a), BODY / 2.0 + SHOULDER + HANDLE, HANDLE_RADIUS * cos(a)))
	return _hull


## Quanto subir o centro do corpo para o ponto mais baixo encostar na mesa (y = 0).
static func rest_height(q: Quaternion) -> float:
	var lowest := INF
	for p in _hull_points():
		lowest = minf(lowest, (q * p).y)
	return -lowest


static func face_normal(face: int, q: Quaternion) -> Vector3:
	var a := face * FACE_ANGLE
	return q * Vector3(sin(a), 0, cos(a))


## Parado, pairando de pé: gira devagar mostrando as faces.
static func idle_pose(ms: float, start_yaw := 0.0) -> Dictionary:
	return {"yaw": start_yaw + ms * 0.0006, "tilt": 0.0, "azimuth": 0.0, "lift": HOVER + 0.03 * sin(ms * 0.0021)}


static func resting_pose(face: int) -> Dictionary:
	return {"yaw": yaw_for_face(face), "tilt": PI / 2.0, "azimuth": 0.0, "lift": 0.0}
