## Testes do cliente Godot (sem janela): conferem que as contas portadas do app dão os
## mesmos números. Uso: godot --headless --path apps/godot --script res://tests/run_tests.gd
extends SceneTree

var _fails := 0
var _checks := 0


func _init() -> void:
	_test_sevivon()
	_test_helpers()
	_test_puzzle()
	_test_hanukkah()
	print("%d verificações, %d falhas" % [_checks, _fails])
	quit(1 if _fails > 0 else 0)


func _near(a: float, b: float, tol: float, what: String) -> void:
	_checks += 1
	if absf(a - b) > tol:
		_fails += 1
		printerr("FALHOU %s: %s != %s" % [what, a, b])


func _ok(cond: bool, what: String) -> void:
	_checks += 1
	if not cond:
		_fails += 1
		printerr("FALHOU " + what)


## As mesmas noites de lib/hanukkah.ts (a véspera de 2026 é 4 de dezembro; acende às 17h).
func _test_hanukkah() -> void:
	var at := func(s: String) -> float: return Time.get_unix_time_from_datetime_string(s)
	_ok(Hanukkah.night(at.call("2026-12-04T16:59:00")) == 0, "chanucá: antes de acender, nada")
	_ok(Hanukkah.night(at.call("2026-12-04T17:00:00")) == 1, "chanucá: 1ª noite às 17h da véspera")
	_ok(Hanukkah.night(at.call("2026-12-05T16:00:00")) == 1, "chanucá: a 1ª noite vai até as 17h")
	_ok(Hanukkah.night(at.call("2026-12-11T20:00:00")) == 8, "chanucá: 8ª noite")
	_ok(Hanukkah.night(at.call("2026-12-12T17:00:00")) == 0, "chanucá: acabou")
	_ok(Hanukkah.night(at.call("2026-11-05T12:00:00")) == 0, "chanucá: novembro")
	_ok(Hanukkah.night(at.call("2027-12-24T18:00:00")) == 1, "chanucá: 2027")


func _test_sevivon() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/sevivon_vectors.json"))
	for c in data.cases:
		var plan := SevivonMath.plan_spin(int(c.face), float(c.start), bool(c.reducedMotion), float(c.jitter))
		var tag := "face %d" % int(c.face)
		for k in ["endYaw", "hopMs", "spinMs", "fallMs", "settleMs", "wobble", "precession"]:
			_near(float(plan[k]), float(c.plan[k]), 1e-9, "%s plano.%s" % [tag, k])
		_near(SevivonMath.ticks_from(plan), float(c.ticksFrom), 1e-9, tag + " ticksFrom")
		_near(SevivonMath.duration(plan), float(c.total), 1e-9, tag + " duração")
		for s in c.samples:
			var pose := SevivonMath.pose_at(plan, float(s.ms))
			for k in ["yaw", "tilt", "azimuth", "lift"]:
				_near(float(pose[k]), float(s.pose[k]), 1e-6, "%s pose(%s).%s" % [tag, s.ms, k])
			var q := SevivonMath.orientation(pose)
			var ref := Quaternion(float(s.q[0]), float(s.q[1]), float(s.q[2]), float(s.q[3]))
			# q e −q são a mesma rotação.
			_near(absf(q.dot(ref)), 1.0, 1e-6, "%s orientação(%s)" % [tag, s.ms])
			_near(SevivonMath.rest_height(q), float(s.rest), 1e-6, "%s altura(%s)" % [tag, s.ms])
		# No fim do giro, a face sorteada aponta para cima.
		var end := SevivonMath.orientation(SevivonMath.pose_at(plan, SevivonMath.duration(plan)))
		var up := SevivonMath.face_normal(int(c.face), end)
		_near(up.y, float(c.up[1]), 1e-6, tag + " normal da face")
		_ok(up.y > 0.999, tag + " fica para cima")
	for s in data.idle:
		var pose := SevivonMath.idle_pose(float(s.ms), 0.3)
		_near(float(pose.yaw), float(s.pose.yaw), 1e-9, "parado yaw")
		_near(float(pose.lift), float(s.pose.lift), 1e-9, "parado altura")
	for f in SevivonMath.FACE_COUNT:
		_ok(SevivonMath.face_up(SevivonMath.yaw_for_face(f)) == f, "face_up(yaw_for_face(%d))" % f)


