## Uma partida das Pedras do Choshen (porte de app/puzzle/[level].tsx). O servidor dá a
## semente; o tabuleiro roda aqui com PuzzleEngine (idêntico ao motor TypeScript), e no fim
## as jogadas vão para o servidor, que refaz a partida e dá estrelas e moedas.
## Sem jogadas, um anúncio (de demonstração, neste cliente) dá +5 jogadas, uma vez por partida.
class_name PuzzleScreen
extends Control

const HINT_AFTER := 6.0
const TIMING := {"swap": 0.15, "pop": 0.23, "fallBase": 0.14, "fallPerRow": 0.055, "fallMax": 0.52, "shuffle": 0.46, "nudge": 0.13}

var level := 1
var run: Dictionary = {}
var state: Dictionary = {}
var moves: Array = []
var busy := false
var _sent := false
var _shown_score := 0
var _idle := 0.0
var _extra_used := false

var _body := Ui.vbox(14)
var _board := PuzzleBoard.new()
var _hud: _Hud
var _combo: Label
var _overlay: Control


func setup(params: Dictionary) -> void:
	level = clampi(int(params.get("level", Main.query("level").to_int() if Main.query("level") != "" else 1)), 1, PuzzleData.LEVELS)


func _ready() -> void:
	var col := Column.new(Ui.margin(_body, 0, 10, 0, 16), true)
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.max_width = 480
	col.side = 6
	add_child(col)
	_body.add_child(_header())
	var loading := Ui.vbox(16)
	loading.size_flags_vertical = Control.SIZE_EXPAND_FILL
	loading.alignment = BoxContainer.ALIGNMENT_CENTER
	var stones := Ui.hbox(6)
	stones.alignment = BoxContainer.ALIGNMENT_CENTER
	for i in 6:
		stones.add_child(StoneIcon.new(i, 30))
	loading.add_child(stones)
	loading.add_child(Ui.label(I18n.t("Carregando a fase…"), 16, Ui.MUTED, "medium", HORIZONTAL_ALIGNMENT_CENTER))
	_body.add_child(loading)
	_start(loading)


func _header() -> Control:
	var row := Ui.hbox(10)
	var close := Ui.button("✕", "velvet", "sm")
	close.tooltip_text = I18n.t("Sair da partida")
	close.custom_minimum_size.x = 44
	close.pressed.connect(_quit)
	Ui.mark("puzzle-close", close)
	row.add_child(close)
	var mid := Ui.vbox(0)
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.add_child(Ui.label(I18n.t("Fase {n}", {"n": level}), 20, Ui.ON, "bold", HORIZONTAL_ALIGNMENT_CENTER))
	var ch := Ui.hbox(4)
	ch.alignment = BoxContainer.ALIGNMENT_CENTER
	var k := PuzzleData.chapter(level) - 1
	ch.add_child(StoneIcon.new(k, 16))
	var name := Ui.label(PuzzleData.stone_name(k), 13, Ui.MUTED, "medium")
	name.autowrap_mode = TextServer.AUTOWRAP_OFF
	name.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	ch.add_child(name)
	mid.add_child(ch)
	row.add_child(mid)
	# À direita, o "Sem anúncios" (como no app); sem ele, um espaço do tamanho do botão.
	var no_ads := Economy.no_ads_button()
	var spacer := Control.new()
	spacer.custom_minimum_size.x = 44
	row.add_child(no_ads)
	row.add_child(spacer)
	var sync := func(): spacer.visible = not no_ads.visible
	sync.call()
	no_ads.visibility_changed.connect(sync)
	return row


