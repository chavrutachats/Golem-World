## Abertura enquanto a sessão é retomada; sem conexão, explica e oferece tentar de novo.
class_name SplashScreen
extends Control

var _offline := false


func _init(offline := false) -> void:
	_offline = offline


func _ready() -> void:
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var col := Ui.vbox(14)
	col.custom_minimum_size.x = 320
	center.add_child(col)
	col.add_child(Ui.title(I18n.t("Trivia Torá"), 42, Ui.GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	if _offline:
		col.add_child(Ui.label(I18n.t("Não deu para retomar sua conta agora"), 19, Ui.ON, "semibold", HORIZONTAL_ALIGNMENT_CENTER))
		col.add_child(Ui.label(I18n.t("Confira a conexão e tente de novo."), 16, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
		var again := Ui.button(I18n.t("Tentar de novo"), "gold")
		again.pressed.connect(func(): Main.instance._boot())
		col.add_child(again)
		col.add_child(ServerField.new())
	else:
		col.add_child(Ui.label(I18n.t("Carregando…"), 16, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
