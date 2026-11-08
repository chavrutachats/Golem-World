## Entrar na partida de um amigo com o código do convite (porte de app/join.tsx).
class_name JoinScreen
extends Control


func _ready() -> void:
	var content := Ui.vbox(16)
	add_child(Column.scrolling(Ui.margin(content, 0, 14, 0, 40)))
	var top := Ui.hbox(10)
	var back := Ui.button(I18n.t("Voltar"), "ghost", "sm")
	back.pressed.connect(func(): Main.instance.go("home"))
	top.add_child(back)
	var title := Ui.title(I18n.t("Entrar com código"), 26)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	top.add_child(title)
	content.add_child(top)
	content.add_child(Ui.label(I18n.t("Peça ao seu amigo o código que aparece na tela da partida dele."), 15, Ui.MUTED))
	var field := Form.new(I18n.t("Código do convite"))
	field.edit.max_length = 6
	field.edit.placeholder_text = I18n.t("Ex.: {code}", {"code": "K7Q2PM"})
	field.edit.alignment = HORIZONTAL_ALIGNMENT_CENTER
	field.edit.add_theme_font_size_override("font_size", 26)
	field.edit.custom_minimum_size.y = 64
	content.add_child(field)
	var go := Ui.button(I18n.t("Entrar na partida"), "gold", "lg")
	go.disabled = true
	content.add_child(go)
	var clean := func(text: String) -> String:
		var out := ""
		for ch in text.to_upper():
			if (ch >= "A" and ch <= "Z") or (ch >= "0" and ch <= "9"):
				out += ch
		return out
	# Só letras e números, em maiúsculas, enquanto digita.
	field.edit.text_changed.connect(func(text: String):
		var c: String = clean.call(text)
		if c != text:
			var caret := field.edit.caret_column
			field.edit.text = c
			field.edit.caret_column = mini(caret, c.length())
		field.set_error("")
		go.disabled = c.length() != 6)
	var submit := func():
		var code: String = clean.call(field.text)
		if code.length() != 6:
			field.set_error(I18n.t("O código tem 6 letras e números."))
			return
		go.disabled = true
		var r := await Api.game_create("friend", code)
		if not is_inside_tree():
			return
		if r.ok:
			Main.instance.go("game", {"id": str(r.data.id), "state": r.data})
			return
		go.disabled = false
		field.set_error(str(r.message))
		Sfx.play("bump", 0.6)
	go.pressed.connect(submit)
	field.edit.text_submitted.connect(func(_t): submit.call())
	Ui.mark("join-code", field.edit)
	Ui.mark("join-go", go)
	print("JOIN_READY")
