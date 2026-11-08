## A pergunta da partida (porte de app/game/[id]/question.tsx), aberta por cima do sevivon.
##
## Cartão de pergaminho com a faixa da categoria, o trecho de contexto e a pergunta;
## quatro alternativas; o tempo corre numa barra que fica vermelha no fim. Ao responder, a
## certa fica verde (e a escolhida errada, vermelha), e o resultado mostra a explicação e a
## fonte no Sefaria. `closed` volta para o tabuleiro com o próximo passo.
class_name QuestionView
extends Control

signal closed(result: Dictionary)

var game_id := ""
var opponent_name := ""
var q: Dictionary
var _deadline_ms := 0.0
var _limit_s := 30.0
var _answered := false
var _options: Array[Button] = []
var _bar: Control
var _clock: Label
var _result_box := Ui.vbox(12)
var _scroll: ScrollContainer
var _last_tick := -1


func _init(question: Dictionary, id: String, opponent := "") -> void:
	q = question
	game_id = id
	opponent_name = opponent
	# O tempo restante vem do relógio do servidor (não depende do relógio do aparelho).
	var left := Util.iso_ms(str(q.deadlineAt)) - Util.iso_ms(str(q.serverNow))
	_deadline_ms = Util.now_ms() + left
	_limit_s = float(q.get("timeLimitSeconds", 30))


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var bg := ColorRect.new()
	bg.color = Ui.NIGHT
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var content := Ui.vbox(14)
	_scroll = Column.scrolling(Ui.margin(content, 0, 16, 0, 28))
	add_child(_scroll)

	var cat := str(q.category)
	var color: Color = Ui.CATEGORIES[cat].color if Ui.CATEGORIES.has(cat) else Ui.TEKHELET
	# Topo: categoria, nível e o tempo.
	var top := Ui.hbox(10)
	var ribbon := Ui.pill(Ui.category_name(cat), color.lightened(0.35), 14)
	top.add_child(ribbon)
	if bool(q.get("isCrownChallenge", false)):
		top.add_child(Ui.pill(I18n.t("Disputa do selo"), Ui.GOLD, 14))
	var lvl := Ui.label(I18n.t("Nível {level}", {"level": I18n.t(Ui.DIFFICULTY.get(str(q.difficulty), ""))}), 14, Ui.MUTED, "medium")
	top.add_child(lvl)
	_clock = Ui.label("", 20, Ui.ON, "display")
	_clock.size_flags_horizontal = Control.SIZE_SHRINK_END
	_clock.autowrap_mode = TextServer.AUTOWRAP_OFF
	top.add_child(_clock)
	content.add_child(top)
	_bar = _TimeBar.new(self)
	content.add_child(_bar)

	content.add_child(_card(color))
	var letters := ["א", "ב", "ג", "ד"] if I18n.rtl() else ["A", "B", "C", "D"]
	var opts: Array = q.options
	var rtl_opts := str(q.get("optionsDirection", "ltr")) == "rtl"
	for i in opts.size():
		var b := _option(letters[i], str(opts[i]), rtl_opts)
		var idx := i
		b.pressed.connect(func(): _answer(idx))
		_options.append(b)
		content.add_child(b)
		Ui.fade_in(b, 0.15 + 0.06 * i)
	content.add_child(_result_box)
	for i in _options.size():
		Ui.mark("option-%d" % i, _options[i])
	print("QUESTION_READY")


func _card(color: Color) -> Control:
	var card := PanelContainer.new()
	var s := Ui.box(Ui.KLAF, 20, Ui.KLAF_EDGE, 1, 18)
	s.border_width_top = 5
	s.border_color = Ui.KLAF_EDGE
	card.add_theme_stylebox_override("panel", s)
	var v := Ui.vbox(10)
	card.add_child(v)
	var stripe := ColorRect.new()
	stripe.color = color
	stripe.custom_minimum_size = Vector2(44, 5)
	stripe.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	v.add_child(stripe)
	var ctx: Variant = q.get("context")
	if ctx is Dictionary:
		v.add_child(Ui.label(str(ctx.label), 13, Ui.INK_MUTED, "semibold"))
		var quote := Ui.label(str(ctx.text), 18 if str(ctx.language) == "he" else 16, Ui.INK, "serif")
		if str(ctx.language) == "he":
			Ui.hebrew(quote)
		v.add_child(quote)
		var rule := ColorRect.new()
		rule.color = Color(Ui.KLAF_EDGE, 1)
		rule.custom_minimum_size.y = 1
		v.add_child(rule)
	v.add_child(Ui.label(str(q.text), 21, Ui.INK, "medium"))
	Ui.pop_in(card, 0.05)
	return card


