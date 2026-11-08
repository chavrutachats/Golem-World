## Início: saudação, novo jogo do sevivon (treino ou adversário aleatório), as partidas em
## andamento e o que ainda vem nesta versão.
class_name HomeScreen
extends Control

var _content := Ui.vbox(16)
var _games_box := Ui.vbox(10)
var _status: Label
var _buttons: Array[Button] = []
var _points: PanelContainer
var _header_name: Label
var _more_buttons: Array[Button] = []
var _wallet: PanelContainer
var _no_ads: Button
var _join: Button
## Marcadores para os testes no navegador (repetidos quando a página rola).
var _scroll_marks := {}


func _ready() -> void:
	var scroll := Column.scrolling(Ui.margin(_content, 0, 18, 0, 28))
	add_child(scroll)
	_scroll_marks = {}
	Ui.mark_on_scroll(scroll, _scroll_marks)
	_content.add_child(_header())
	_content.add_child(_hero())
	_content.add_child(_golem_world())
	_content.add_child(_choshen())
	_content.add_child(_more())
	_content.add_child(Ui.title(I18n.t("Suas partidas"), 24))
	_content.add_child(_games_box)
	_content.add_child(_language_row())
	for i in _content.get_child_count():
		Ui.fade_in(_content.get_child(i), 0.05 * i)
	_load()


func _header() -> Control:
	var row := Ui.hbox(12)
	var name := str(Api.user.get("displayName", ""))
	_header_name = Ui.title(I18n.t("Shalom, {name}", {"name": name}), 30)
	row.add_child(_header_name)
	_points = Ui.pill(Ui.points_label(int(Api.user.get("totalPoints", 0))), Ui.GOLD, 14)
	_points.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var side := Ui.vbox(6)
	side.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	# Altura reservada: a carteira e o "Sem anúncios" chegam depois e não empurram a tela.
	side.custom_minimum_size.y = 104
	side.add_child(_points)
	_wallet = Ui.pill("", Color("#F08FB0"), 13)
	_wallet.visible = false
	side.add_child(_wallet)
	var no_ads := Economy.no_ads_button()
	no_ads.size_flags_horizontal = Control.SIZE_SHRINK_END
	side.add_child(no_ads)
	_no_ads = no_ads
	row.add_child(side)
	Economy.changed.connect(_on_economy)
	return row


## Moedas e shekels, embaixo dos pontos.
func _on_economy() -> void:
	if not is_instance_valid(_wallet) or Economy.state.is_empty():
		return
	(_wallet.get_child(0) as Label).text = "%s · %s ₪" % [I18n.tn(Economy.coins(), "{n} moeda", "{n} moedas"), I18n.number(Economy.shekels())]
	_wallet.visible = true
	if _no_ads.visible:
		Ui.mark("no-ads", _no_ads)


func _hero() -> Control:
	var card := Ui.panel(Ui.VELVET, 24, 0)
	var v := Ui.vbox(0)
	card.add_child(v)
	var view := SevivonView.new()
	view.custom_minimum_size.y = 210
	view.stage.frame_shift = 0.05
	v.add_child(view)
	var body := Ui.vbox(12)
	v.add_child(Ui.margin(body, 18, 4, 18, 18))
	body.add_child(Ui.title(I18n.t("Sevivon: novo jogo"), 26))
	var row := Ui.hbox(10)
	var solo := Ui.button(I18n.t("Treino"), "gold", "lg")
	solo.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	solo.pressed.connect(func(): _create("solo"))
	var random := Ui.button(I18n.t("Adversário aleatório"), "velvet", "lg", true)
	random.add_theme_font_size_override("font_size", 17)
	random.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	random.pressed.connect(func(): _create("random"))
	row.add_child(solo)
	row.add_child(random)
	var friend := Ui.button(I18n.t("Desafiar um amigo"), "velvet", "md")
	friend.tooltip_text = I18n.t("Gere um código para mandar a quem você quiser.")
	friend.pressed.connect(func(): _create("friend"))
	var code := Ui.button(I18n.t("Tenho um código de convite"), "ghost", "sm")
	code.pressed.connect(func(): Main.instance.go("join"))
	_buttons = [solo, random, friend]
	Ui.mark("friend", friend)
	Ui.mark("join", code)
	_join = code
	Ui.mark("solo", solo)
	Ui.mark("random", random)
	body.add_child(row)
	body.add_child(friend)
	body.add_child(code)
	_status = Ui.label("", 15, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER)
	_status.visible = false
	body.add_child(_status)
	return card


