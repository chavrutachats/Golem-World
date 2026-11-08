## Boas-vindas: o sevivon pairando na mesa, o nome do jogo, o idioma e o nome do jogador.
## "Começar a jogar" cria a conta de convidado (POST /auth/guest) e abre o início.
class_name WelcomeScreen
extends Control

var _name := LineEdit.new()
var _go: Button
var _error: Label


func _ready() -> void:
	var view := SevivonView.new()
	view.anchor_right = 1.0
	view.anchor_bottom = 0.46
	view.stage.frame_shift = 0.3
	add_child(view)
	add_child(_fade(0.30, 0.46))

	var content := Ui.vbox(14)
	var col := Column.new(content)
	col.anchor_top = 0.40
	col.anchor_right = 1.0
	col.anchor_bottom = 1.0
	add_child(col)

	var title := Ui.title(I18n.t("Trivia Torá"), 46, Ui.GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	content.add_child(title)
	content.add_child(Ui.label(I18n.t("Gire o sevivon e responda perguntas sobre Torá, Profetas, Mishná, Talmud, Halachá e Midrash, tiradas direto dos textos."), 16, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	content.add_child(_languages())

	_name.placeholder_text = I18n.t("Seu nome ou apelido")
	_name.max_length = 24
	_name.custom_minimum_size.y = 54
	_name.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name.text_submitted.connect(func(_t): _start())
	content.add_child(_name)

	_go = Ui.button(I18n.t("Começar a jogar"), "gold", "lg")
	_go.pressed.connect(_start)
	content.add_child(_go)
	_error = Ui.label("", 15, Ui.ERROR, "medium", HORIZONTAL_ALIGNMENT_CENTER)
	_error.visible = false
	content.add_child(_error)
	content.add_child(Ui.label(I18n.t("Se deixar em branco, escolhemos um nome para você."), 13, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	var login := Ui.button(I18n.t("Já tenho conta"), "ghost", "sm")
	login.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	login.pressed.connect(func(): Main.instance.go("login"))
	content.add_child(login)
	Ui.mark("login", login)
	_add_social(content, content.get_child_count())
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.add_child(spacer)
	content.add_child(Ui.label(I18n.t("Textos do acervo aberto do Sefaria. Este jogo não é um produto do Sefaria."), 12, Color(Ui.MUTED, 0.8), "regular", HORIZONTAL_ALIGNMENT_CENTER))
	content.add_child(ServerField.new())
	var bottom := Control.new()
	bottom.custom_minimum_size.y = 14
	content.add_child(bottom)
	col.fill_height = true
	for i in content.get_child_count():
		Ui.fade_in(content.get_child(i), 0.08 * i)
	Ui.mark("name", _name)
	Ui.mark("start", _go)
	print("WELCOME_READY disabled=%s" % _go.disabled)


## "Continuar com o Google / Facebook", quando este endereço e o servidor permitem.
func _add_social(content: VBoxContainer, at: int) -> void:
	var social := await Social.available()
	if social.is_empty() or not is_inside_tree():
		return
	var box := Social.buttons(social, false, "home")
	content.add_child(box)
	content.move_child(box, at)


## Degradê do fim da cena 3D para a noite (a mesa "afunda" no fundo da tela).
static func _fade(top: float, bottom: float) -> TextureRect:
	var g := Gradient.new()
	g.set_color(0, Color(Ui.NIGHT, 0.0))
	g.set_color(1, Ui.NIGHT)
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.fill_from = Vector2(0, 0)
	tex.fill_to = Vector2(0, 1)
	tex.width = 4
	tex.height = 64
	var r := TextureRect.new()
	r.texture = tex
	r.stretch_mode = TextureRect.STRETCH_SCALE
	r.anchor_top = top
	r.anchor_bottom = bottom
	r.anchor_right = 1.0
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


func _languages() -> Control:
	var row := Ui.hbox(8)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	for loc in I18n.LOCALES:
		var b := Button.new()
		b.text = I18n.NATIVE_NAMES[loc]
		b.toggle_mode = true
		b.button_pressed = loc == I18n.locale
		var on := loc == I18n.locale
		for state in ["normal", "hover", "pressed", "hover_pressed", "focus"]:
			var s := Ui.box(Color(Ui.TEKHELET, 0.22) if on else Color(0, 0, 0, 0), 999, Ui.TEKHELET if on else Ui.LINE, 1, 0)
			s.content_margin_left = 16
			s.content_margin_right = 16
			s.content_margin_top = 7
			s.content_margin_bottom = 8
			b.add_theme_stylebox_override(state, s)
		b.add_theme_font_override("font", Ui.fonts.semibold if on else Ui.fonts.medium)
		b.add_theme_font_size_override("font_size", 15)
		b.add_theme_color_override("font_color", Ui.ON if on else Ui.MUTED)
		b.add_theme_color_override("font_pressed_color", Ui.ON)
		b.add_theme_color_override("font_hover_color", Ui.ON)
		b.pressed.connect(func():
			if loc != I18n.locale:
				Sfx.play("dot", 0.6)
				I18n.set_locale(loc)
				Main.instance.go("welcome"))
		row.add_child(b)
	return row


func _start() -> void:
	_go.disabled = true
	_go.text = I18n.t("Carregando…")
	_error.visible = false
	var r := await Api.guest(_name.text)
	if r.ok:
		Main.instance.go("home")
		return
	_go.disabled = false
	_go.text = I18n.t("Começar a jogar")
	_error.text = r.message
	_error.visible = true
	Sfx.play("bump", 0.6)