func _option(letter: String, text: String, rtl: bool) -> Button:
	var b := Button.new()
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.custom_minimum_size.y = 62
	_look(b, Ui.VELVET, Color("#10163A"), Ui.LINE)
	var row := Ui.hbox(12)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var badge := _Badge.new(letter)
	row.add_child(badge)
	var l := Ui.label(text, 17, Ui.ON, "medium")
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if rtl:
		Ui.hebrew(l)
	row.add_child(l)
	var m := Ui.margin(row, 14, 10, 14, 13)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	# A altura acompanha o texto (alternativas longas quebram em várias linhas).
	b.resized.connect(func(): b.custom_minimum_size.y = maxf(62, m.get_combined_minimum_size().y))
	m.minimum_size_changed.connect(func(): b.custom_minimum_size.y = maxf(62, m.get_combined_minimum_size().y))
	return b


func _look(b: Button, face: Color, lip: Color, border: Color, width := 1) -> void:
	for state in ["normal", "hover", "pressed", "hover_pressed", "disabled", "focus"]:
		var s := Ui.box(face.lightened(0.05) if state == "hover" else face, 16, border, width, 0)
		s.border_width_bottom = width + 3
		if state == "pressed" or state == "hover_pressed":
			s.border_width_bottom = width
			s.expand_margin_top = -3
		if state == "focus":
			s.draw_center = false
			s.border_color = Ui.TEKHELET
			s.set_border_width_all(2)
		else:
			s.border_color = border
		b.add_theme_stylebox_override(state, s)


func _process(_dt: float) -> void:
	if _answered:
		return
	var left := maxf(0.0, (_deadline_ms - Util.now_ms()) / 1000.0)
	_clock.text = str(ceili(left))
	_clock.add_theme_color_override("font_color", Ui.RUBY if left <= 5.0 else Ui.ON)
	_bar.queue_redraw()
	var whole := ceili(left)
	if left <= 5.0 and whole != _last_tick and whole > 0:
		_last_tick = whole
		Sfx.play("clock", 0.5)
	if left <= 0.0:
		_answer(-1)


func time_fraction() -> float:
	if _answered:
		return 0.0
	return clampf((_deadline_ms - Util.now_ms()) / (_limit_s * 1000.0), 0.0, 1.0)


func _answer(index: int) -> void:
	if _answered:
		return
	_answered = true
	for b in _options:
		b.disabled = true
	if index >= 0:
		_look(_options[index], Ui.RAISED, Color("#10163A"), Ui.TEKHELET, 2)
	var r := await Api.answer(game_id, str(q.playId), index)
	if not r.ok:
		_answered = false
		for b in _options:
			b.disabled = false
		_result_box.add_child(Ui.label(r.message, 15, Ui.ERROR, "medium"))
		return
	_show(r.data, index)


func _show(res: Dictionary, chosen: int) -> void:
	var right := int(res.correctOptionIndex)
	_look(_options[right], Color("#1F5E47"), Ui.EMERALD_DEEP, Ui.EMERALD, 2)
	if chosen >= 0 and chosen != right:
		_look(_options[chosen], Color("#5B2133"), Ui.RUBY_DEEP, Ui.RUBY, 2)
	_bar.queue_redraw()
	var correct := bool(res.correct)
	Sfx.play("correct" if correct else "wrong", 0.8)
	if res.get("sealEarned") != null:
		Sfx.play("seal", 0.8)
	_clock.text = ""

	var panel := Ui.panel(Ui.VELVET, 22, 18, Ui.EMERALD if correct else Ui.RUBY)
	var v := Ui.vbox(10)
	panel.add_child(v)
	var title := ""
	var sub := ""
	var lives: Dictionary = res.get("lives", {})
	if res.get("sealEarned") != null:
		title = I18n.t("Selo conquistado!")
		sub = I18n.t("O selo de {category} é seu. +{points}.", {"category": Ui.category_name(str(res.sealEarned)), "points": int(res.pointsAwarded)})
	elif correct:
		title = I18n.t("Acertou!")
		sub = "+" + Ui.points_label(int(res.pointsAwarded))
	else:
		title = I18n.t("O tempo acabou") if bool(res.timedOut) else I18n.t("Não foi dessa vez")
		var parts: Array[String] = []
		if not lives.is_empty():
			parts.append(I18n.t("−1 vida · restam {n} de {max}", {"n": int(lives.lives), "max": int(lives.max)}))
		if bool(res.turnPassed) and opponent_name != "":
			parts.append(I18n.t("A resposta certa está em verde. Agora é a vez de {name}.", {"name": opponent_name}))
		else:
			parts.append(I18n.t("A resposta certa está marcada em verde."))
		sub = "\n".join(parts)
	v.add_child(Ui.title(title, 30, Ui.EMERALD if correct else Ui.RUBY))
	v.add_child(Ui.label(sub, 16, Ui.ON, "medium"))
	if correct and int(res.get("crownProgress", 0)) > 0 and not bool(res.crownReady):
		var row := Ui.hbox(10)
		var l := Ui.label(I18n.t("Rumo à Coroa"), 15, Ui.GOLD, "semibold")
		l.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		l.autowrap_mode = TextServer.AUTOWRAP_OFF
		row.add_child(l)
		row.add_child(GamePieces.CrownMeter.new(int(res.crownProgress)))
		v.add_child(row)
	if str(res.get("explanation", "")) != "":
		v.add_child(Ui.label(str(res.explanation), 16, Ui.MUTED, "regular"))
	_result_box.add_child(panel)
	Ui.pop_in(panel)
	if res.get("source") is Dictionary:
		_result_box.add_child(_source(res.source))

	var label := I18n.t("Voltar à partida")
	if bool(res.gameFinished):
		label = I18n.t("Ver o resultado")
	elif bool(res.crownReady):
		label = I18n.t("Escolher o selo")
	elif bool(res.canSpinAgain):
		label = I18n.t("Girar de novo")
	var go := Ui.button(label, "gold", "lg")
	go.pressed.connect(func(): closed.emit(res))
	_result_box.add_child(go)
	var report := Ui.button(I18n.t("Encontrou um problema nesta pergunta? Denunciar"), "ghost", "sm", true)
	report.add_theme_font_size_override("font_size", 14)
	report.pressed.connect(func(): add_child(ReportSheet.new(str(q.playId))))
	_result_box.add_child(report)
	print("ANSWER_SHOWN ", "correct" if correct else "wrong")
	if correct:
		GamePieces.confetti(self, Vector2(size.x / 2, size.y * 0.55), 50)
	# Rola até o resultado.
	await get_tree().process_frame
	await get_tree().process_frame
	var tw := create_tween()
	tw.tween_property(_scroll, "scroll_vertical", int(_scroll.get_v_scroll_bar().max_value), 0.5).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	await tw.finished
	Ui.mark("continue", go)
	Ui.mark("report", report)


