## Pré-visualização da cena do sevivon em tela cheia (?preview=stage&spin=3 ou &face=6).
class_name StagePreview
extends Control

var view := SevivonView.new()


func _ready() -> void:
	view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(view)
	var spin := Main.query("spin")
	var face := Main.query("face")
	view.stage.frame_shift = float(Main.query("shift")) if Main.query("shift") != "" else 0.0
	print("STAGE_READY")
	if face != "":
		view.stage.jump_to(int(face))
	elif spin != "":
		await get_tree().create_timer(0.8).timeout
		await view.stage.spin_to(int(spin))
		print("STAGE_LANDED ", spin)
