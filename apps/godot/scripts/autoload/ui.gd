## Visual "tekhelet e klaf" (o mesmo da Fase 13): cores, fontes, tema e peças de interface.
##
## - Noite azul-violeta no fundo; tekhelet para seleção, foco e progresso.
## - Dourado só na ação principal e nos prêmios; pergaminho (klaf) só no texto das fontes.
## - Frank Ruhl Libre Black nos títulos e números grandes; Rubik no resto.
## - Botões com "lábio" (a borda de baixo mais escura) que afunda ao tocar.
extends Node

# Noite
const NIGHT := Color("#12183D")
const VELVET := Color("#1B2350")
const RAISED := Color("#252F66")
const LINE := Color("#36418A")
const ON := Color("#F6F7FF")
const MUTED := Color("#A8B1DA")
# Destaques
const TEKHELET := Color("#7C88FF")
const GOLD := Color("#F0BE4E")
const GOLD_DEEP := Color("#C38F25")
const ON_GOLD := Color("#261A05")
const KLAF := Color("#F4EAD3")
const KLAF_EDGE := Color("#DCCBA4")
const INK := Color("#2A2117")
const INK_MUTED := Color("#6E5E45")
const LINK := Color("#3640A6")
const EMERALD := Color("#3DBB86")
const EMERALD_DEEP := Color("#23875E")
const RUBY := Color("#EF5B6E")
const RUBY_DEEP := Color("#B8324A")
const ERROR := Color("#FFB4AB")

## As 6 categorias (packages/shared/src/categories.ts), na ordem de WHEEL_SLICES.
const CATEGORIES := {
	"torah": {"pt": "Torá", "color": Color("#B4233F"), "on": Color("#FFFFFF"), "word": "תורה"},
	"neviim_ketuvim": {"pt": "Profetas e Escritos", "color": Color("#6B45C2"), "on": Color("#FFFFFF"), "word": "נ״ך"},
	"mishnah": {"pt": "Mishná", "color": Color("#0F7E73"), "on": Color("#FFFFFF"), "word": "משנה"},
	"talmud": {"pt": "Talmud", "color": Color("#D9822B"), "on": Color("#18203A"), "word": "תלמוד"},
	"halakhah": {"pt": "Halachá", "color": Color("#2E7D3A"), "on": Color("#FFFFFF"), "word": "הלכה"},
	"midrash_aggadah": {"pt": "Midrash e Agadá", "color": Color("#2774C0"), "on": Color("#FFFFFF"), "word": "מדרש"},
}
const WHEEL_SLICES: Array[String] = ["torah", "neviim_ketuvim", "mishnah", "talmud", "halakhah", "midrash_aggadah", "crown", "prize"]
const CROWN_COLOR := Color("#E8B830")
const PRIZE_COLOR := Color("#F4ECDD")
const PRIZE_ON := Color("#8E1F2F")
const DIFFICULTY := {"easy": "Fácil", "medium": "Médio", "hard": "Difícil", "expert": "Especialista"}
const MODES := {"solo": "Treino", "random": "Adversário aleatório", "friend": "Partida com amigo"}
const CROWN_STREAK := 3

var fonts := {}
var theme: Theme


func _ready() -> void:
	fonts = {
		"regular": _font("Rubik_400Regular"),
		"medium": _font("Rubik_500Medium"),
		"semibold": _font("Rubik_600SemiBold"),
		"bold": _font("Rubik_700Bold"),
		"display": _spaced(_font("FrankRuhlLibre_900Black"), 4),
		"serif": _font("FrankRuhlLibre_700Bold"),
	}
	# A Rubik não tem todos os sinais de vocalização do hebraico (a Frank Ruhl cobre) e
	# nenhuma das duas tem os de cantilação, os teamim (a Noto Serif Hebrew cobre).
	# Setas, estrelas e outros símbolos (→ ★ ✓) que nenhuma das três tem: DejaVu Sans.
	var noto := _font("NotoSerifHebrew-Medium")
	var symbols := _font("DejaVuSans-Symbols")
	for k in ["regular", "medium", "semibold", "bold"]:
		(fonts[k] as FontFile).fallbacks = [fonts.serif, noto, symbols]
	(fonts.serif as FontFile).fallbacks = [noto, symbols]
	((fonts.display as FontVariation).base_font as FontFile).fallbacks = [noto, symbols]
	theme = _build_theme()


## A Frank Ruhl Black tem o espaço estreito demais nos títulos: abre um pouco.
func _spaced(base: Font, space: int) -> FontVariation:
	var v := FontVariation.new()
	v.base_font = base
	v.spacing_space = space
	return v


func _font(file: String) -> FontFile:
	var f: FontFile = load("res://assets/fonts/%s.ttf" % file)
	f.antialiasing = TextServer.FONT_ANTIALIASING_GRAY
	f.hinting = TextServer.HINTING_LIGHT
	f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_AUTO
	f.oversampling = 2.0
	return f


