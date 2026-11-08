## Conta e segurança (porte de app/account.tsx): trocar a senha, sair de todos os aparelhos
## e excluir a conta. Conta criada pelo Google ou Facebook não tem senha: nada de trocar
## senha nem de senha para excluir.
class_name AccountScreen
extends Control

var me: Dictionary = {}
var _content := Ui.vbox(14)
var _marks := {}


func _ready() -> void:
	var scroll := Column.scrolling(Ui.margin(_content, 0, 14, 0, 40))
	add_child(scroll)
	Ui.mark_on_scroll(scroll, _marks)
	_build()
	var r := await Api.me()
	if not is_inside_tree():
		return
	if r.ok:
		me = r.data
		_build()
	print("ACCOUNT_READY")


func _mark(name: String, node: Control) -> void:
	_marks[name] = node
	Ui.mark(name, node)


func _heading(text: String) -> Label:
	var l := Ui.title(text, 22)
	l.custom_minimum_size.y = 40
	l.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	return l


func _build() -> void:
	for c in _content.get_children():
		c.queue_free()
	var top := Ui.hbox(10)
	var back := Ui.button(I18n.t("Voltar"), "ghost", "sm")
	back.pressed.connect(func(): Main.instance.go("profile"))
	top.add_child(back)
	var title := Ui.title(I18n.t("Conta e segurança"), 24)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	top.add_child(title)
	_content.add_child(top)
	var guest := bool(Api.user.get("isGuest", true))
	var has_password := not guest and bool(me.get("hasPassword", true))
	if guest:
		_content.add_child(Ui.label(I18n.t("Você joga como convidado: a conta existe só neste aparelho e não tem senha. Para jogar em outro aparelho, crie uma conta no seu perfil."), 15, Ui.MUTED))
	else:
		if has_password:
			_content.add_child(_heading(I18n.t("Trocar senha")))
			var current := Form.new(I18n.t("Senha atual"), true)
			var next := Form.new(I18n.t("Senha nova"), true, I18n.t("Pelo menos {n} caracteres.", {"n": 12}))
			_content.add_child(current)
			_content.add_child(next)
			var change := Ui.button(I18n.t("Trocar senha"), "gold")
			change.pressed.connect(func():
				if current.text == "":
					next.set_error(I18n.t("Informe a senha atual."))
					return
				change.disabled = true
				var r := await Api.change_password(current.text, next.text)
				if not is_inside_tree():
					return
				change.disabled = false
				if r.ok:
					current.text = ""
					next.text = ""
					next.set_ok(I18n.t("Senha trocada. Os outros aparelhos foram desconectados."))
					Sfx.play("correct", 0.5)
				else:
					next.set_error(str(r.message))
					Sfx.play("bump", 0.6))
			_content.add_child(change)
			_mark("account-current", current.edit)
			_mark("account-new", next.edit)
			_mark("account-change", change)
		_content.add_child(_heading(I18n.t("Aparelhos conectados")))
		_content.add_child(Ui.label(I18n.t("Perdeu o celular ou entrou num aparelho emprestado? Desconecte a conta de todos de uma vez."), 15, Ui.MUTED))
		var all := Ui.button(I18n.t("Sair de todos os aparelhos"), "velvet")
		all.pressed.connect(func(): _confirm(
			I18n.t("Sair de todos os aparelhos?"),
			I18n.t("Sua conta será desconectada em todos os aparelhos, inclusive neste. Para voltar, entre com seu e-mail e senha.") if has_password else I18n.t("Sua conta será desconectada em todos os aparelhos, inclusive neste. Para voltar, entre de novo com o mesmo serviço."),
			I18n.t("Sair de todos"),
			func():
				var r := await Api.logout_all()
				if r.ok:
					Main.instance.go("welcome")
				else:
					Economy.notify(str(r.message))))
		_content.add_child(all)
		_mark("account-logout-all", all)
	# Zona de perigo.
	var danger := Ui.panel(Ui.VELVET, 20, 16, Ui.RUBY)
	var v := Ui.vbox(10)
	danger.add_child(v)
	v.add_child(Ui.title(I18n.t("Excluir conta"), 22))
	v.add_child(Ui.label(I18n.t("Apaga seu nome no jogo, seus pontos e os comentários das suas denúncias, e tira você do ranking. Não há como desfazer.") if guest else I18n.t("Apaga seu e-mail, sua senha, seu nome no jogo, seus pontos e os comentários das suas denúncias, e tira você do ranking. Não há como desfazer."), 14, Ui.MUTED))
	var pw: Form = null
	if has_password:
		pw = Form.new(I18n.t("Sua senha"), true)
		v.add_child(pw)
		_mark("account-delete-password", pw.edit)
	var del := Ui.button(I18n.t("Excluir minha conta"), "ghost")
	del.add_theme_color_override("font_color", Ui.RUBY)
	del.pressed.connect(func():
		if pw != null and pw.text == "":
			pw.set_error(I18n.t("Confirme com a sua senha."))
			return
		_confirm(I18n.t("Excluir a conta de vez?"), I18n.t("Seus dados serão apagados e não há como desfazer. Partidas em andamento terminam com vitória do adversário."), I18n.t("Excluir"), func():
			var r := await Api.delete_account(pw.text if pw != null else "")
			if r.ok:
				Main.instance.go("welcome")
			elif pw != null:
				pw.set_error(str(r.message))
			else:
				Economy.notify(str(r.message))))
	v.add_child(del)
	_mark("account-delete", del)
	_content.add_child(Control.new())
	_content.add_child(danger)


func _confirm(title: String, text: String, yes_label: String, action: Callable) -> void:
	var sheet := Sheet.new()
	sheet.body.add_child(Ui.title(title, 24))
	sheet.body.add_child(Ui.label(text, 15, Ui.MUTED))
	var yes := Ui.button(yes_label, "gold")
	yes.pressed.connect(func():
		yes.disabled = true
		await action.call()
		if is_instance_valid(sheet):
			sheet.queue_free())
	sheet.body.add_child(yes)
	var no := Ui.button(I18n.t("Cancelar"), "velvet")
	no.pressed.connect(sheet.queue_free)
	sheet.body.add_child(no)
	add_child(sheet)
	Ui.mark("confirm-yes", yes)