## A fonte no Sefaria: referência, a citação que comprova a resposta e o link.
func _source(src: Dictionary) -> Control:
	var card := PanelContainer.new()
	var s := Ui.box(Ui.KLAF, 18, Ui.KLAF_EDGE, 1, 16)
	s.border_width_left = 4 if not I18n.rtl() else 1
	s.border_width_right = 4 if I18n.rtl() else 1
	s.border_color = Ui.GOLD_DEEP
	card.add_theme_stylebox_override("panel", s)
	var v := Ui.vbox(8)
	card.add_child(v)
	v.add_child(Ui.label(str(src.ref), 17, Ui.INK, "bold"))
	var quote := Ui.label(str(src.evidenceQuote), 18 if str(src.evidenceLanguage) == "he" else 16, Ui.INK, "serif")
	if str(src.evidenceLanguage) == "he":
		Ui.hebrew(quote)
	v.add_child(quote)
	var link := LinkButton.new()
	link.text = I18n.t("Abrir {ref} no Sefaria", {"ref": str(src.ref)})
	link.add_theme_color_override("font_color", Ui.LINK)
	link.add_theme_color_override("font_hover_color", Ui.LINK.darkened(0.2))
	link.add_theme_font_override("font", Ui.fonts.semibold)
	link.add_theme_font_size_override("font_size", 15)
	link.uri = str(src.url)
	v.add_child(link)
	return card


## Letra da alternativa num aro de ouro.
class _Badge:
	extends Control
	var letter := "A"

	func _init(l: String) -> void:
		letter = l
		custom_minimum_size = Vector2(32, 32)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size / 2
		draw_circle(c, 15, Ui.GOLD, false, 1.5, true)
		var f: Font = Ui.fonts.semibold
		var s := f.get_string_size(letter, HORIZONTAL_ALIGNMENT_LEFT, -1, 15)
		draw_string(f, Vector2(c.x - s.x / 2, c.y + 5.5), letter, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Ui.GOLD)


## Barra do tempo: encolhe até o fim; tekhelet, e vermelha nos últimos 5 segundos.
class _TimeBar:
	extends Control
	var owner_view: QuestionView

	func _init(v: QuestionView) -> void:
		owner_view = v
		custom_minimum_size.y = 8
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		draw_style_box(_rounded(Ui.RAISED), r)
		var k := owner_view.time_fraction()
		if k <= 0.0:
			return
		var w := size.x * k
		var x := size.x - w if is_layout_rtl() else 0.0
		var col := Ui.TEKHELET if k * owner_view._limit_s > 5.0 else Ui.RUBY
		draw_style_box(_rounded(col), Rect2(x, 0, maxf(w, size.y), size.y))

	func _rounded(c: Color) -> StyleBoxFlat:
		var s := StyleBoxFlat.new()
		s.bg_color = c
		s.set_corner_radius_all(4)
		s.anti_aliasing = true
		return s
