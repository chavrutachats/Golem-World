## Folha que sobe do pé da tela, com o fundo escurecido. Tocar fora fecha (`closed`).
class_name Sheet
extends Control

signal closed

var body := Ui.vbox(12)
var _panel := PanelContainer.new()


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0.04, 0.06, 0.16, 0.6)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed:
			closed.emit()
			queue_free())
	add_child(dim)
	var s := Ui.box(Ui.VELVET, 28, Ui.LINE, 1, 22)
	s.corner_radius_bottom_left = 0
	s.corner_radius_bottom_right = 0
	s.border_width_bottom = 0
	s.content_margin_bottom = 34
	_panel.add_theme_stylebox_override("panel", s)
	_panel.add_child(body)
	var col := Column.new(_panel)
	col.side = 0
	col.max_width = 560
	col.anchor_top = 1.0
	col.anchor_bottom = 1.0
	col.anchor_right = 1.0
	col.grow_vertical = Control.GROW_DIRECTION_BEGIN
	add_child(col)
	Ui.fade_in(dim, 0.0, 0.2)
	await get_tree().process_frame
	var h := _panel.size.y
	_panel.position.y += h
	create_tween().tween_property(_panel, "position:y", _panel.position.y - h, 0.32).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
