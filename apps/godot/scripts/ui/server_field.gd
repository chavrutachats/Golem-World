## No jogo instalado: o endereço do servidor e "Trocar", para apontar para o computador que
## roda a API na rede de casa (pnpm lan mostra o endereço). Na web não aparece.
class_name ServerField
extends HBoxContainer


func _ready() -> void:
	alignment = BoxContainer.ALIGNMENT_CENTER
	add_theme_constant_override("separation", 8)
	if not Api.can_choose_server():
		visible = false
		return
	var l := Ui.label(I18n.t("Servidor: {url}", {"url": Api.base_url}), 13, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER)
	l.text_direction = Control.TEXT_DIRECTION_LTR
	add_child(l)
	var change := Ui.button(I18n.t("Trocar"), "ghost", "sm")
	change.pressed.connect(_edit)
	add_child(change)


func _edit() -> void:
	var sheet := Sheet.new()
	sheet.body.add_child(Ui.title(I18n.t("Endereço do servidor"), 24))
	sheet.body.add_child(Ui.label(I18n.t("No computador, rode pnpm lan: ele mostra o endereço (por exemplo, http://192.168.0.10:3000). O celular precisa estar na mesma rede."), 14, Ui.MUTED))
	var field := LineEdit.new()
	field.text = Api.base_url
	field.custom_minimum_size.y = 52
	field.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_URL
	field.text_direction = Control.TEXT_DIRECTION_LTR
	sheet.body.add_child(field)
	var save := Ui.button(I18n.t("Salvar e conectar"), "gold")
	save.pressed.connect(func():
		Api.set_base_url(field.text)
		sheet.queue_free()
		Main.instance._boot())
	sheet.body.add_child(save)
	var cancel := Ui.button(I18n.t("Cancelar"), "velvet")
	cancel.pressed.connect(sheet.queue_free)
	sheet.body.add_child(cancel)
	Main.instance.add_child(sheet)
