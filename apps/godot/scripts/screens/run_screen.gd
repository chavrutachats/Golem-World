## Uma fase do Golem World (porte de app/journey/run/[id].tsx). O Golem anda pelo cenário
## da parashá; a cada obstáculo, uma pergunta. Acertou rápido, pulo perfeito; acertou no
## fim do tempo, passa raspando; errou, tropeça e perde um coração (e vem outra pergunta
## para o mesmo obstáculo). Sem corações, a fase acaba. Quem decide tudo é o servidor; a
## tela só anima o que ele respondeu.
class_name RunScreen
extends Control

const OUTCOME := {
	"perfect": ["Pulo perfeito!", true], "pass": ["Passou!", true], "slow": ["Passou raspando!", true],
	"wrong": ["Ops! O Golem tropeçou", false], "timeout": ["O tempo acabou", false], "skipped": ["Pulou com a sacola de livros", true],
}
const POWERS := [["eliminate", "Eliminar 2"], ["skip", "Pular"], ["hint", "Dica"], ["time", "+10 s"]]

var id := ""
var run: Dictionary = {}
var q: Dictionary = {}
var stage := LevelStage.new()
var _view := SubViewportContainer.new()
var _viewport := SubViewport.new()
var _content := Ui.vbox(12)
var _scroll: ScrollContainer
var _hearts: _Hearts
var _progress: Label
var _coins: PanelContainer
var _caption: PanelContainer
var _deadline_ms := 0.0
var _answering := false
var _options: Array[Button] = []
var _eliminated: Array = []
var _bar: Control
var _clock: Label
var _power_buttons := {}
var _last_tick := -1
var _last_caption := ""


func setup(params: Dictionary) -> void:
	id = str(params.get("id", ""))


func _ready() -> void:
	_view.stretch = true
	_view.anchor_right = 1.0
	_view.anchor_bottom = 0.47
	_view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_viewport.own_world_3d = true
	_viewport.msaa_3d = Viewport.MSAA_4X
	_view.add_child(_viewport)
	_viewport.add_child(stage)
	add_child(_view)
	# Painel de baixo, com a borda de cima arredondada por cima do cenário.
	var panel := PanelContainer.new()
	var ps := Ui.box(Ui.NIGHT, 26, Ui.LINE, 1, 0)
	ps.corner_radius_bottom_left = 0
	ps.corner_radius_bottom_right = 0
	ps.border_width_bottom = 0
	panel.add_theme_stylebox_override("panel", ps)
	panel.anchor_top = 0.43
	panel.anchor_right = 1.0
	panel.anchor_bottom = 1.0
	add_child(panel)
	_scroll = Column.scrolling(Ui.margin(_content, 0, 18, 0, 26))
	panel.add_child(_scroll)
	add_child(_hud())
	_caption = PanelContainer.new()
	var cs := Ui.box(Color(Ui.NIGHT, 0.82), 999, Color(0, 0, 0, 0), 0, 0)
	cs.content_margin_left = 14
	cs.content_margin_right = 14
	cs.content_margin_top = 5
	cs.content_margin_bottom = 6
	_caption.add_theme_stylebox_override("panel", cs)
	_caption.anchor_left = 0.5
	_caption.anchor_right = 0.5
	_caption.anchor_top = 0.34
	_caption.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_caption.modulate.a = 0.0
	_caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var cl := Ui.label("", 14, Ui.ON, "semibold", HORIZONTAL_ALIGNMENT_CENTER)
	cl.autowrap_mode = TextServer.AUTOWRAP_OFF
	_caption.add_child(cl)
	add_child(_caption)
	_say(I18n.t("Carregando a fase…"))
	_boot()


func _hud() -> Control:
	var row := Ui.hbox(8)
	row.anchor_right = 1.0
	row.offset_left = 12
	row.offset_right = -12
	row.offset_top = 10
	var exit := Ui.button(I18n.t("Sair"), "velvet", "sm")
	exit.pressed.connect(_leave)
	row.add_child(exit)
	_hearts = _Hearts.new()
	row.add_child(_hearts)
	_progress = Ui.label("", 14, Color.WHITE, "semibold", HORIZONTAL_ALIGNMENT_CENTER)
	_progress.add_theme_color_override("font_outline_color", Color("#1B2350"))
	_progress.add_theme_constant_override("outline_size", 6)
	_progress.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_progress)
	_coins = Ui.pill(I18n.tn(0, "{n} moeda", "{n} moedas"), Ui.GOLD, 14)
	_coins.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_coins)
	return row


