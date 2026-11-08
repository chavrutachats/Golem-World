## Denunciar uma pergunta do sevivon (porte de components/ReportSheet.tsx): o motivo, um
## comentário opcional e o envio. A pergunta vai para a revisão humana.
class_name ReportSheet
extends Sheet

const REASONS := [
	["incorrect", "A resposta marcada está errada"],
	["ambiguous", "Mais de uma resposta serve"],
	["disrespectful", "Desrespeitosa com o texto ou a tradição"],
	["typo", "Erro de digitação ou tradução"],
	["other", "Outro problema"],
]

var play_id := ""
var _reason := ""
var _buttons := {}
var _send: Button
var _comment := TextEdit.new()
var _error: Label


func _init(id: String) -> void:
	play_id = id


func _ready() -> void:
	body.add_child(Ui.title(I18n.t("Denunciar pergunta"), 24))
	body.add_child(Ui.label(I18n.t("O que há de errado com ela?"), 15, Ui.MUTED))
	for r in REASONS:
		var b := Ui.button(I18n.t(r[1]), "ghost", "sm", true)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var id: String = r[0]
		b.pressed.connect(func(): _pick(id))
		_buttons[id] = b
		body.add_child(b)
		Ui.mark("report-" + id, b)
	body.add_child(Ui.label(I18n.t("Detalhes (opcional)"), 14, Ui.MUTED, "semibold"))
	_comment.custom_minimum_size.y = 80
	_comment.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	body.add_child(_comment)
	_error = Ui.label("", 14, Ui.ERROR)
	_error.visible = false
	body.add_child(_error)
	_send = Ui.button(I18n.t("Enviar denúncia"), "gold")
	_send.disabled = true
	_send.pressed.connect(_submit)
	body.add_child(_send)
	Ui.mark("report-send", _send)
	super._ready()


func _pick(id: String) -> void:
	_reason = id
	for k in _buttons:
		Ui.style_button(_buttons[k], "velvet" if k == id else "ghost", "sm")
	_send.disabled = false


func _submit() -> void:
	_send.disabled = true
	var comment := _comment.text.substr(0, 500)
	var r := await Api.report_question(play_id, _reason, comment)
	if not is_inside_tree():
		return
	if not r.ok:
		_error.text = str(r.message)
		_error.visible = true
		_send.disabled = false
		return
	for c in body.get_children():
		c.queue_free()
	body.add_child(Ui.title(I18n.t("Denúncia enviada"), 24))
	body.add_child(Ui.label(I18n.t("A pergunta vai para a revisão. Obrigado por ajudar a manter o jogo fiel aos textos."), 15, Ui.MUTED))
	var close := Ui.button(I18n.t("Fechar"), "gold")
	close.pressed.connect(queue_free)
	body.add_child(close)
	print("REPORT_SENT")
