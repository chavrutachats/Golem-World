## Seu perfil (porte de app/profile.tsx): o nome no jogo, os números do jogador, criar conta
## (o convidado vira conta com e-mail e senha, sem perder nada), idioma, sons e sair.
## As regras do nome e da senha são conferidas pela API, que responde no idioma do jogador.
class_name ProfileScreen
extends Control

var _content := Ui.vbox(14)
var _name := Form.new("")
var _save: Button
var _stats := Ui.vbox(0)
var _account := Ui.vbox(12)
var me: Dictionary = {}
var _scroll: ScrollContainer
## Marcadores para os testes no navegador (repetidos quando a página rola).
var _marks := {}


func _ready() -> void:
	_scroll = Column.scrolling(Ui.margin(_content, 0, 14, 0, 40))
	add_child(_scroll)
	Ui.mark_on_scroll(_scroll, _marks)
	var top := Ui.hbox(10)
	var back := Ui.button(I18n.t("Voltar"), "ghost", "sm")
	back.pressed.connect(func(): Main.instance.go("home"))
	top.add_child(back)
	var title := Ui.title(I18n.t("Seu perfil"), 26)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	top.add_child(title)
	_content.add_child(top)

	_name = Form.new(I18n.t("Seu nome no jogo"))
	_name.edit.max_length = 24
	_name.text = str(Api.user.get("displayName", ""))
	_name.edit.text_changed.connect(func(_t):
		_name.set_error("")
		_save.disabled = _name.text.strip_edges() == str(Api.user.get("displayName", "")))
	_name.edit.text_submitted.connect(func(_t): _rename())
	_content.add_child(_name)
	_save = Ui.button(I18n.t("Salvar nome"), "velvet")
	_save.disabled = true
	_save.pressed.connect(_rename)
	_content.add_child(_save)
	_mark("profile-name", _name.edit)
	_mark("profile-save", _save)

	_content.add_child(_heading(I18n.t("Seu jogo")))
	var card := Ui.panel(Ui.VELVET, 20, 0)
	card.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	card.add_child(_stats)
	_content.add_child(card)
	_fill_stats({})
	_content.add_child(_account)
	_content.add_child(_language())
	_content.add_child(_sound())
	_content.add_child(_heading(I18n.t("Sobre as perguntas")))
	_content.add_child(Ui.label(I18n.t("As perguntas saem dos textos do acervo aberto do Sefaria, cada um com sua própria licença. Depois de responder, você vê o trecho que comprova a resposta e pode denunciar qualquer problema. Quando o Sefaria não tem tradução com licença aberta no seu idioma, o texto é traduzido automaticamente a partir do original, e a fonte avisa. Este app não é um produto do Sefaria."), 15, Ui.MUTED))
	var security := Ui.button(I18n.t("Conta e segurança"), "velvet")
	security.pressed.connect(func(): Main.instance.go("account"))
	_content.add_child(Control.new())
	_content.add_child(security)
	_mark("profile-account", security)
	var out := Ui.button(I18n.t("Sair da conta"), "ghost")
	out.add_theme_color_override("font_color", Ui.RUBY)
	out.pressed.connect(_logout)
	_content.add_child(out)
	_mark("profile-logout", out)
	_load()


func _mark(name: String, node: Control) -> void:
	_marks[name] = node
	Ui.mark(name, node)


func _heading(text: String) -> Label:
	var l := Ui.title(text, 22)
	l.custom_minimum_size.y = 40
	l.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	return l


func _load() -> void:
	var r := await Api.me()
	if not is_inside_tree():
		return
	if r.ok:
		me = r.data
		Api.user.merge({"displayName": me.displayName, "isGuest": me.isGuest, "totalPoints": me.totalPoints}, true)
		_fill_stats(me)
	_fill_account()
	print("PROFILE_READY guest=%s" % str(Api.user.get("isGuest", true)))


func _fill_stats(d: Dictionary) -> void:
	for c in _stats.get_children():
		c.queue_free()
	var s: Dictionary = d.get("stats", {})
	var has := not s.is_empty()
	var answered := int(s.get("answered", 0))
	var rows := [
		["Pontos", I18n.number(int(d.get("totalPoints", Api.user.get("totalPoints", 0))))],
		["Partidas terminadas", I18n.number(int(s.gamesPlayed)) if has else "–"],
		["Vitórias", I18n.number(int(s.wins)) if has else "–"],
		["Perguntas respondidas", I18n.number(answered) if has else "–"],
		["Acertos", ("%d%%" % roundi(100.0 * int(s.correct) / answered)) if has and answered > 0 else "–"],
	]
	for i in rows.size():
		var p := PanelContainer.new()
		var st := Ui.box(Color.TRANSPARENT, 0, Color(Ui.LINE, 0.8), 0, 0)
		if i < rows.size() - 1:
			st.border_width_bottom = 1
		st.content_margin_left = 16
		st.content_margin_right = 16
		st.content_margin_top = 12
		st.content_margin_bottom = 12
		p.add_theme_stylebox_override("panel", st)
		var row := Ui.hbox(10)
		var l := Ui.label(I18n.t(rows[i][0]), 16, Ui.ON)
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(l)
		var v := Ui.label(rows[i][1], 16, Ui.GOLD if i == 0 else Ui.ON, "bold")
		v.autowrap_mode = TextServer.AUTOWRAP_OFF
		v.size_flags_horizontal = Control.SIZE_SHRINK_END
		row.add_child(v)
		p.add_child(row)
		_stats.add_child(p)


