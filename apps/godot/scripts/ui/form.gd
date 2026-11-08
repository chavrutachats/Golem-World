## Campo de formulário: o rótulo em cima, a caixa de texto e, embaixo, uma dica ou o erro.
class_name Form
extends VBoxContainer

var edit := LineEdit.new()
var _note: Label
var _hint := ""


func _init(label: String, secret := false, hint := "") -> void:
	add_theme_constant_override("separation", 6)
	add_child(Ui.label(label, 14, Ui.MUTED, "semibold"))
	edit.secret = secret
	edit.custom_minimum_size.y = 52
	edit.max_length = 254
	if secret:
		edit.max_length = 128
	add_child(edit)
	_hint = hint
	_note = Ui.label(hint, 13, Ui.MUTED)
	_note.visible = hint != ""
	add_child(_note)


func set_error(text: String) -> void:
	_note.text = text if text != "" else _hint
	_note.add_theme_color_override("font_color", Ui.ERROR if text != "" else Ui.MUTED)
	_note.visible = _note.text != ""


func set_ok(text: String) -> void:
	_note.text = text
	_note.add_theme_color_override("font_color", Ui.EMERALD)
	_note.visible = text != ""


var text: String:
	get:
		return edit.text
	set(v):
		edit.text = v
