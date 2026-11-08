## Mapa das Pedras do Choshen (porte de app/puzzle/index.tsx): 60 fases em 6 capítulos, um
## para cada pedra das duas primeiras fileiras do peitoral (Shemot 28:17-18).
class_name PuzzleMapScreen
extends Control

var _content := Ui.vbox(18)
var _chapters := Ui.vbox(18)
var _total: Label
var _scroll: ScrollContainer


func _ready() -> void:
	_scroll = Column.scrolling(Ui.margin(_content, 0, 14, 0, 40))
	add_child(_scroll)
	var top := Ui.hbox(10)
	var back := Ui.button(I18n.t("Voltar"), "ghost", "sm")
	back.pressed.connect(func(): Main.instance.go("home"))
	top.add_child(back)
	var title := Ui.title(I18n.t("Pedras do Choshen"), 22)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	top.add_child(title)
	var star := StoneIcon.new(-2, 22)
	top.add_child(star)
	_total = Ui.label("", 18, Ui.ON, "bold")
	_total.autowrap_mode = TextServer.AUTOWRAP_OFF
	_total.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_total.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	top.add_child(_total)
	_content.add_child(top)
	_content.add_child(_intro())
	_content.add_child(_chapters)
	_chapters.add_child(Ui.label(I18n.t("Carregando…"), 16, Ui.MUTED, "medium", HORIZONTAL_ALIGNMENT_CENTER))
	_load()


func _intro() -> Control:
	var p := Ui.panel(Ui.VELVET, 20, 16)
	var v := Ui.vbox(12)
	p.add_child(v)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 4)
	for i in 6:
		var col := Ui.vbox(2)
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		col.add_child(StoneIcon.new(i, 40))
		var name := Ui.label(PuzzleData.stone_he(i) if I18n.locale == "he" else PuzzleData.stone_name(i), 12, Ui.MUTED, "medium", HORIZONTAL_ALIGNMENT_CENTER)
		name.autowrap_mode = TextServer.AUTOWRAP_OFF
		col.add_child(name)
		row.add_child(col)
	v.add_child(row)
	v.add_child(Ui.label(I18n.t("As pedras das duas primeiras fileiras do peitoral do Kohen Gadol. Forme trios iguais, rache o barro do Golem e cumpra os objetivos antes de acabarem as jogadas."), 15, Ui.ON))
	v.add_child(Ui.label(I18n.t("As cores e as formas são do jogo: as identificações das pedras variam entre os comentaristas."), 13, Ui.MUTED))
	var read := Ui.button(I18n.t("Ler Shemot 28:17-18 no Sefaria"), "ghost", "sm", true)
	read.pressed.connect(func(): OS.shell_open(PuzzleData.SOURCE_URL))
	v.add_child(read)
	return p


func _load() -> void:
	var r := await Api.puzzle_overview()
	if not is_inside_tree():
		return
	for c in _chapters.get_children():
		c.queue_free()
	if not r.ok:
		_chapters.add_child(Ui.label(str(r.message), 15, Ui.ON, "regular", HORIZONTAL_ALIGNMENT_CENTER))
		var again := Ui.button(I18n.t("Tentar de novo"), "gold", "sm")
		again.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		again.pressed.connect(_load)
		_chapters.add_child(again)
		return
	var o: Dictionary = r.data
	_total.text = str(int(o.totalStars))
	var stars := {}
	for l in o.levels:
		stars[int(l.level)] = int(l.stars)
	var unlocked := int(o.unlocked)
	var current_button: Control = null
	for c in PuzzleData.LEVELS / PuzzleData.CHAPTER_SIZE:
		var box := _chapter(c, unlocked, stars)
		_chapters.add_child(box[0])
		if box[1] != null:
			current_button = box[1]
	# Rola até o capítulo da fase atual (do segundo capítulo em diante).
	if current_button != null:
		await get_tree().process_frame
		await get_tree().process_frame
	if current_button != null and unlocked > PuzzleData.CHAPTER_SIZE:
		var y := current_button.get_global_rect().position.y - _scroll.get_global_rect().position.y + _scroll.scroll_vertical
		_scroll.scroll_vertical = maxi(0, int(y - size.y * 0.35))
	if current_button != null:
		Ui.mark("puzzle-current", current_button)