func _test_helpers() -> void:
	_near(Util.iso_ms("1970-01-01T00:00:01.250Z"), 1250.0, 1e-6, "iso_ms com milissegundos")
	_near(Util.iso_ms("2026-11-04T20:00:00+02:00") - Util.iso_ms("2026-11-04T18:00:00Z"), 0.0, 1e-6, "iso_ms com fuso")
	_ok(Util.fill("Rodada {n} de {max}", {"n": 2, "max": 25}) == "Rodada 2 de 25", "fill")
	_ok(Util.locale_from_tag("iw_IL") == "he" and Util.locale_from_tag("en-US") == "en" and Util.locale_from_tag("fr") == "pt", "locale_from_tag")
	var dict: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://i18n/ui.json"))
	_ok(dict.en.has("Girar") and dict.he.has("Girar"), "traduções geradas")


const _SPECIAL := {"row": "r", "col": "c", "bomb": "b", "urim": "u"}


static func _board_text(b: Array) -> String:
	var rows: Array[String] = []
	for row in b:
		var line := ""
		for t in row:
			if t == null:
				line += ".."
			else:
				line += ("U" if int(t.kind) < 0 else str(int(t.kind))) + str(_SPECIAL.get(str(t.special), "-"))
		rows.append(line)
	return "/".join(rows)


func _snapshot_ok(s: Dictionary, ref: Dictionary, tag: String) -> bool:
	var ids := 0
	for row in s.board:
		for t in row:
			if t != null:
				ids += int(t.id)
	var clay := ""
	for row in s.clay:
		for hp in row:
			clay += str(int(hp))
	var ok := _board_text(s.board) == str(ref.board) and ids == int(ref.ids) and clay == str(ref.clay)
	ok = ok and int(s.rng) == int(ref.rng) and int(s.nextId) == int(ref.nextId) and int(s.score) == int(ref.score)
	ok = ok and int(s.movesLeft) == int(ref.movesLeft) and str(s.status) == str(ref.status)
	for k in 6:
		ok = ok and int(s.collected[k]) == int(ref.collected[k])
	_ok(ok, tag)
	if not ok:
		printerr("  godot: ", _board_text(s.board), " score=", s.score, " rng=", s.rng, " status=", s.status)
		printerr("  ts:    ", ref.board, " score=", ref.score, " rng=", ref.rng, " status=", ref.status)
	return ok


## O motor das Pedras do Choshen refaz as partidas de referência do TypeScript igualzinho
## (o servidor confere cada partida assim).
func _test_puzzle() -> void:
	var levels: Array = JSON.parse_string(FileAccess.get_file_as_string("res://data/puzzle.json")).levels
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/puzzle_vectors.json"))
	# O sorteio de 32 bits: alguns valores conhecidos do mulberry32.
	var rng := {"s": PuzzleEngine._i32(1234)}
	_ok(PuzzleEngine.next_u32(rng) >= 0 and PuzzleEngine._imul(0x7fffffff, 0x7fffffff) == 1, "imul de 32 bits")
	for g in data.games:
		var tag := "fase %d semente %d" % [int(g.level), int(g.seed)]
		var level: Dictionary = g.levelData if g.has("levelData") else levels[int(g.level) - 1]
		var s := PuzzleEngine.create(level, int(g.seed))
		if not _snapshot_ok(s, g.start, tag + " montagem"):
			continue
		var i := 0
		for m in g.moves:
			var mv := [int(m.move[0]), int(m.move[1]), int(m.move[2]), int(m.move[3])]
			var res := PuzzleEngine.play(s, mv)
			if not res.ok:
				_ok(false, "%s jogada %d recusada (%s)" % [tag, i, res.reason])
				break
			_ok((res.steps as Array).size() == int(m.steps) and int(res.endBonus) == int(m.endBonus) and (res.shuffled != null) == bool(m.shuffled), "%s jogada %d etapas" % [tag, i])
			s = res.state
			if not _snapshot_ok(s, m.after, "%s jogada %d" % [tag, i]):
				break
			i += 1
		_ok(PuzzleEngine.stars(level, s.status == "won", int(s.score)) == int(g.stars), tag + " estrelas")