## Convidado: criar conta. Com conta: o e-mail.
func _fill_account() -> void:
	for c in _account.get_children():
		c.queue_free()
	if bool(Api.user.get("isGuest", true)):
		_account.add_child(_heading(I18n.t("Guarde seu progresso")))
		_account.add_child(Ui.label(I18n.t("Com uma conta, você joga em outro aparelho sem perder seus pontos e partidas."), 15, Ui.MUTED))
		var social := await Social.available()
		if not is_inside_tree():
			return
		if not social.is_empty():
			_account.add_child(Social.buttons(social, true, "profile"))
			_account.add_child(Ui.label(I18n.t("ou com e-mail e senha"), 13, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
		var email := Form.new(I18n.t("E-mail"))
		email.edit.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_EMAIL_ADDRESS
		_account.add_child(email)
		var password := Form.new(I18n.t("Senha"), true, I18n.t("Pelo menos {n} caracteres. Uma frase com algumas palavras é fácil de lembrar e difícil de adivinhar.", {"n": 12}))
		password.edit.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_PASSWORD
		_account.add_child(password)
		var create := Ui.button(I18n.t("Criar conta"), "gold")
		_account.add_child(create)
		var submit := func():
			if email.text.strip_edges() == "":
				password.set_error(I18n.t("Informe um e-mail."))
				return
			create.disabled = true
			password.set_error("")
			var r := await Api.register(email.text, password.text, str(Api.user.get("displayName", "")))
			if not is_inside_tree():
				return
			create.disabled = false
			if not r.ok:
				password.set_error(str(r.message))
				Sfx.play("bump", 0.6)
				return
			Sfx.play("correct", 0.6)
			_load()
		create.pressed.connect(submit)
		password.edit.text_submitted.connect(func(_t): submit.call())
		_mark("profile-email", email.edit)
		_mark("profile-password", password.edit)
		_mark("profile-create", create)
	else:
		if me.get("email") != null:
			_account.add_child(Control.new())
			_account.add_child(Ui.label(I18n.t("Conta: {email}", {"email": str(me.email)}), 15, Ui.MUTED))
		await _connected()


## Contas conectadas: os logins ligados (com "Desconectar") e os que dá para ligar.
func _connected() -> void:
	var linked: Array = me.get("identities", [])
	var social := await Social.available()
	if not is_inside_tree():
		return
	var to_link := social.filter(func(p): return not linked.has(p))
	if linked.is_empty() and to_link.is_empty():
		return
	_account.add_child(_heading(I18n.t("Contas conectadas")))
	_account.add_child(Ui.label(I18n.t("Entre na sua conta com qualquer um destes serviços."), 15, Ui.MUTED))
	for p in linked:
		var panel := Ui.panel(Ui.VELVET, 16, 12)
		var row := Ui.hbox(10)
		panel.add_child(row)
		var name := Ui.label(str(Social.NAMES.get(p, p)), 16, Ui.ON, "bold")
		name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(name)
		var off := Ui.button(I18n.t("Desconectar"), "ghost", "sm")
		var provider: String = p
		off.pressed.connect(func(): _unlink(provider))
		row.add_child(off)
		_account.add_child(panel)
	if not to_link.is_empty():
		_account.add_child(Social.buttons(to_link, true, "profile"))


func _unlink(provider: String) -> void:
	var label: String = Social.NAMES.get(provider, provider)
	var sheet := Sheet.new()
	sheet.body.add_child(Ui.title(I18n.t("Desconectar o login com {provider}?", {"provider": label}), 24))
	sheet.body.add_child(Ui.label(I18n.t("Você deixa de entrar com {provider} nesta conta. Seus pontos e itens continuam aqui.", {"provider": label}), 15, Ui.MUTED))
	var yes := Ui.button(I18n.t("Desconectar"), "gold")
	yes.pressed.connect(func():
		yes.disabled = true
		var r := await Api.unlink(provider)
		sheet.queue_free()
		if r.ok:
			me = r.data
			_fill_account()
		else:
			Economy.notify(str(r.message)))
	sheet.body.add_child(yes)
	var no := Ui.button(I18n.t("Cancelar"), "velvet")
	no.pressed.connect(sheet.queue_free)
	sheet.body.add_child(no)
	add_child(sheet)


func _rename() -> void:
	var name := _name.text.strip_edges()
	if name == str(Api.user.get("displayName", "")):
		return
	_save.disabled = true
	var r := await Api.rename(name)
	if not is_inside_tree():
		return
	if r.ok:
		_name.set_ok(I18n.t("Nome salvo."))
		Sfx.play("correct", 0.5)
	else:
		_name.set_error(str(r.message))
		_save.disabled = false
		Sfx.play("bump", 0.6)


func _language() -> Control:
	var p := Ui.panel(Ui.VELVET, 20, 16)
	var v := Ui.vbox(10)
	p.add_child(v)
	v.add_child(Ui.label(I18n.t("Idioma"), 16, Ui.ON, "bold"))
	var row := Ui.hbox(8)
	for loc in I18n.LOCALES:
		var b := Ui.button(I18n.NATIVE_NAMES[loc], "velvet" if loc == I18n.locale else "ghost", "sm")
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func():
			if loc == I18n.locale:
				return
			I18n.set_locale(loc)
			await Api.set_locale(loc)
			Main.instance.go("profile"))
		row.add_child(b)
	v.add_child(row)
	v.add_child(Ui.label(I18n.t("Vale para os menus e para as perguntas, alternativas e explicações do Golem World e do sevivon."), 13, Ui.MUTED))
	return p


func _sound() -> Control:
	var p := Ui.panel(Ui.VELVET, 20, 16)
	var row := Ui.hbox(12)
	p.add_child(row)
	var v := Ui.vbox(2)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_child(Ui.label(I18n.t("Sons do jogo"), 16, Ui.ON, "bold"))
	v.add_child(Ui.label(I18n.t("Sevivon, acertos e erros."), 13, Ui.MUTED))
	row.add_child(v)
	var sw := _Switch.new()
	sw.button_pressed = not Sfx.muted
	sw.tooltip_text = I18n.t("Sons do jogo")
	sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	sw.toggled.connect(func(on: bool):
		Sfx.set_enabled(on)
		if on:
			Sfx.play("correct", 0.6))
	row.add_child(sw)
	_mark("profile-sound", sw)
	return p


func _logout_text(guest: bool) -> String:
	if guest:
		return I18n.t("Você está jogando como convidado. Se sair sem criar uma conta, não terá como voltar a esta conta e aos seus pontos.")
	var ids: Array = me.get("identities", [])
	if not bool(me.get("hasPassword", true)) and not ids.is_empty():
		var names: PackedStringArray = []
		for p in ids:
			names.append(str(Social.NAMES.get(p, p)))
		return I18n.t("Você pode entrar de novo com: {providers}.", {"providers": ", ".join(names)})
	return I18n.t("Você pode entrar de novo com seu e-mail e senha.")


func _logout() -> void:
	var sheet := Sheet.new()
	sheet.body.add_child(Ui.title(I18n.t("Sair da conta?"), 26))
	var guest := bool(Api.user.get("isGuest", true))
	sheet.body.add_child(Ui.label(_logout_text(guest), 15, Ui.MUTED))
	var yes := Ui.button(I18n.t("Sair"), "gold")
	yes.pressed.connect(func():
		yes.disabled = true
		await Api.logout()
		Main.instance.go("welcome"))
	sheet.body.add_child(yes)
	var no := Ui.button(I18n.t("Cancelar"), "velvet")
	no.pressed.connect(sheet.queue_free)
	sheet.body.add_child(no)
	add_child(sheet)
	Ui.mark("logout-confirm", yes)


## Interruptor liga/desliga: dourado quando ligado.
class _Switch:
	extends Button
	var _k := 0.0

	func _init() -> void:
		toggle_mode = true
		flat = true
		custom_minimum_size = Vector2(56, 34)
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		for st in ["normal", "hover", "pressed", "hover_pressed", "focus"]:
			var s := StyleBoxEmpty.new()
			add_theme_stylebox_override(st, s)
		toggled.connect(func(_on): queue_redraw())

	func _process(dt: float) -> void:
		var target := 1.0 if button_pressed else 0.0
		if absf(_k - target) > 0.001:
			_k = move_toward(_k, target, dt * 8.0)
			queue_redraw()

	func _draw() -> void:
		var r := Rect2(Vector2(2, (size.y - 30) / 2.0), Vector2(52, 30))
		var track := StyleBoxFlat.new()
		track.bg_color = Ui.LINE.lerp(Ui.GOLD, _k)
		track.set_corner_radius_all(15)
		draw_style_box(track, r)
		if has_focus():
			var ring := StyleBoxFlat.new()
			ring.draw_center = false
			ring.border_color = Ui.TEKHELET
			ring.set_border_width_all(2)
			ring.set_corner_radius_all(18)
			draw_style_box(ring, r.grow(3))
		# No hebraico, ligado fica à esquerda (o interruptor espelha com a interface).
		var k := 1.0 - _k if is_layout_rtl() else _k
		var x := lerpf(r.position.x + 15, r.end.x - 15, k)
		draw_circle(Vector2(x, r.get_center().y + 1.5), 12, Color(0, 0, 0, 0.25), true, -1.0, true)
		draw_circle(Vector2(x, r.get_center().y), 12, Color.WHITE, true, -1.0, true)