## [painel do capítulo, botão da fase atual ou null].
func _chapter(c: int, unlocked: int, stars: Dictionary) -> Array:
	var color := Color(Stone.COLORS[c][1])
	var panel := PanelContainer.new()
	var s := Ui.box(Ui.VELVET, 20, Ui.LINE, 1, 0)
	s.border_width_left = 0
	s.border_width_right = 0
	panel.add_theme_stylebox_override("panel", s)
	# O fio lateral fica dentro dos cantos arredondados.
	panel.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	var outer := Ui.hbox(0)
	panel.add_child(outer)
	# O fio da pedra do capítulo, na lateral.
	var rule := ColorRect.new()
	rule.color = color
	rule.custom_minimum_size.x = 3
	outer.add_child(rule)
	var v := Ui.vbox(6)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_child(Ui.margin(v, 12, 12, 12, 12))
	(outer.get_child(1) as Control).size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var head := Ui.hbox(10)
	head.add_child(StoneIcon.new(c, 34))
	var names := Ui.vbox(0)
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	names.add_child(Ui.label(I18n.t("Capítulo {n}: {name}", {"n": c + 1, "name": PuzzleData.stone_name(c)}), 17, Ui.ON, "bold"))
	if I18n.locale != "he":
		var he := Ui.hebrew(Ui.label(PuzzleData.stone_he(c), 13, Ui.MUTED))
		he.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		names.add_child(he)
	head.add_child(names)
	v.add_child(head)
	var grid := GridContainer.new()
	grid.columns = 5
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	var current: Control = null
	for i in PuzzleData.CHAPTER_SIZE:
		var n := c * PuzzleData.CHAPTER_SIZE + i + 1
		var st := int(stars.get(n, 0))
		var b := _LevelButton.new(n, st, n > unlocked, n == unlocked and st == 0)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if n <= unlocked:
			b.pressed.connect(func():
				Sfx.play("pop", 0.6)
				Main.instance.go("puzzle_level", {"level": n}))
		if n == unlocked:
			current = b
		grid.add_child(b)
	v.add_child(grid)
	return [panel, current]


## Botão de fase: o número e três estrelas; fechada, um cadeado.
class _LevelButton:
	extends Button
	var level := 0
	var stars := 0
	var locked := false
	var current := false

	func _init(n: int, s: int, l: bool, cur: bool) -> void:
		level = n
		stars = s
		locked = l
		current = cur
		custom_minimum_size = Vector2(54, 60)
		disabled = locked
		focus_mode = Control.FOCUS_NONE if locked else Control.FOCUS_ALL
		mouse_default_cursor_shape = Control.CURSOR_ARROW if locked else Control.CURSOR_POINTING_HAND
		tooltip_text = I18n.t("Fase {n}, fechada", {"n": n}) if locked else I18n.t("Fase {n}, {s} de 3 estrelas", {"n": n, "s": s})
		for state in ["normal", "hover", "pressed", "hover_pressed", "disabled", "focus"]:
			var face: Color = Color(1, 1, 1, 0.04) if locked else (Ui.GOLD if current else Color("#2A3570"))
			if state == "hover" and not locked:
				face = face.lightened(0.08)
			var st := Ui.box(face, 14, Color(1, 1, 1, 0.1) if locked else (Ui.GOLD if current else Ui.LINE), 1, 0)
			if not locked:
				st.border_width_bottom = 4 if state not in ["pressed", "hover_pressed"] else 1
				st.border_color = Ui.GOLD_DEEP if current else Color("#0C1130")
			if state == "focus":
				st.draw_center = false
				st.border_color = Ui.TEKHELET
				st.set_border_width_all(2)
			add_theme_stylebox_override(state, st)

	func _draw() -> void:
		var c := size / 2.0
		if locked:
			# Cadeado.
			var body := Rect2(c + Vector2(-8, -3), Vector2(16, 12))
			draw_arc(c + Vector2(0, -4), 5.5, PI, TAU, 16, Color(1, 1, 1, 0.32), 2.5, true)
			var st := StyleBoxFlat.new()
			st.bg_color = Color(1, 1, 1, 0.32)
			st.set_corner_radius_all(3)
			draw_style_box(st, body)
			return
		var font: Font = Ui.fonts.get("bold", get_theme_default_font())
		var text := I18n.number(level)
		var fs := 22
		var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string(font, Vector2(c.x - w / 2.0, c.y + 2), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Ui.ON_GOLD if current else Ui.ON)
		for i in 3:
			StoneIcon.draw_star(self, Vector2(c.x + (i - 1) * 12.0, c.y + 15), 5.5, i >= stars)