func _start(loading: Control) -> void:
	var r := await Api.puzzle_start(level)
	if not is_inside_tree():
		return
	if not r.ok:
		for c in loading.get_children():
			c.queue_free()
		loading.add_child(Ui.label(str(r.message), 16, Ui.ON, "regular", HORIZONTAL_ALIGNMENT_CENTER))
		var back := Ui.button(I18n.t("Voltar ao mapa"), "gold")
		back.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		back.pressed.connect(func(): Main.instance.go("puzzle"))
		loading.add_child(back)
		return
	run = r.data
	_extra_used = int(run.get("extraMoves", 0)) > 0
	state = PuzzleEngine.create(PuzzleData.level(level), int(run.seed))
	_shown_score = 0
	loading.queue_free()
	var play := Ui.vbox(14)
	play.size_flags_vertical = Control.SIZE_EXPAND_FILL
	play.alignment = BoxContainer.ALIGNMENT_CENTER
	_hud = _Hud.new()
	play.add_child(Ui.margin(_hud, 8, 0, 8, 0))
	var area := Control.new()
	area.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_board.rows = int(state.level.rows)
	_board.cols = int(state.level.cols)
	_board.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	_board.swap_requested.connect(_swap)
	area.add_child(_board)
	_board.resized.connect(func(): area.custom_minimum_size.y = _board.get_combined_minimum_size().y)
	_combo = Ui.label("", 40, Ui.GOLD, "bold", HORIZONTAL_ALIGNMENT_CENTER)
	_combo.autowrap_mode = TextServer.AUTOWRAP_OFF
	_combo.text_direction = Control.TEXT_DIRECTION_LTR
	_combo.add_theme_color_override("font_outline_color", Color("#131C55"))
	_combo.add_theme_constant_override("outline_size", 10)
	_combo.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_combo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_combo.visible = false
	area.add_child(_combo)
	play.add_child(area)
	_body.add_child(play)
	_board.show_frame(state.board, state.clay)
	_hud.refresh(state, _shown_score)
	Ui.pop_in(play)
	print("PUZZLE_READY level=%d seed=%d" % [level, int(run.seed)])
	await get_tree().process_frame
	_mark_hint()


## Para os testes no navegador: onde fica uma jogada que vale.
func _mark_hint() -> void:
	if not OS.has_feature("web"):
		return
	# A jogada que mais rende agora (o robô de teste tenta vencer, não só jogar).
	var m: Array = []
	var best := -1
	for r in int(state.level.rows):
		for c in int(state.level.cols):
			for d in [[0, 1], [1, 0]]:
				var mv := [r, c, r + d[0], c + d[1]]
				if mv[2] >= int(state.level.rows) or mv[3] >= int(state.level.cols):
					continue
				if not PuzzleEngine.swap_valid(state.board, r, c, mv[2], mv[3]):
					continue
				var res := PuzzleEngine.play(state, mv)
				if res.ok and int(res.state.score) > best:
					best = int(res.state.score)
					m = mv
	# E uma jogada qualquer que vale (para o robô de teste perder de propósito).
	var any := PuzzleEngine.find_move(state.board)
	if any.size() == 4:
		var p1 := _board.cell_center(any[0], any[1])
		var p2 := _board.cell_center(any[2], any[3])
		print("PUZZLE_ANY %d %d %d %d" % [roundi(p1.x), roundi(p1.y), roundi(p2.x), roundi(p2.y)])
	if m.size() == 4:
		var a := _board.cell_center(m[0], m[1])
		var b := _board.cell_center(m[2], m[3])
		print("PUZZLE_MOVE %d %d %d %d" % [roundi(a.x), roundi(a.y), roundi(b.x), roundi(b.y)])


func _process(dt: float) -> void:
	if state.is_empty() or busy or state.status != "playing" or _overlay != null:
		return
	_idle += dt
	if _idle >= HINT_AFTER and _board.hint.is_empty():
		_board.hint = PuzzleEngine.find_move(state.board)


# --- Jogada ------------------------------------------------------------------------------