# --- Fluxo -------------------------------------------------------------------------------


func _clear() -> void:
	for c in _content.get_children():
		c.queue_free()
	_options.clear()
	_power_buttons.clear()
	_bar = null
	_clock = null


func _say(text: String) -> void:
	_clear()
	_content.add_child(Ui.label(text, 17, Ui.ON, "semibold", HORIZONTAL_ALIGNMENT_CENTER))


func _error(msg: String) -> void:
	_clear()
	_content.add_child(Ui.label(msg, 16, Ui.ERROR, "medium", HORIZONTAL_ALIGNMENT_CENTER))
	var again := Ui.button(I18n.t("Tentar de novo"), "gold")
	again.pressed.connect(_boot)
	_content.add_child(again)
	var back := Ui.button(I18n.t("Voltar ao mapa"), "velvet", "sm")
	back.pressed.connect(_to_map)
	_content.add_child(back)


func _apply_run(r: Dictionary) -> void:
	run = r
	_hearts.set_hearts(int(r.hearts), int(r.maxHearts))
	_progress.text = I18n.t("Obstáculo {n} de {max}", {"n": mini(int(r.obstacleIndex) + 1, int(r.obstacleCount)), "max": int(r.obstacleCount)})
	(_coins.get_child(0) as Label).text = I18n.tn(int(r.coins), "{n} moeda", "{n} moedas")


func _boot() -> void:
	_say(I18n.t("Carregando a fase…"))
	var r := await Api.journey_run(id)
	if not is_inside_tree():
		return
	if not r.ok:
		_error(r.message)
		return
	_apply_run(r.data)
	var look := {}
	var j := await Api.journey()
	if j.ok:
		look = j.data.golem
	if stage.golem == null:
		stage.setup(look)
	_set_stage(int(run.obstacleIndex))
	print("RUN_READY")
	match str(run.status):
		"completed":
			_complete({})
			return
		"failed", "abandoned":
			_failed()
			return
	if run.get("openAnswerId") != null:
		stage.show_obstacle(_obstacle(int(run.obstacleIndex)), LevelStage.STOP_X)
		await _load_question()
		return
	# As perguntas no idioma do jogador: o servidor pode precisar prepará-las.
	var prep := await Api.journey_prepare(str(run.nodeId))
	while prep.ok and str(prep.data.status) == "preparing":
		_say(I18n.t("Preparando as perguntas no seu idioma… {done} de {total}", {"done": int(prep.data.done), "total": int(prep.data.total)}))
		await get_tree().create_timer(1.2).timeout
		if not is_inside_tree():
			return
		prep = await Api.journey_prepare(str(run.nodeId))
	if prep.ok and str(prep.data.status) == "unavailable":
		_error(I18n.t("Ainda não há perguntas neste idioma."))
		return
	await _approach(int(run.obstacleIndex))
	await _load_question()


func _obstacle(index: int) -> String:
	return str(JourneyData.obstacle_at(str(run.nodeId), index, int(run.obstacleCount)).obstacle)


func _set_stage(index: int) -> void:
	var st := JourneyData.stage_at(str(run.nodeId), index, int(run.obstacleCount))
	stage.set_stage(st, str(run.nodeId))
	if str(st.caption) != "" and str(st.caption) != _last_caption:
		_last_caption = str(st.caption)
		_flash(str(st.caption), 2.6)


func _flash(text: String, seconds: float) -> void:
	(_caption.get_child(0) as Label).text = text
	var tw := _caption.create_tween()
	tw.tween_property(_caption, "modulate:a", 1.0, 0.25)
	tw.tween_interval(seconds)
	tw.tween_property(_caption, "modulate:a", 0.0, 0.4)


func _approach(index: int) -> void:
	_say(I18n.t("O Golem segue em frente…"))
	_set_stage(index)
	var ob := JourneyData.obstacle_at(str(run.nodeId), index, int(run.obstacleCount))
	if str(ob.caption) != "" and _last_caption == "":
		_flash("%s · %s" % [ob.caption, ob.ref], 2.6)
	await stage.approach(str(ob.obstacle))