## O Golem World: a jornada pelas parashiot, aberta nesta versão (Fase 15).
func _golem_world() -> Control:
	var b := Button.new()
	b.custom_minimum_size.y = 96
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "hover_pressed", "focus"]:
		var s := Ui.box(Color("#1F5E47") if state != "hover" else Color("#236B51"), 22, Ui.EMERALD, 1, 16)
		s.border_width_bottom = 4
		s.border_color = Ui.EMERALD_DEEP
		if state == "focus":
			s.draw_center = false
			s.border_color = Ui.TEKHELET
			s.set_border_width_all(2)
		b.add_theme_stylebox_override(state, s)
	var v := Ui.vbox(2)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_child(Ui.title(I18n.t("Golem World"), 26, Ui.ON))
	v.add_child(Ui.label(I18n.t("A jornada pelas 54 parashiot com o seu Golem."), 15, Color("#CFEFDF"), "medium"))
	for l in v.get_children():
		(l as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	var m := Ui.margin(v, 18, 10, 18, 14)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	b.pressed.connect(func():
		Sfx.play("power", 0.6)
		Main.instance.go("journey"))
	Ui.mark("golem-world", b)
	return b


## As Pedras do Choshen: o jogo de trios com as pedras do peitoral (Fase 16).
func _choshen() -> Control:
	var b := Button.new()
	b.custom_minimum_size.y = 96
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "hover_pressed", "focus"]:
		var s := Ui.box(Color("#5A2140") if state != "hover" else Color("#6A274B"), 22, Color("#E5374A"), 1, 16)
		s.border_width_bottom = 4
		s.border_color = Color("#9E1C2E")
		if state == "focus":
			s.draw_center = false
			s.border_color = Ui.TEKHELET
			s.set_border_width_all(2)
		b.add_theme_stylebox_override(state, s)
	var row := Ui.hbox(12)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v := Ui.vbox(2)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_child(Ui.title(I18n.t("Pedras do Choshen"), 24, Ui.ON))
	v.add_child(Ui.label(I18n.t("Forme trios com as pedras do peitoral em 60 fases."), 15, Color("#F6D4DE"), "medium"))
	for l in v.get_children():
		(l as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(v)
	# Três pedras em leque, à direita.
	var gems := Control.new()
	gems.custom_minimum_size = Vector2(76, 60)
	gems.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	gems.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for i in 3:
		var g := StoneIcon.new([0, 4, 2][i], 36)
		g.position = Vector2(i * 20, 16 if i == 1 else 4)
		gems.add_child(g)
	row.add_child(gems)
	var m := Ui.margin(row, 18, 10, 14, 14)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	# O texto pode quebrar em duas linhas: o botão cresce junto.
	var fit := func(): b.custom_minimum_size.y = maxf(96.0, m.get_combined_minimum_size().y)
	m.minimum_size_changed.connect(fit)
	fit.call_deferred()
	b.pressed.connect(func():
		Sfx.play("power", 0.6)
		Main.instance.go("puzzle"))
	Ui.mark("choshen", b)
	return b


## Ranking e perfil, lado a lado; e o que ainda não chegou a esta versão.
func _more() -> Control:
	var v := Ui.vbox(12)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	for item in [["Ranking", Ui.GOLD, "ranking"], ["Seu perfil", Ui.TEKHELET, "profile"]]:
		var b := Button.new()
		b.custom_minimum_size.y = 76
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		for state in ["normal", "hover", "pressed", "hover_pressed", "focus"]:
			var st := Ui.box(Ui.RAISED if state != "hover" else Ui.RAISED.lightened(0.06), 18, Ui.LINE, 1, 14)
			st.border_width_bottom = 4 if state not in ["pressed", "hover_pressed"] else 1
			st.border_color = Color("#151B45")
			if state == "focus":
				st.draw_center = false
				st.border_color = Ui.TEKHELET
				st.set_border_width_all(2)
			b.add_theme_stylebox_override(state, st)
		var col := Ui.vbox(8)
		col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.alignment = BoxContainer.ALIGNMENT_CENTER
		var dot := ColorRect.new()
		dot.color = item[1]
		dot.custom_minimum_size = Vector2(26, 4)
		dot.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(dot)
		var l := Ui.label(I18n.t(item[0]), 18, Ui.ON, "bold")
		l.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(l)
		var mm := Ui.margin(col, 16, 10, 16, 12)
		mm.mouse_filter = Control.MOUSE_FILTER_IGNORE
		mm.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		b.add_child(mm)
		var route: String = item[2]
		b.pressed.connect(func(): Main.instance.go(route))
		_more_buttons.append(b)
		grid.add_child(b)
	v.add_child(grid)
	return v


func _language_row() -> Control:
	var row := Ui.hbox(8)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	var l := Ui.label(I18n.t("Idioma"), 14, Ui.MUTED, "medium")
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	l.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	row.add_child(l)
	for loc in I18n.LOCALES:
		var b := Ui.button(I18n.NATIVE_NAMES[loc], "velvet" if loc == I18n.locale else "ghost", "sm")
		b.pressed.connect(func():
			if loc == I18n.locale:
				return
			I18n.set_locale(loc)
			await Api.set_locale(loc)
			Main.instance.go("home"))
		row.add_child(b)
	return row


func _load() -> void:
	Economy.refresh()
	var me := await Api.me()
	if not is_inside_tree():
		return
	if me.ok:
		var d: Dictionary = me.data
		_header_name.text = I18n.t("Shalom, {name}", {"name": str(d.get("displayName", ""))})
		(_points.get_child(0) as Label).text = Ui.points_label(int(d.get("totalPoints", 0)))
	var r := await Api.games()
	if not is_inside_tree():
		return
	for c in _games_box.get_children():
		c.queue_free()
	if not r.ok:
		_games_box.add_child(Ui.label(r.message, 15, Ui.ERROR))
		var again := Ui.button(I18n.t("Tentar de novo"), "velvet", "sm")
		again.pressed.connect(_load)
		_games_box.add_child(again)
		return
	var list: Array = r.data
	var active := list.filter(func(g): return g.status == "active" or g.status == "waiting_opponent")
	var done := list.filter(func(g): return g.status == "finished" or g.status == "abandoned").slice(0, 5)
	if active.is_empty() and done.is_empty():
		_games_box.add_child(Ui.label(I18n.t("Nenhuma partida ainda. Comece um treino para conhecer o sevivon."), 15, Ui.MUTED))
	for g in active + done:
		_games_box.add_child(_game_row(g))
	print("HOME_READY")
	for i in _buttons.size():
		Ui.mark(["solo", "random", "friend"][i], _buttons[i])
	Ui.mark("join", _join)
	for b in _more_buttons:
		var n := "home-" + ("ranking" if b == _more_buttons[0] else "profile")
		_scroll_marks[n] = b
		Ui.mark(n, b)


func _game_row(g: Dictionary) -> Control:
	var mine := str(g.get("winnerUserId", "")) == str(Api.user.get("id", ""))
	var opponent := str(g.opponentName) if g.get("opponentName") != null else I18n.t("seu adversário")
	var title := I18n.t("Treino") if g.mode == "solo" else I18n.t("Contra {name}", {"name": opponent})
	var status := ""
	var hot := false
	match str(g.status):
		"active":
			hot = bool(g.isMyTurn)
			status = I18n.t("Sua vez!") if hot else I18n.t("Vez de {name}", {"name": opponent})
		"waiting_opponent":
			status = I18n.t("Aguardando seu amigo entrar") if g.mode == "friend" else I18n.t("Procurando adversário")
		"finished":
			if g.mode == "solo":
				status = I18n.t("Treino encerrado")
			elif g.get("winnerUserId") == null:
				status = I18n.t("Empate")
			elif mine:
				status = I18n.t("Você venceu")
			else:
				status = I18n.t("{name} venceu", {"name": opponent})
		_:
			status = I18n.t("Partida cancelada")
	var b := Button.new()
	b.custom_minimum_size.y = 74
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var face := Ui.RAISED if hot else Ui.VELVET
	for state in ["normal", "hover", "pressed", "hover_pressed", "focus"]:
		var s := Ui.box(face.lightened(0.05) if state.begins_with("hover") else face, 18, Ui.GOLD if hot else Ui.LINE, 1, 14)
		if state == "focus":
			s.border_color = Ui.TEKHELET
			s.set_border_width_all(2)
		b.add_theme_stylebox_override(state, s)
	var row := Ui.hbox(12)
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var texts := Ui.vbox(2)
	texts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	texts.alignment = BoxContainer.ALIGNMENT_CENTER
	texts.add_child(Ui.label(title, 17, Ui.ON, "semibold"))
	var detail := status if g.mode == "solo" else "%s · %s" % [status, I18n.t("{mine} selos seus, {theirs} do adversário", {"mine": int(g.mySeals), "theirs": int(g.opponentSeals)})]
	texts.add_child(Ui.label(detail, 14, Ui.GOLD if hot else Ui.MUTED, "medium"))
	for l in texts.get_children():
		(l as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(texts)
	b.add_child(Ui.margin(row, 16, 8, 16, 8))
	(b.get_child(0) as Control).set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	(b.get_child(0) as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.pressed.connect(func():
		Sfx.play("pop", 0.5)
		Main.instance.go("game", {"id": str(g.id)}))
	return b


func _busy(on: bool, text := "") -> void:
	for b in _buttons:
		b.disabled = on
	_status.visible = text != ""
	_status.text = text


func _create(mode: String) -> void:
	_busy(true, I18n.t("Carregando…"))
	# Antes do sevivon, o servidor prepara perguntas no idioma do jogador.
	var deadline := Time.get_ticks_msec() + 5 * 60_000
	var prep := await Api.prepare()
	while prep.ok and str(prep.data.status) == "preparing" and Time.get_ticks_msec() < deadline:
		_busy(true, I18n.t("Preparando as perguntas no seu idioma… {done} de {total}", {"done": int(prep.data.done), "total": int(prep.data.total)}))
		await get_tree().create_timer(1.2).timeout
		if not is_inside_tree():
			return
		prep = await Api.prepare()
	if not prep.ok:
		_busy(false, prep.message)
		return
	if str(prep.data.status) == "unavailable":
		_busy(false, I18n.t("Ainda não há perguntas neste idioma."))
		return
	var r := await Api.game_create(mode)
	if not r.ok:
		_busy(false, r.message)
		return
	Main.instance.go("game", {"id": str(r.data.id), "state": r.data})