func _swap(move: Array) -> void:
	if busy or state.is_empty() or state.status != "playing":
		return
	var prev := state
	var res := PuzzleEngine.play(prev, move)
	busy = true
	_board.disabled = true
	_board.hint = []
	_idle = 0.0
	if not res.ok:
		if res.reason == "no-match":
			await _nudge(prev, move)
	else:
		moves.append(move.duplicate())
		await _animate(prev, res)
		if not is_inside_tree():
			return
		state = res.state
		_board.show_frame(state.board, state.clay)
		_hud.refresh(state, _shown_score)
		if state.status == "won":
			Sfx.play("win", 0.9)
		elif state.status == "lost":
			Sfx.play("wrong", 0.8)
	busy = false
	_board.disabled = false
	if not is_inside_tree():
		return
	if state.status == "won":
		await get_tree().create_timer(0.65).timeout
		_send()
	elif state.status == "lost":
		await get_tree().create_timer(0.4).timeout
		if not _extra_used and Economy.can_reward("moves"):
			_out_of_moves()
		else:
			_send()
	else:
		_mark_hint()


func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


## A troca, o estouro, a queda e as pedras novas, quadro por quadro (lib/puzzle-frames.ts).
func _animate(prev: Dictionary, res: Dictionary) -> void:
	var clay: Array = prev.clay
	# Os objetivos andam junto com as pedras que estouram (o motor conta toda casa limpa,
	# inclusive a que vira especial, pela pedra que estava nela).
	var collected: Array = (prev.collected as Array).duplicate()
	var before: Array = res.afterSwap
	_board.show_frame(res.afterSwap, clay)
	Sfx.play("dot", 0.5)
	await _wait(TIMING.swap)
	for step in res.steps:
		if not is_inside_tree():
			return
		_shown_score += int(step.scoreDelta)
		clay = step.clay
		var sound := "bump" if not (step.blasts as Array).is_empty() else ("power" if not (step.created as Array).is_empty() else ("coin" if int(step.cascade) > 0 else "pop"))
		Sfx.play(sound, 0.8)
		_board.show_frame(step.afterClear, clay, step.cleared, step.blasts)
		_show_combo(int(step.cascade))
		for t in step.cleared:
			if int(t.kind) >= 0:
				collected[int(t.kind)] += 1
		for t in step.created:
			var was: Variant = before[int(t.row)][int(t.col)]
			if was != null and int(was.kind) >= 0:
				collected[int(was.kind)] += 1
		before = step.afterFall
		_hud.refresh_partial(prev, collected, clay, _shown_score)
		await _wait(TIMING.pop)
		var spawns := _spawn_rows(step.afterClear, step.afterFall)
		var fall := minf(TIMING.fallMax, TIMING.fallBase + _max_fall(step.afterClear, step.afterFall, spawns) * TIMING.fallPerRow)
		_board.show_frame(step.afterFall, clay, [], [], spawns)
		await _wait(fall)
	if int(res.endBonus) > 0:
		_shown_score += int(res.endBonus)
	if res.shuffled != null:
		Sfx.play("reveal", 0.8)
		_board.show_frame(res.shuffled, clay)
		await _wait(TIMING.shuffle)
	_combo.visible = false


func _nudge(prev: Dictionary, move: Array) -> void:
	var swapped: Array = []
	for row in prev.board:
		swapped.append((row as Array).duplicate())
	var a: Variant = swapped[move[0]][move[1]]
	swapped[move[0]][move[1]] = swapped[move[2]][move[3]]
	swapped[move[2]][move[3]] = a
	Sfx.play("bump", 0.6)
	_board.show_frame(swapped, prev.clay)
	await _wait(TIMING.nudge)
	_board.show_frame(prev.board, prev.clay)
	await _wait(TIMING.nudge)