func category_name(id: String) -> String:
	if CATEGORIES.has(id):
		return I18n.t(CATEGORIES[id].pt)
	return ""


func points_label(points: int) -> String:
	return I18n.tn(points, "{n} ponto", "{n} pontos")


# --- Tema -------------------------------------------------------------------------------


func box(bg: Color, r := 20, border := Color.TRANSPARENT, bw := 0, pad := 16) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(r)
	s.corner_detail = 10
	s.anti_aliasing = true
	if bw > 0:
		s.border_color = border
		s.set_border_width_all(bw)
	s.set_content_margin_all(pad)
	return s


func _build_theme() -> Theme:
	var t := Theme.new()
	t.default_font = fonts.regular
	t.default_font_size = 17
	t.set_color("font_color", "Label", ON)
	t.set_constant("line_spacing", "Label", 3)
	# Campo de texto: painel elevado com foco em tekhelet.
	var edit := box(RAISED, 14, LINE, 1, 14)
	var edit_focus := box(RAISED, 14, TEKHELET, 2, 14)
	t.set_stylebox("normal", "LineEdit", edit)
	t.set_stylebox("focus", "LineEdit", edit_focus)
	t.set_stylebox("read_only", "LineEdit", edit)
	t.set_color("font_color", "LineEdit", ON)
	t.set_color("font_placeholder_color", "LineEdit", MUTED)
	t.set_color("caret_color", "LineEdit", GOLD)
	t.set_color("selection_color", "LineEdit", Color(TEKHELET, 0.45))
	t.set_font_size("font_size", "LineEdit", 18)
	# Barras de rolagem finas.
	var grab := box(Color(1, 1, 1, 0.18), 4, Color.TRANSPARENT, 0, 2)
	var clear := StyleBoxEmpty.new()
	for sb in ["VScrollBar", "HScrollBar"]:
		t.set_stylebox("scroll", sb, clear)
		t.set_stylebox("grabber", sb, grab)
		t.set_stylebox("grabber_highlight", sb, grab)
		t.set_stylebox("grabber_pressed", sb, grab)
	t.set_stylebox("panel", "PanelContainer", StyleBoxEmpty.new())
	return t


# --- Peças ------------------------------------------------------------------------------