func _load_question() -> void:
	var r := await Api.journey_question(id)
	if not is_inside_tree():
		return
	if not r.ok:
		_error(r.message)
		return
	q = r.data
	_eliminated = (q.eliminated as Array).duplicate()
	var left := Util.iso_ms(str(q.deadlineAt)) - Util.iso_ms(str(q.serverNow))
	_deadline_ms = Util.now_ms() + left
	_answering = false
	_show_question(null)


# --- Pergunta ----------------------------------------------------------------------------


func _show_question(hint: Variant) -> void:
	_clear()
	var tr := JourneyData.track(str(q.track))
	var color := Color(str(tr.get("color", "#7C88FF")))
	var top := Ui.hbox(10)
	top.add_child(Ui.pill(JourneyData.loc(tr.get("label", {})), color.lightened(0.3), 13))
	top.add_child(Ui.label(I18n.t("Nível {level}", {"level": I18n.t(Ui.DIFFICULTY.get(str(q.difficulty), ""))}), 13, Ui.MUTED, "medium"))
	_clock = Ui.label("", 20, Ui.ON, "display")
	_clock.autowrap_mode = TextServer.AUTOWRAP_OFF
	_clock.size_flags_horizontal = Control.SIZE_SHRINK_END
	top.add_child(_clock)
	_content.add_child(top)
	_bar = _TimeBar.new(self)
	_content.add_child(_bar)
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", Ui.box(Ui.KLAF, 18, Ui.KLAF_EDGE, 1, 16))
	var cv := Ui.vbox(8)
	card.add_child(cv)
	var ctx: Variant = q.get("context")
	if ctx is Dictionary:
		cv.add_child(Ui.label(str(ctx.label), 12, Ui.INK_MUTED, "semibold"))
		var quote := Ui.label(str(ctx.text), 17 if str(ctx.language) == "he" else 15, Ui.INK, "serif")
		if str(ctx.language) == "he":
			Ui.hebrew(quote)
		cv.add_child(quote)
	cv.add_child(Ui.label(str(q.text), 19, Ui.INK, "medium"))
	_content.add_child(card)
	if hint is Dictionary:
		var hc := Ui.panel(Color("#24305F"), 14, 12, Ui.GOLD)
		var hv := Ui.vbox(4)
		hc.add_child(hv)
		hv.add_child(Ui.label(I18n.t("Sua chavruta sugere olhar em {ref}", {"ref": str(hint.ref)}), 14, Ui.GOLD, "semibold"))
		hv.add_child(Ui.label(str(hint.text), 14, Ui.ON))
		_content.add_child(hc)
	var letters := ["א", "ב", "ג", "ד"] if I18n.rtl() else ["A", "B", "C", "D"]
	var opts: Array = q.options
	for i in opts.size():
		var gone := _eliminated.has(i)
		var text := str(opts[i]) + ("  " + I18n.t("(eliminada)") if gone else "")
		var b := _option(letters[i], text, str(q.optionsDirection) == "rtl")
		b.disabled = gone
		if gone:
			b.modulate.a = 0.45
		var idx := i
		b.pressed.connect(func(): _answer(idx))
		_options.append(b)
		_content.add_child(b)
		Ui.mark("run-option-%d" % i, b)
	var powers := Ui.hbox(6)
	for p in POWERS:
		var n := _power_count(p[0])
		var b := Ui.button("%s · %d" % [I18n.t(p[1]), n], "velvet", "sm")
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.add_theme_font_size_override("font_size", 13)
		b.disabled = n <= 0
		var kind: String = p[0]
		b.pressed.connect(func(): _power(kind))
		_power_buttons[kind] = b
		powers.add_child(b)
	_content.add_child(powers)
	print("RUN_QUESTION")