func _show_combo(cascade: int) -> void:
	if cascade <= 0:
		_combo.visible = false
		return
	_combo.text = "×%d" % (cascade + 1)
	_combo.visible = true
	_combo.pivot_offset = _combo.size / 2.0
	_combo.scale = Vector2(0.4, 0.4)
	create_tween().tween_property(_combo, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## De onde as pedras novas caem: empilhadas acima do tabuleiro, na ordem certa.
static func _spawn_rows(before: Array, after: Array) -> Dictionary:
	var known := {}
	for row in before:
		for t in row:
			if t != null:
				known[int(t.id)] = true
	var out := {}
	var cols: int = (after[0] as Array).size()
	for c in cols:
		var fresh: Array = []
		for r in after.size():
			var t: Variant = after[r][c]
			if t != null and not known.has(int(t.id)):
				fresh.append([int(t.id), r])
		for f in fresh:
			out[f[0]] = f[1] - fresh.size()
	return out


static func _max_fall(before: Array, after: Array, spawns: Dictionary) -> int:
	var row_of := {}
	for r in before.size():
		for t in before[r]:
			if t != null:
				row_of[int(t.id)] = r
	var m := 0
	for r in after.size():
		for t in after[r]:
			if t == null:
				continue
			var id := int(t.id)
			if row_of.has(id):
				m = maxi(m, r - int(row_of[id]))
			elif spawns.has(id):
				m = maxi(m, r - int(spawns[id]))
	return m


# --- Fim ----------------------------------------------------------------------------------


## Acabaram as jogadas: o que ainda falta e a oferta de +5 jogadas com um anúncio.
func _out_of_moves() -> void:
	_open_overlay()
	var v := _overlay_body()
	v.add_child(Ui.title(I18n.t("Acabaram as jogadas"), 26, Ui.ON, HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(Ui.label(I18n.t("Ainda faltam:"), 15, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(_goal_row(state))
	var extra := Ui.button(I18n.t("+5 jogadas"), "emerald", "lg")
	extra.tooltip_text = I18n.t("Assista a um anúncio e continue a partida com mais 5 jogadas")
	v.add_child(extra)
	var give_up := Ui.button(I18n.t("Encerrar a partida"), "ghost", "sm")
	v.add_child(give_up)
	Ui.mark("puzzle-extra", extra)
	Ui.mark("puzzle-give-up", give_up)
	print("PUZZLE_OUT")
	give_up.pressed.connect(func():
		_overlay.queue_free()
		_overlay = null
		_send())
	extra.pressed.connect(func():
		extra.disabled = true
		give_up.disabled = true
		if await Economy.earn("moves", str(run.id)) == "claimed":
			_extra_used = true
			state = PuzzleEngine.add_moves(state, 5)
			_hud.refresh(state, _shown_score)
			_overlay.queue_free()
			_overlay = null
			_mark_hint()
		else:
			extra.disabled = false
			give_up.disabled = false)


func _send() -> void:
	if _sent:
		return
	_sent = true
	_open_overlay()
	var v := _overlay_body()
	v.add_child(Ui.label(I18n.t("Conferindo a partida…"), 17, Ui.MUTED, "medium", HORIZONTAL_ALIGNMENT_CENTER))
	print("PUZZLE_CLIENT status=%s score=%d moves=%d" % [str(state.status), int(state.score), moves.size()])
	var r := await Api.puzzle_finish(str(run.id), moves)
	if not is_inside_tree():
		return
	_clear_overlay()
	v = _overlay_body()
	if not r.ok:
		v.add_child(Ui.title(I18n.t("Não deu para salvar o resultado"), 24, Ui.ON, HORIZONTAL_ALIGNMENT_CENTER))
		v.add_child(Ui.label(str(r.message), 15, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
		var again := Ui.button(I18n.t("Tentar de novo"), "gold")
		again.pressed.connect(func():
			_sent = false
			_send())
		v.add_child(again)
		var map := Ui.button(I18n.t("Voltar ao mapa"), "ghost", "sm")
		map.pressed.connect(func(): Main.instance.go("puzzle"))
		v.add_child(map)
		return
	_result(v, r.data)


func _result(v: VBoxContainer, res: Dictionary) -> void:
	var won := str(res.status) == "won"
	var title := Ui.title(I18n.t("Fase concluída!") if won else I18n.t("Não foi desta vez"), 28, Ui.ON, HORIZONTAL_ALIGNMENT_CENTER)
	v.add_child(title)
	if won:
		var stars := Ui.hbox(6)
		stars.alignment = BoxContainer.ALIGNMENT_CENTER
		stars.tooltip_text = I18n.t("{n} de {max} estrelas", {"n": int(res.stars), "max": 3})
		for i in 3:
			var s := StoneIcon.new(-2, 56)
			s.dim = i >= int(res.stars)
			stars.add_child(s)
			Ui.pop_in(s, 0.25 + i * 0.24)
			if not s.dim:
				get_tree().create_timer(0.25 + i * 0.24).timeout.connect(func(): Sfx.play("coin", 0.6))
		v.add_child(stars)
	else:
		v.add_child(_goal_row(state))
	v.add_child(Ui.label(I18n.t("{n} pontos", {"n": I18n.number(int(res.score))}), 20, Ui.GOLD, "bold", HORIZONTAL_ALIGNMENT_CENTER))
	if int(res.coins) > 0:
		v.add_child(Ui.label(I18n.tn(int(res.coins), "+{n} moeda", "+{n} moedas"), 18, Ui.ON, "bold", HORIZONTAL_ALIGNMENT_CENTER))
	elif won and int(res.bestStars) > int(res.stars):
		v.add_child(Ui.label(I18n.t("Seu recorde nesta fase: {n} estrelas.", {"n": int(res.bestStars)}), 14, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	if won and level < PuzzleData.LEVELS:
		var next := Ui.button(I18n.t("Próxima fase"), "emerald", "lg")
		next.pressed.connect(func(): _after_break(next, func(): Main.instance.go("puzzle_level", {"level": level + 1})))
		v.add_child(next)
		Ui.mark("puzzle-next", next)
	var again := Ui.button(I18n.t("Jogar de novo"), "velvet" if won else "gold", "sm" if won else "lg")
	again.pressed.connect(func(): _after_break(again, func(): Main.instance.go("puzzle_level", {"level": level})))
	v.add_child(again)
	var map := Ui.button(I18n.t("Voltar ao mapa"), "ghost", "sm")
	map.pressed.connect(func(): _after_break(map, func(): Main.instance.go("puzzle")))
	v.add_child(map)
	Ui.mark("puzzle-map", map)
	print("PUZZLE_RESULT status=%s stars=%d score=%d coins=%d" % [str(res.status), int(res.stars), int(res.score), int(res.coins)])


## Fim de partida é uma pausa: pode ser a hora do anúncio (com o presente antes).
func _after_break(button: Button, go: Callable) -> void:
	button.disabled = true
	await Economy.ad_break("level")
	go.call()


func _open_overlay() -> void:
	_overlay = Control.new()
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0.03, 0.04, 0.12, 0.72)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.add_child(center)
	var panel := Ui.panel(Ui.VELVET, 24, 20)
	panel.custom_minimum_size.x = minf(420.0, size.x - 32.0)
	center.add_child(panel)
	var v := Ui.vbox(14)
	panel.add_child(v)
	add_child(_overlay)
	Ui.fade_in(_overlay, 0.0, 0.22)


func _overlay_body() -> VBoxContainer:
	return _overlay.get_child(1).get_child(0).get_child(0) as VBoxContainer


func _clear_overlay() -> void:
	for c in _overlay_body().get_children():
		c.queue_free()


func _goal_row(s: Dictionary) -> Control:
	var row := HFlowContainer.new()
	row.alignment = FlowContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 8)
	for p in PuzzleEngine.goal_progress(s):
		row.add_child(_Hud.goal_chip(p))
	return row


func _quit() -> void:
	if state.is_empty() or state.status != "playing" or _sent or moves.is_empty():
		_leave()
		return
	var sheet := Sheet.new()
	sheet.body.add_child(Ui.title(I18n.t("Sair da partida?"), 26))
	sheet.body.add_child(Ui.label(I18n.t("As jogadas desta partida não valem estrelas."), 15, Ui.MUTED))
	var yes := Ui.button(I18n.t("Sair"), "gold")
	yes.pressed.connect(_leave)
	sheet.body.add_child(yes)
	var no := Ui.button(I18n.t("Continuar"), "velvet")
	no.pressed.connect(sheet.queue_free)
	sheet.body.add_child(no)
	add_child(sheet)


func _leave() -> void:
	# A partida aberta é encerrada no servidor (sem estrelas), como no app.
	if not run.is_empty() and not _sent and not state.is_empty() and state.status == "playing":
		_sent = true
		Api.puzzle_finish(str(run.id), moves)
	Main.instance.go("puzzle")


## Placar: jogadas que sobram, objetivos e a barra de pontos com as estrelas.
class _Hud:
	extends HBoxContainer
	var _moves := _Moves.new()
	var _goals := HFlowContainer.new()
	var _score := Ui.label("0", 20, Ui.ON, "bold")
	var _bar := _Bar.new()

	func _init() -> void:
		add_theme_constant_override("separation", 12)
		add_child(_moves)
		var right := Ui.vbox(10)
		right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		right.alignment = BoxContainer.ALIGNMENT_CENTER
		_goals.add_theme_constant_override("h_separation", 8)
		_goals.add_theme_constant_override("v_separation", 8)
		right.add_child(_goals)
		var row := Ui.hbox(10)
		_score.autowrap_mode = TextServer.AUTOWRAP_OFF
		_score.custom_minimum_size.x = 64
		_score.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		row.add_child(_score)
		_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(_bar)
		right.add_child(row)
		add_child(right)

	func refresh(s: Dictionary, score: int) -> void:
		_moves.set_moves(int(s.movesLeft), str(s.status) == "playing")
		for c in _goals.get_children():
			c.queue_free()
		for p in PuzzleEngine.goal_progress(s):
			_goals.add_child(goal_chip(p))
		_set_score(s.level, score)

	## Durante a animação: os objetivos andam junto com as pedras que estouram.
	func refresh_partial(prev: Dictionary, collected: Array, clay: Array, score: int) -> void:
		var s := {"level": prev.level, "collected": collected, "clay": clay, "score": score}
		_moves.set_moves(int(prev.movesLeft) - 1, true)
		for c in _goals.get_children():
			c.queue_free()
		for p in PuzzleEngine.goal_progress(s):
			_goals.add_child(goal_chip(p))
		_set_score(prev.level, score)

	func _set_score(level: Dictionary, score: int) -> void:
		_score.text = I18n.number(score)
		_bar.set_score(score, int(level.stars[0]), int(level.stars[1]))

	static func goal_chip(p: Dictionary) -> Control:
		var goal: Dictionary = p.goal
		var remaining := int(p.remaining)
		var chip := PanelContainer.new()
		var st := Ui.box(Color(0.075, 0.11, 0.33, 0.75), 18, Color(1, 1, 1, 0.16), 1, 0)
		st.content_margin_left = 4
		st.content_margin_right = 10
		st.content_margin_top = 3
		st.content_margin_bottom = 3
		chip.add_theme_stylebox_override("panel", st)
		var row := Ui.hbox(4)
		chip.add_child(row)
		var type := str(goal.type)
		var label := ""
		match type:
			"collect":
				row.add_child(StoneIcon.new(int(goal.kind), 30))
				label = I18n.t("{name}: faltam {n}", {"name": PuzzleData.stone_name(int(goal.kind)), "n": remaining})
			"clay":
				row.add_child(StoneIcon.new(-3, 28))
				label = I18n.t("Barro: faltam {n} casas", {"n": remaining})
			_:
				row.add_child(StoneIcon.new(-2, 26))
				label = I18n.t("Pontos: faltam {n}", {"n": remaining})
		chip.tooltip_text = label
		if remaining == 0:
			var ok := Ui.label("✓", 16, Color("#04261A"), "bold", HORIZONTAL_ALIGNMENT_CENTER)
			ok.autowrap_mode = TextServer.AUTOWRAP_OFF
			var dot := PanelContainer.new()
			dot.add_theme_stylebox_override("panel", Ui.box(Ui.EMERALD, 10, Color.TRANSPARENT, 0, 0))
			dot.custom_minimum_size = Vector2(22, 22)
			dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			dot.add_child(ok)
			row.add_child(dot)
		else:
			var n := Ui.label(I18n.number(remaining) if type == "score" else str(remaining), 17, Ui.ON, "bold", HORIZONTAL_ALIGNMENT_CENTER)
			n.autowrap_mode = TextServer.AUTOWRAP_OFF
			n.custom_minimum_size.x = 18
			n.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			row.add_child(n)
		return chip


class _Moves:
	extends Control
	var moves := 0
	var low := false
	var _font: Font

	func _init() -> void:
		custom_minimum_size = Vector2(86, 86)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_moves(n: int, playing: bool) -> void:
		moves = n
		low = n <= 3 and playing
		tooltip_text = I18n.t("{n} jogadas", {"n": n})
		queue_redraw()

	func _draw() -> void:
		var c := size / 2.0
		var face := Color("#FF9A7A") if low else Ui.GOLD
		var lip := Ui.RUBY_DEEP if low else Ui.GOLD_DEEP
		draw_circle(c + Vector2(0, 3), 42, lip, true, -1.0, true)
		draw_circle(c - Vector2(0, 1), 42, face, true, -1.0, true)
		var bold: Font = Ui.fonts.get("bold", get_theme_default_font())
		var text := str(moves)
		var w := bold.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 36).x
		draw_string(bold, Vector2(c.x - w / 2.0, c.y + 8), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 36, Ui.INK)
		var reg: Font = Ui.fonts.get("medium", bold)
		var sub := I18n.t("jogadas")
		var sw := reg.get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
		draw_string(reg, Vector2(c.x - sw / 2.0, c.y + 26), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Ui.INK)


## Barra de pontos com as duas estrelas (2 e 3). No hebraico enche da direita para a esquerda.
class _Bar:
	extends Control
	var p := 0.0
	var shown := 0.0
	var two_at := 0.6
	var score := 0
	var s2 := 1
	var s3 := 1

	func _init() -> void:
		custom_minimum_size = Vector2(80, 22)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_score(sc: int, a: int, b: int) -> void:
		score = sc
		s2 = a
		s3 = b
		p = minf(1.0, float(sc) / float(b))
		two_at = float(a) / float(b)

	func _process(dt: float) -> void:
		if absf(shown - p) > 0.001:
			shown = move_toward(shown, p, dt * 2.5)
			queue_redraw()

	func _draw() -> void:
		var rtl := is_layout_rtl()
		var w := size.x - 12.0
		var y := size.y / 2.0
		var bg := StyleBoxFlat.new()
		bg.bg_color = Color(1, 1, 1, 0.15)
		bg.set_corner_radius_all(6)
		draw_style_box(bg, Rect2(0, y - 6, w, 12))
		if shown > 0.0:
			var fill := StyleBoxFlat.new()
			fill.bg_color = Ui.GOLD
			fill.set_corner_radius_all(6)
			var fw := maxf(12.0, w * shown)
			draw_style_box(fill, Rect2(w - fw if rtl else 0.0, y - 6, fw, 12))
		for i in 2:
			var at := two_at if i == 0 else 1.0
			var x := w * (1.0 - at) if rtl else w * at
			StoneIcon.draw_star(self, Vector2(x, y), 10.0, score < (s2 if i == 0 else s3))
