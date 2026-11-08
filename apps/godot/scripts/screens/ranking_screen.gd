## Ranking (porte de app/ranking.tsx): os pontos da semana (desde segunda) ou de sempre. Se
## o jogador não está entre os primeiros, a linha dele aparece embaixo, à parte.
class_name RankingScreen
extends Control

const PERIODS := [["week", "Esta semana"], ["all", "Geral"]]

var _period := "week"
var _tabs := Ui.hbox(4)
var _note: Label
var _list := Ui.vbox(14)


func _ready() -> void:
	var content := Ui.vbox(14)
	add_child(Column.scrolling(Ui.margin(content, 0, 14, 0, 32)))
	var top := Ui.hbox(10)
	var back := Ui.button(I18n.t("Voltar"), "ghost", "sm")
	back.pressed.connect(func(): Main.instance.go("home"))
	top.add_child(back)
	Ui.mark("ranking-back", back)
	var title := Ui.title(I18n.t("Ranking"), 26)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	top.add_child(title)
	content.add_child(top)
	var tabs_box := PanelContainer.new()
	tabs_box.add_theme_stylebox_override("panel", Ui.box(Color(0, 0, 0, 0.25), 999, Color.TRANSPARENT, 0, 4))
	tabs_box.add_child(_tabs)
	content.add_child(tabs_box)
	_note = Ui.label("", 14, Ui.MUTED)
	content.add_child(_note)
	content.add_child(_list)
	_select("week")


func _select(period: String) -> void:
	_period = period
	for c in _tabs.get_children():
		c.queue_free()
	for p in PERIODS:
		var on: bool = p[0] == period
		var b := Ui.button(I18n.t(p[1]), "velvet" if on else "ghost", "sm")
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if not on:
			for st in ["normal", "hover", "pressed", "focus"]:
				var s := b.get_theme_stylebox(st).duplicate() as StyleBoxFlat
				if s and st != "focus":
					s.border_color = Color.TRANSPARENT
					b.add_theme_stylebox_override(st, s)
			b.add_theme_color_override("font_color", Ui.MUTED)
		var id: String = p[0]
		b.pressed.connect(func():
			if id != _period:
				Sfx.play("dot", 0.5)
				_select(id))
		Ui.mark("ranking-" + id, b)
		_tabs.add_child(b)
	_note.text = I18n.t("Pontos desde segunda-feira. O ranking da semana recomeça toda segunda.") if period == "week" else I18n.t("Todos os pontos desde que você começou a jogar.")
	_load()


func _load() -> void:
	for c in _list.get_children():
		c.queue_free()
	_list.add_child(Ui.label(I18n.t("Carregando…"), 16, Ui.MUTED))
	var asked := _period
	var r := await Api.ranking(asked)
	if not is_inside_tree() or asked != _period:
		return
	for c in _list.get_children():
		c.queue_free()
	if not r.ok:
		_list.add_child(Ui.label(str(r.message), 15, Ui.ERROR))
		var again := Ui.button(I18n.t("Tentar de novo"), "velvet", "sm")
		again.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		again.pressed.connect(_load)
		_list.add_child(again)
		return
	var entries: Array = r.data.entries
	var me: Variant = r.data.get("me")
	var my_id := str(Api.user.get("id", ""))
	if entries.is_empty():
		_list.add_child(Ui.label(I18n.t("Ninguém pontuou esta semana. Jogue uma partida e apareça aqui.") if _period == "week" else I18n.t("Ninguém pontuou ainda. Jogue uma partida e apareça aqui."), 16, Ui.MUTED))
	else:
		_list.add_child(_card(entries, my_id))
	var listed := entries.any(func(e): return str(e.userId) == my_id)
	if me is Dictionary and not listed:
		_list.add_child(_card([me], my_id))
	print("RANKING_READY period=%s entries=%d" % [_period, entries.size()])


func _card(entries: Array, my_id: String) -> Control:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Ui.box(Ui.VELVET, 20, Ui.LINE, 1, 0))
	panel.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	var v := Ui.vbox(0)
	panel.add_child(v)
	for i in entries.size():
		var e: Dictionary = entries[i]
		v.add_child(_row(e, str(e.userId) == my_id, i < entries.size() - 1))
	return panel


func _row(e: Dictionary, mine: bool, line: bool) -> Control:
	var pos := int(e.position)
	var p := PanelContainer.new()
	var s := Ui.box(Color(Ui.TEKHELET, 0.16) if mine else Color.TRANSPARENT, 0, Color(Ui.LINE, 0.8), 0, 0)
	if line:
		s.border_width_bottom = 1
	s.content_margin_left = 16
	s.content_margin_right = 16
	s.content_margin_top = 12
	s.content_margin_bottom = 12
	p.add_theme_stylebox_override("panel", s)
	var row := Ui.hbox(12)
	p.add_child(row)
	row.add_child(_Medal.new(pos))
	var name := Ui.label(I18n.t("{name} (você)", {"name": str(e.displayName)}) if mine else str(e.displayName), 16, Ui.ON, "bold" if mine else "regular")
	name.autowrap_mode = TextServer.AUTOWRAP_OFF
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name.clip_text = true
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(name)
	var pts := Ui.label(I18n.number(int(e.points)), 16, Ui.GOLD if pos <= 3 else Ui.ON, "bold")
	pts.autowrap_mode = TextServer.AUTOWRAP_OFF
	pts.size_flags_horizontal = Control.SIZE_SHRINK_END
	pts.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(pts)
	p.tooltip_text = I18n.t("{position}º lugar, {name}, {points} pontos", {"position": pos, "name": I18n.t("você") if mine else str(e.displayName), "points": I18n.number(int(e.points))})
	return p


## A posição: os três primeiros num disco de ouro, prata e bronze.
class _Medal:
	extends Control
	var pos := 0

	func _init(p: int) -> void:
		pos = p
		custom_minimum_size = Vector2(36, 32)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size / 2.0
		var font: Font = Ui.fonts.get("bold", get_theme_default_font())
		var text := str(pos)
		var fs := 16 if pos < 100 else 13
		var color := Ui.MUTED
		if pos <= 3:
			var face: Color = [Ui.GOLD, Color("#C9D2E3"), Color("#D08A55")][pos - 1]
			draw_circle(c + Vector2(0, 2), 15, face.darkened(0.35), true, -1.0, true)
			draw_circle(c, 15, face, true, -1.0, true)
			color = Ui.ON_GOLD
		var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string(font, Vector2(c.x - w / 2.0, c.y + fs * 0.36), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, color)