func _option(letter: String, text: String, rtl: bool) -> Button:
	var b := Button.new()
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.custom_minimum_size.y = 54
	_look(b, Ui.VELVET, Ui.LINE)
	var row := Ui.hbox(10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(QuestionView._Badge.new(letter))
	var l := Ui.label(text, 16, Ui.ON, "medium")
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if rtl:
		Ui.hebrew(l)
	row.add_child(l)
	var m := Ui.margin(row, 12, 9, 12, 12)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	m.minimum_size_changed.connect(func(): b.custom_minimum_size.y = maxf(54, m.get_combined_minimum_size().y))
	return b


func _look(b: Button, face: Color, border: Color, width := 1) -> void:
	for state in ["normal", "hover", "pressed", "hover_pressed", "disabled", "focus"]:
		var s := Ui.box(face.lightened(0.05) if state == "hover" else face, 14, border, width, 0)
		s.border_width_bottom = width + 3
		if state == "focus":
			s.draw_center = false
			s.border_color = Ui.TEKHELET
			s.set_border_width_all(2)
		b.add_theme_stylebox_override(state, s)


func _power_count(kind: String) -> int:
	var pu: Dictionary = run.get("powerUps", {})
	var bo: Dictionary = run.get("boosts", {})
	match kind:
		"hint":
			return int(pu.get("hint", 0))
		"time":
			return 0 if bool(q.get("timeAdded", false)) else int(bo.get("time", 0))
	return int(pu.get(kind, 0)) + int(bo.get(kind, 0))


func time_fraction() -> float:
	if _answering or q.is_empty():
		return 0.0
	return clampf((_deadline_ms - Util.now_ms()) / (float(q.timeLimitSeconds) * 1000.0), 0.0, 1.0)


func _process(_dt: float) -> void:
	if _clock == null or _answering or q.is_empty():
		return
	var left := maxf(0.0, (_deadline_ms - Util.now_ms()) / 1000.0)
	_clock.text = str(ceili(left))
	_clock.add_theme_color_override("font_color", Ui.RUBY if left <= 5.0 else Ui.ON)
	if _bar:
		_bar.queue_redraw()
	var whole := ceili(left)
	if left <= 5.0 and whole != _last_tick and whole > 0:
		_last_tick = whole
		Sfx.play("clock", 0.45)
	if left <= 0.0:
		_answer(-1)


func _answer(index: int) -> void:
	if _answering:
		return
	_answering = true
	for b in _options:
		b.disabled = true
	for b in _power_buttons.values():
		(b as Button).disabled = true
	if index >= 0:
		_look(_options[index], Ui.RAISED, Ui.TEKHELET, 2)
	var r := await Api.journey_answer(id, str(q.answerId), index)
	if not r.ok:
		# A pergunta pode ter vencido do lado do servidor: recomeça do estado real.
		if r.status == 409:
			_boot()
		else:
			_error(r.message)
		return
	await _after(r.data, index)


func _power(kind: String) -> void:
	if _answering:
		return
	for b in _power_buttons.values():
		(b as Button).disabled = true
	var r := await Api.journey_power(id, str(q.answerId), kind)
	if not r.ok:
		_flash(r.message, 2.5)
		_show_question(null)
		return
	Sfx.play("power", 0.7)
	var d: Dictionary = r.data
	_apply_run(d.run)
	if d.has("deadlineAt"):
		q.deadlineAt = d.deadlineAt
		q.timeAdded = true
		_deadline_ms += 10_000.0
	if d.has("eliminated"):
		_eliminated = d.eliminated
	if d.has("answer"):
		_answering = true
		await _after(d.answer, -1)
		return
	_show_question(d.get("hint"))


func _after(res: Dictionary, chosen: int) -> void:
	_apply_run(res.run)
	var right := int(res.correctOptionIndex)
	if right < _options.size():
		_look(_options[right], Color("#1F5E47"), Ui.EMERALD, 2)
	if chosen >= 0 and chosen != right:
		_look(_options[chosen], Color("#5B2133"), Ui.RUBY, 2)
	Sfx.play("correct" if bool(res.correct) else "wrong", 0.7)
	if bool(res.passed):
		await stage.jump_over()
		if int(res.coinsAwarded) > 0:
			Sfx.play("coin", 0.8)
			_flash(I18n.tn(int(res.coinsAwarded), "+{n} moeda", "+{n} moedas"), 1.4)
	else:
		await stage.stumble(not bool(res.forgiven))
	_feedback(res)


# --- Resultado de cada obstáculo ----------------------------------------------------------


func _feedback(res: Dictionary) -> void:
	_clear()
	var o: Array = OUTCOME.get(str(res.outcome), ["", true])
	var good: bool = o[1]
	var panel := Ui.panel(Ui.VELVET, 20, 16, Ui.EMERALD if good else Ui.RUBY)
	var v := Ui.vbox(8)
	panel.add_child(v)
	v.add_child(Ui.title(I18n.t(o[0]), 28, Ui.EMERALD if good else Ui.RUBY))
	if bool(res.forgiven):
		v.add_child(Ui.label(I18n.t("A pena do sofer apagou o erro"), 15, Ui.GOLD, "semibold"))
	if int(res.coinsAwarded) > 0:
		v.add_child(Ui.label(I18n.tn(int(res.coinsAwarded), "+{n} moeda", "+{n} moedas"), 15, Ui.GOLD, "semibold"))
	if not good:
		var opts: Array = q.get("options", [])
		var right := int(res.correctOptionIndex)
		if right < opts.size():
			v.add_child(Ui.label("%s %s" % [I18n.t("Resposta:"), opts[right]], 15, Ui.ON, "medium"))
	if str(res.get("explanation", "")) != "":
		v.add_child(Ui.label(str(res.explanation), 15, Ui.MUTED))
	_content.add_child(panel)
	Ui.pop_in(panel)
	# O botão logo abaixo do resultado: a fonte (às vezes longa) vem depois, para quem quiser ler.
	var go := Ui.button(I18n.t("Continuar"), "gold", "lg")
	go.pressed.connect(func(): _next(res))
	_content.add_child(go)
	if res.get("source") is Dictionary:
		_content.add_child(_source(res.source))
	Ui.mark("run-continue", go)
	print("RUN_FEEDBACK ", res.outcome)
	_scroll.scroll_vertical = 0


func _source(src: Dictionary) -> Control:
	var card := PanelContainer.new()
	var s := Ui.box(Ui.KLAF, 16, Ui.KLAF_EDGE, 1, 14)
	card.add_theme_stylebox_override("panel", s)
	var v := Ui.vbox(6)
	card.add_child(v)
	v.add_child(Ui.label(str(src.ref), 16, Ui.INK, "bold"))
	var quote := Ui.label(str(src.quote), 17 if str(src.language) == "he" else 15, Ui.INK, "serif")
	if str(src.language) == "he":
		Ui.hebrew(quote)
	v.add_child(quote)
	if bool(src.get("machineTranslated", false)):
		v.add_child(Ui.label(I18n.t("Tradução automática do original."), 12, Ui.INK_MUTED))
	var link := LinkButton.new()
	link.text = I18n.t("Abrir {ref} no Sefaria", {"ref": str(src.ref)})
	link.add_theme_color_override("font_color", Ui.LINK)
	link.add_theme_font_override("font", Ui.fonts.semibold)
	link.add_theme_font_size_override("font_size", 14)
	link.uri = str(src.url)
	v.add_child(link)
	return card


func _next(res: Dictionary) -> void:
	q = {}
	if res.get("completion") is Dictionary:
		_say(I18n.t("O Golem segue em frente…"))
		var g := JourneyData.goal_of(str(run.nodeId))
		await stage.reach_goal(g.model)
		if str(g.caption) != "":
			_flash(str(g.caption), 3.0)
		_complete(res.completion)
		return
	if str(res.run.status) == "failed":
		Sfx.play("wrong", 0.7)
		_failed()
		return
	if bool(res.passed):
		await _approach(int(res.run.obstacleIndex))
	await _load_question()


# --- Fim da fase (porte de LevelEnd) ------------------------------------------------------


func _complete(c: Dictionary) -> void:
	_clear()
	var info := JourneyData.level_info(str(run.nodeId))
	var title := I18n.t("Caminho concluído!")
	if info.get("kind") == "main":
		title = I18n.t("Torá de {parasha} concluída!", {"parasha": JourneyData.loc(JourneyData.parasha(str(info.parashaId)).name)})
	elif info.get("kind") == "beitMidrash":
		title = I18n.t("Siyum de {book}!", {"book": JourneyData.loc(JourneyData.world(str(info.book)).name)})
	var panel := Ui.panel(Ui.VELVET, 22, 18, Ui.GOLD)
	var v := Ui.vbox(10)
	panel.add_child(v)
	v.add_child(Ui.title(title, 28, Ui.GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	if info.get("kind") == "beitMidrash":
		v.add_child(Ui.label(I18n.t("Chazak, chazak venitchazek: “sê forte, sê forte, e nos fortaleçamos”, como se diz na sinagoga ao terminar a leitura de cada livro da Torá."), 15, Ui.ON, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	var stars := int(c.get("stars", 0))
	if stars > 0:
		var s := Ui.label("★".repeat(stars) + "☆".repeat(3 - stars), 40, Ui.GOLD, "bold", HORIZONTAL_ALIGNMENT_CENTER)
		v.add_child(s)
		v.add_child(Ui.label(I18n.t("{n} de {max} estrelas", {"n": stars, "max": 3}), 14, Ui.MUTED, "medium", HORIZONTAL_ALIGNMENT_CENTER))
	var coins := int(run.get("coins", 0))
	var coin_text := I18n.tn(coins, "+{n} moeda", "+{n} moedas")
	if int(c.get("bonusCoins", 0)) > 0:
		coin_text += " (" + I18n.t("inclui {n} de bônus por concluir", {"n": int(c.bonusCoins)}) + ")"
	v.add_child(Ui.label(coin_text, 16, Ui.GOLD, "semibold", HORIZONTAL_ALIGNMENT_CENTER))
	if Economy.can_reward("double") and coins > 0:
		var double := Ui.button(I18n.t("Dobrar as moedas"), "emerald")
		double.tooltip_text = I18n.t("Assista a um anúncio e ganhe mais {n} moedas", {"n": coins})
		double.pressed.connect(func():
			double.disabled = true
			if await Economy.earn("double", str(run.runId)) == "claimed":
				double.text = I18n.tn(coins, "+{n} moeda", "+{n} moedas")
			else:
				double.disabled = false)
		v.add_child(double)
		Ui.mark("run-double", double)
	var opened: Array = c.get("opened", [])
	var tracks := opened.filter(func(n): return str(n).ends_with(":torah") == false and not str(n).begins_with("beit-midrash"))
	if not tracks.is_empty():
		v.add_child(Ui.label(I18n.t("Abriram os caminhos de estudo:"), 15, Ui.ON, "semibold", HORIZONTAL_ALIGNMENT_CENTER))
		var names: Array[String] = []
		for n in tracks:
			names.append(JourneyData.loc(JourneyData.track(str(n).split(":")[1]).label))
		v.add_child(Ui.label(", ".join(names), 15, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	var rewards: Array = c.get("rewards", [])
	if not rewards.is_empty():
		v.add_child(Ui.label("%s %s" % [I18n.t("Prêmio para o Golem:"), ", ".join(PackedStringArray(rewards))], 15, Ui.GOLD, "semibold", HORIZONTAL_ALIGNMENT_CENTER))
	_content.add_child(panel)
	Ui.pop_in(panel)
	var map := Ui.button(I18n.t("Voltar ao mapa"), "gold", "lg")
	map.pressed.connect(func(): _after_break(map, _to_map))
	_content.add_child(map)
	var again := Ui.button(I18n.t("Jogar de novo"), "velvet")
	again.pressed.connect(func(): _after_break(again, func(): _restart(again)))
	_content.add_child(again)
	Ui.mark("run-map", map)
	Sfx.play("win", 0.8)
	GamePieces.confetti(self, Vector2(size.x / 2, size.y * 0.4), 80)
	print("RUN_COMPLETE")


func _failed() -> void:
	_clear()
	var panel := Ui.panel(Ui.VELVET, 22, 18, Ui.RUBY)
	var v := Ui.vbox(10)
	panel.add_child(v)
	v.add_child(Ui.title(I18n.t("Os corações acabaram"), 28, Ui.RUBY, HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(Ui.label(I18n.t("Cada erro mostrou uma fonte nova. O Golem sacode a poeira e tenta de novo?"), 15, Ui.ON, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	_content.add_child(panel)
	# Com um anúncio, continua do obstáculo em que parou, com 1 coração (uma vez por fase).
	if Economy.can_reward("continue") and not bool(run.get("revived", false)) and str(run.status) == "failed":
		var revive := Ui.button(I18n.t("Continuar com 1 coração"), "emerald", "lg")
		revive.tooltip_text = I18n.t("Assista a um anúncio e continue do obstáculo em que parou")
		revive.pressed.connect(func():
			revive.disabled = true
			if await Economy.earn("continue", str(run.runId)) == "claimed":
				_clear()
				stage.golem.pose_name = "idle"
				_boot()
			else:
				revive.disabled = false)
		_content.add_child(revive)
		Ui.mark("run-revive", revive)
	var again := Ui.button(I18n.t("Tentar de novo"), "gold", "lg")
	again.pressed.connect(func(): _after_break(again, func(): _restart(again)))
	_content.add_child(again)
	var map := Ui.button(I18n.t("Voltar ao mapa"), "velvet")
	map.pressed.connect(func(): _after_break(map, _to_map))
	_content.add_child(map)
	stage.golem.pose_name = "hurt"
	print("RUN_FAILED")


## Fim de fase é uma pausa: pode ser a hora do anúncio (com o presente antes).
func _after_break(button: Button, go: Callable) -> void:
	button.disabled = true
	await Economy.ad_break("level")
	button.disabled = false
	go.call()


func _restart(button: Button) -> void:
	button.disabled = true
	var r := await Api.journey_start(str(run.nodeId))
	if r.ok:
		Main.instance.go("run", {"id": str(r.data.runId)})
	else:
		button.disabled = false
		_flash(r.message, 2.5)


func _to_map() -> void:
	Main.instance.go("journey")


func _leave() -> void:
	if q.is_empty() or _answering:
		_to_map()
		return
	var sheet := Sheet.new()
	sheet.body.add_child(Ui.title(I18n.t("Sair da fase?"), 26))
	sheet.body.add_child(Ui.label(I18n.t("A pergunta aberta vai contar como tempo esgotado. Você pode continuar a fase depois pelo mapa."), 15, Ui.MUTED))
	var yes := Ui.button(I18n.t("Sair"), "gold")
	yes.pressed.connect(_to_map)
	sheet.body.add_child(yes)
	var no := Ui.button(I18n.t("Continuar"), "velvet")
	no.pressed.connect(sheet.queue_free)
	sheet.body.add_child(no)
	add_child(sheet)


## Corações da fase, desenhados (cheios e vazios).
class _Hearts:
	extends Control
	var hearts := 0
	var max_hearts := 3

	func _init() -> void:
		custom_minimum_size = Vector2(3 * 24, 24)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_hearts(n: int, m: int) -> void:
		hearts = n
		max_hearts = m
		custom_minimum_size.x = m * 24
		queue_redraw()

	func _draw() -> void:
		for i in max_hearts:
			var c := Vector2(11 + i * 24, 12)
			var pts := PackedVector2Array()
			for k in 32:
				var t := float(k) / 32.0 * TAU
				var x := 16.0 * pow(sin(t), 3)
				var y := -(13.0 * cos(t) - 5.0 * cos(2 * t) - 2.0 * cos(3 * t) - cos(4 * t))
				pts.append(c + Vector2(x, y) * 0.6)
			var full := i < hearts
			draw_colored_polygon(pts, Color("#EF5B6E") if full else Color(0, 0, 0, 0.35))
			pts.append(pts[0])
			draw_polyline(pts, Color.WHITE if full else Color(1, 1, 1, 0.6), 1.5, true)


## Barra do tempo da pergunta.
class _TimeBar:
	extends Control
	var screen: RunScreen

	func _init(s: RunScreen) -> void:
		screen = s
		custom_minimum_size.y = 7
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var bg := StyleBoxFlat.new()
		bg.bg_color = Ui.RAISED
		bg.set_corner_radius_all(4)
		draw_style_box(bg, Rect2(Vector2.ZERO, size))
		var k := screen.time_fraction()
		if k <= 0.0:
			return
		var fg := StyleBoxFlat.new()
		fg.bg_color = Ui.TEKHELET if k * float(screen.q.get("timeLimitSeconds", 30)) > 5.0 else Ui.RUBY
		fg.set_corner_radius_all(4)
		var w := maxf(size.x * k, size.y)
		draw_style_box(fg, Rect2(size.x - w if is_layout_rtl() else 0.0, 0, w, size.y))