func label(text: String, size := 17, color := ON, kind := "regular", align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", fonts[kind])
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.horizontal_alignment = align
	l.text_direction = Control.TEXT_DIRECTION_AUTO
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l


## Texto em hebraico (citações, contexto): da direita para a esquerda e alinhado à direita.
func hebrew(l: Label) -> Label:
	l.text_direction = Control.TEXT_DIRECTION_RTL
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT if I18n.rtl() else HORIZONTAL_ALIGNMENT_RIGHT
	return l


func title(text: String, size := 30, color := ON, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := label(text, size, color, "display", align)
	l.add_theme_constant_override("line_spacing", -2)
	return l


const BUTTON_LOOKS := {
	"gold": {"face": GOLD, "lip": GOLD_DEEP, "text": ON_GOLD, "border": Color.TRANSPARENT},
	"velvet": {"face": RAISED, "lip": Color("#151B45"), "text": ON, "border": LINE},
	"emerald": {"face": EMERALD, "lip": EMERALD_DEEP, "text": Color("#04261A"), "border": Color.TRANSPARENT},
	"ghost": {"face": Color(1, 1, 1, 0.0), "lip": Color(1, 1, 1, 0.0), "text": ON, "border": LINE},
}


## Botão com lábio: a face fica 3 px acima da borda de baixo e afunda ao tocar.
func button(text: String, variant := "gold", size := "md", wrap := false) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_ALL
	# Sem corte de texto: com ele, o Godot deixa a largura mínima do botão sem o texto.
	b.autowrap_mode = TextServer.AUTOWRAP_WORD if wrap else TextServer.AUTOWRAP_OFF
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	style_button(b, variant, size)
	b.button_down.connect(func(): Sfx.play("pop", 0.5))
	return b


func style_button(b: Button, variant: String, size := "md") -> void:
	var look: Dictionary = BUTTON_LOOKS[variant]
	var lip := 4 if size == "lg" else 3
	var h: int = {"sm": 44, "md": 54, "lg": 64}[size]
	var pad_x: int = {"sm": 14, "md": 20, "lg": 24}[size]
	var font_size: int = {"sm": 15, "md": 18, "lg": 21}[size]
	var r := 16
	var mk := func(face: Color, pressed: bool) -> StyleBoxFlat:
		var s := StyleBoxFlat.new()
		s.bg_color = face
		s.set_corner_radius_all(r)
		s.corner_detail = 10
		s.anti_aliasing = true
		s.content_margin_left = pad_x
		s.content_margin_right = pad_x
		if pressed:
			# A face desce até a borda de baixo (o lábio some).
			s.expand_margin_top = -lip
			s.content_margin_top = 8 + lip
			s.content_margin_bottom = 8
		else:
			s.border_color = look.lip
			s.border_width_bottom = lip
			s.content_margin_top = 8
			s.content_margin_bottom = 8 + lip
			s.shadow_color = Color(0, 0, 0, 0.28)
			s.shadow_size = 6
			s.shadow_offset = Vector2(0, 3)
		if look.border.a > 0:
			s.border_color = look.border if pressed else look.lip
			s.border_width_left = 1
			s.border_width_right = 1
			s.border_width_top = 1
			if pressed:
				s.border_width_bottom = 1
		return s
	var face: Color = look.face
	b.add_theme_stylebox_override("normal", mk.call(face, false))
	b.add_theme_stylebox_override("hover", mk.call(face.lightened(0.06), false))
	b.add_theme_stylebox_override("pressed", mk.call(face.darkened(0.04), true))
	b.add_theme_stylebox_override("hover_pressed", mk.call(face.darkened(0.04), true))
	var dis: StyleBoxFlat = mk.call(Color(face, 0.45) if face.a > 0 else face, false)
	b.add_theme_stylebox_override("disabled", dis)
	var focus := StyleBoxFlat.new()
	focus.draw_center = false
	focus.border_color = TEKHELET
	focus.set_border_width_all(2)
	focus.set_corner_radius_all(r + 3)
	focus.expand_margin_left = 3
	focus.expand_margin_right = 3
	focus.expand_margin_top = 3
	focus.expand_margin_bottom = 3
	b.add_theme_stylebox_override("focus", focus)
	b.add_theme_font_override("font", fonts.semibold)
	b.add_theme_font_size_override("font_size", font_size)
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(c, look.text)
	b.add_theme_color_override("font_disabled_color", Color(look.text, 0.55))
	b.custom_minimum_size.y = h


## Painel da noite: fio fino em volta e a borda de cima mais clara.
func panel(bg := VELVET, r := 20, pad := 16, border := LINE) -> PanelContainer:
	var p := PanelContainer.new()
	var s := box(bg, r, border, 1, pad)
	s.border_color = border
	p.add_theme_stylebox_override("panel", s)
	return p


func vbox(sep := 12) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	return v


func hbox(sep := 12) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h


func margin(node: Control, l := 16, t := 16, r := 16, b := 16) -> MarginContainer:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", l)
	m.add_theme_constant_override("margin_top", t)
	m.add_theme_constant_override("margin_right", r)
	m.add_theme_constant_override("margin_bottom", b)
	m.add_child(node)
	return m


## Etiqueta arredondada (contorno colorido).
func pill(text: String, color := GOLD, size := 13) -> PanelContainer:
	var p := PanelContainer.new()
	var s := box(Color(color, 0.12), 999, color, 1, 0)
	s.content_margin_left = 10
	s.content_margin_right = 10
	s.content_margin_top = 3
	s.content_margin_bottom = 4
	p.add_theme_stylebox_override("panel", s)
	var l := label(text, size, color, "semibold")
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	l.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	p.add_child(l)
	p.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	return p


## Entrada com mola (aparece crescendo um pouco além e assenta).
func pop_in(node: CanvasItem, delay := 0.0) -> void:
	if node is Control:
		var c := node as Control
		c.pivot_offset = c.size / 2.0
	node.modulate.a = 0.0
	node.scale = Vector2(0.92, 0.92)
	var tw := node.create_tween().set_parallel(true)
	tw.tween_property(node, "modulate:a", 1.0, 0.22).set_delay(delay)
	tw.tween_property(node, "scale", Vector2.ONE, 0.45).set_delay(delay).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## Aparece aos poucos (para as peças de uma tela, uma depois da outra).
func fade_in(node: CanvasItem, delay := 0.0, duration := 0.3) -> void:
	node.modulate.a = 0.0
	node.create_tween().tween_property(node, "modulate:a", 1.0, duration).set_delay(delay)


## Para os testes no navegador: escreve no console "MARK nome x y" com o centro do controle
## (o Godot desenha tudo num canvas, sem elementos para o robô de teste encontrar).
## Repete os marcadores quando a página rola (os pontos na tela mudam).
func mark_on_scroll(scroll: ScrollContainer, names: Dictionary) -> void:
	if not OS.has_feature("web"):
		return
	scroll.get_v_scroll_bar().value_changed.connect(func(_v):
		await get_tree().process_frame
		for n in names:
			var node: Control = names[n]
			if is_instance_valid(node) and node.is_inside_tree() and node.is_visible_in_tree():
				var c := node.get_global_rect().get_center()
				print("MARK %s %d %d" % [n, roundi(c.x), roundi(c.y)]))


func mark(name: String, node: Control) -> void:
	if not OS.has_feature("web"):
		return
	# Depois das animações de entrada (a folha que sobe, o esmaecimento).
	await get_tree().create_timer(0.45).timeout
	if is_instance_valid(node) and node.is_inside_tree():
		var c := node.get_global_rect().get_center()
		print("MARK %s %d %d" % [name, roundi(c.x), roundi(c.y)])
