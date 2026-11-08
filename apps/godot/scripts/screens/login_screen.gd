## Entrar com e-mail e senha (porte de app/login.tsx), a partir das boas-vindas.
class_name LoginScreen
extends Control


func _ready() -> void:
	var content := Ui.vbox(16)
	add_child(Column.scrolling(Ui.margin(content, 0, 14, 0, 40)))
	var top := Ui.hbox(10)
	var back := Ui.button(I18n.t("Voltar"), "ghost", "sm")
	back.pressed.connect(func(): Main.instance.go("welcome"))
	top.add_child(back)
	var title := Ui.title(I18n.t("Entrar"), 26)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	top.add_child(title)
	content.add_child(top)
	content.add_child(Ui.label(I18n.t("Entre com o e-mail e a senha que você cadastrou no app."), 15, Ui.MUTED))
	var email := Form.new(I18n.t("E-mail"))
	email.edit.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_EMAIL_ADDRESS
	content.add_child(email)
	var password := Form.new(I18n.t("Senha"), true)
	content.add_child(password)
	var go := Ui.button(I18n.t("Entrar"), "gold", "lg")
	content.add_child(go)
	var submit := func():
		if email.text.strip_edges() == "" or password.text == "":
			password.set_error(I18n.t("Preencha o e-mail e a senha."))
			return
		go.disabled = true
		password.set_error("")
		var r := await Api.login(email.text, password.text)
		if not is_inside_tree():
			return
		if r.ok:
			Main.instance.go("home")
			return
		go.disabled = false
		password.set_error(str(r.message))
		Sfx.play("bump", 0.6)
	go.pressed.connect(submit)
	email.edit.text_submitted.connect(func(_t): password.edit.grab_focus())
	password.edit.text_submitted.connect(func(_t): submit.call())
	_social(content)
	Ui.mark("login-email", email.edit)
	Ui.mark("login-password", password.edit)
	Ui.mark("login-go", go)
	print("LOGIN_READY")



## Os logins sociais disponíveis aqui, embaixo do e-mail e senha.
func _social(content: VBoxContainer) -> void:
	var social := await Social.available()
	if social.is_empty() or not is_inside_tree():
		return
	content.add_child(Ui.label(I18n.t("ou"), 14, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	content.add_child(Social.buttons(social, false, "home"))
