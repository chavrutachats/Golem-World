## Coluna centralizada com largura máxima: no celular ocupa a tela (menos as margens);
## no tablet e no computador o jogo fica numa coluna de celular, como no app.
class_name Column
extends Container

var max_width := 520.0
var side := 18.0
## Estica o filho até a altura toda (telas sem rolagem).
var fill_height := false


func _init(child: Control = null, fill := false) -> void:
	fill_height = fill
	if child:
		add_child(child)


func _notification(what: int) -> void:
	if what == NOTIFICATION_SORT_CHILDREN:
		var w := minf(size.x - side * 2.0, max_width)
		for c in get_children():
			if c is Control and (c as Control).visible:
				var ctl := c as Control
				var h := ctl.get_combined_minimum_size().y
				if fill_height:
					h = maxf(h, size.y)
				fit_child_in_rect(ctl, Rect2((size.x - w) / 2.0, 0, w, h))


func _get_minimum_size() -> Vector2:
	var h := 0.0
	for c in get_children():
		if c is Control and (c as Control).visible:
			h = maxf(h, (c as Control).get_combined_minimum_size().y)
	return Vector2(0, h)


## Tela com rolagem vertical: devolve o ScrollContainer (já com a coluna dentro).
static func scrolling(child: Control) -> ScrollContainer:
	var s := ScrollContainer.new()
	s.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	s.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var col := Column.new(child)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.add_child(col)
	return s
