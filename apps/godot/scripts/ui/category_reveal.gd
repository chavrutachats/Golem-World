## Revelação do que o sevivon sorteou: a tela na cor da categoria, raios de luz girando e
## o nome entrando com mola (a Coroa em ouro).
class_name CategoryReveal
extends Control

var slice := ""
var owned := false


func _init(s: String, seal_owned := false) -> void:
	slice = s
	owned = seal_owned


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var crown := slice == "crown"
	var color: Color = Color("#1E2766") if crown else Ui.CATEGORIES[slice].color
	var ink: Color = Ui.GOLD if crown else Ui.CATEGORIES[slice].on
	var bg := ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var m := ShaderMaterial.new()
	m.shader = preload("res://shaders/sunburst.gdshader")
	m.set_shader_parameter("base", color)
	m.set_shader_parameter("ray", Color(Ui.GOLD if crown else Color.WHITE, 0.16))
	bg.material = m
	add_child(bg)
	var v := Ui.vbox(14)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	var col := Column.new(v, true)
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.anchor_bottom = 0.84
	add_child(col)
	var name := I18n.t("Coroa!") if crown else Ui.category_name(slice)
	var word := "כתר" if crown else str(Ui.CATEGORIES[slice].word)
	var heb := Ui.title(word, 64, Color(ink, 0.35), HORIZONTAL_ALIGNMENT_CENTER)
	heb.text_direction = Control.TEXT_DIRECTION_RTL
	v.add_child(heb)
	var title := Ui.title(name, 48, ink, HORIZONTAL_ALIGNMENT_CENTER)
	v.add_child(title)
	var sub := I18n.t("Escolha o selo que quer disputar") if crown else (I18n.t("Você já tem este selo: vale pontos") if owned else I18n.t("Prepare-se!"))
	v.add_child(Ui.label(sub, 18, Color(ink, 0.85), "medium", HORIZONTAL_ALIGNMENT_CENTER))
	modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 1.0, 0.18)
	await get_tree().process_frame
	for i in v.get_child_count():
		Ui.pop_in(v.get_child(i), 0.06 + 0.08 * i)


func leave() -> void:
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.25)
	tw.tween_callback(queue_free)
