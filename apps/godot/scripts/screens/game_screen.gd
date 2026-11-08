## Tabuleiro da partida (porte de app/game/[id]/index.tsx): o sevivon na mesa ocupa a tela
## inteira; por cima, o placar e a próxima ação conforme a fase que a API informa.
##
## Fases: waiting_opponent, spin, spun, question, choose_crown, opponent_turn, finished.
class_name GameScreen
extends Control

const POLL_S := 2.5
const CROWN_INDEX := 6

var id := ""
var state: Dictionary = {}
var view := SevivonView.new()
var _busy := ""
var _landed := ""
var _positioned := false
var _last_phase := ""
var _celebrate := false
var _overlay: Control

# Placar
var _me_line: Dictionary
var _opp_line: Dictionary
var _round: Label
var _crown: GamePieces.CrownMeter
var _lives: Label
var _opp_box: Control
var _title: Label
var _forfeit: Button
# Ações
var _status: Label
var _error: Label
var _actions := Ui.vbox(10)
var _poll := Timer.new()


func setup(params: Dictionary) -> void:
	id = str(params.get("id", ""))
	state = params.get("state", {})


func _ready() -> void:
	view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	view.stage.frame_shift = 0.15
	# Nas 8 noites de Chanucá, a chanukiá acesa atrás do sevivon.
	view.stage.hanukkah_night = Hanukkah.night()
	add_child(view)
	add_child(WelcomeScreen._fade(0.78, 1.0))

	var layout := Ui.vbox(10)
	var col := Column.new(Ui.margin(layout, 0, 12, 0, 20), true)
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(col)
	layout.add_child(_top_bar())
	layout.add_child(_scoreboard())
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout.add_child(spacer)
	_status = Ui.label("", 18, Ui.ON, "semibold", HORIZONTAL_ALIGNMENT_CENTER)
	layout.add_child(_status)
	_error = Ui.label("", 15, Ui.ERROR, "medium", HORIZONTAL_ALIGNMENT_CENTER)
	_error.visible = false
	layout.add_child(_error)
	layout.add_child(_actions)

	_poll.wait_time = POLL_S
	_poll.timeout.connect(_on_poll)
	add_child(_poll)
	var t := Timer.new()
	t.wait_time = 1.0
	t.autostart = true
	t.timeout.connect(_tick_lives)
	add_child(t)
	if not state.is_empty():
		_render()
	refresh()


func _top_bar() -> Control:
	var row := Ui.hbox(8)
	var back := Ui.button(I18n.t("Voltar"), "ghost", "sm")
	back.pressed.connect(func(): Main.instance.go("home"))
	row.add_child(back)
	_title = Ui.title("", 22, Ui.ON, HORIZONTAL_ALIGNMENT_CENTER)
	_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(_title)
	_forfeit = Ui.button(I18n.t("Desistir"), "ghost", "sm")
	_forfeit.pressed.connect(_confirm_forfeit)
	row.add_child(_forfeit)
	return row


func _player_line(label: String) -> Dictionary:
	var row := Ui.hbox(10)
	var dot := GamePieces.TurnDot.new()
	row.add_child(dot)
	var avatar := GamePieces.Avatar.new(label if label != I18n.t("Você") else str(Api.user.get("displayName", label)))
	row.add_child(avatar)
	var texts := Ui.vbox(0)
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var name := Ui.label(label, 16, Ui.ON, "semibold")
	name.autowrap_mode = TextServer.AUTOWRAP_OFF
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	texts.add_child(name)
	var points := Ui.label("", 13, Ui.MUTED, "regular")
	texts.add_child(points)
	row.add_child(texts)
	var seals := GamePieces.SealRow.new()
	row.add_child(seals)
	return {"row": row, "dot": dot, "avatar": avatar, "name": name, "points": points, "seals": seals}


func _scoreboard() -> Control:
	var panel := Ui.panel(Color(Ui.VELVET, 0.92), 20, 14)
	var v := Ui.vbox(10)
	panel.add_child(v)
	_me_line = _player_line(I18n.t("Você"))
	v.add_child(_me_line.row)
	_opp_line = _player_line("")
	_opp_box = _opp_line.row
	v.add_child(_opp_box)
	var rule := ColorRect.new()
	rule.color = Ui.LINE
	rule.custom_minimum_size.y = 1
	v.add_child(rule)
	var row := Ui.hbox(10)
	_round = Ui.label("", 14, Ui.MUTED, "medium")
	row.add_child(_round)
	_lives = Ui.label("", 14, Ui.MUTED, "medium", HORIZONTAL_ALIGNMENT_CENTER)
	row.add_child(_lives)
	_crown = GamePieces.CrownMeter.new()
	row.add_child(_crown)
	v.add_child(row)
	return panel


# --- Estado ------------------------------------------------------------------------------


func refresh() -> void:
	var r := await Api.game_state(id)
	if not is_inside_tree():
		return
	if not r.ok:
		_show_error(r.message)
		return
	state = r.data
	_render()


func _on_poll() -> void:
	if _busy == "" and _overlay == null:
		refresh()


func _render() -> void:
	var phase := str(state.phase)
	if _last_phase != "" and _last_phase != "finished" and phase == "finished":
		_celebrate = true
	_last_phase = phase
	_title.text = I18n.t(Ui.MODES.get(str(state.mode), ""))
	var me: Dictionary = state.me
	var my_turn := bool(state.isMyTurn) and str(state.status) == "active"
	_fill_line(_me_line, me, I18n.t("Você"), my_turn)
	var opp: Variant = state.get("opponent")
	_opp_box.visible = opp is Dictionary
	if opp is Dictionary:
		_fill_line(_opp_line, opp, str(opp.displayName), not bool(state.isMyTurn) and str(state.status) == "active")
	_round.text = I18n.t("Rodada {n} de {max}", {"n": int(state.roundNumber), "max": int(state.maxRounds)})
	_crown.set_progress(int(me.crownProgress))
	_forfeit.visible = phase != "finished"
	_tick_lives()

	# Reabrindo uma partida com giro já feito: o sevivon aparece deitado na face sorteada.
	if not _positioned and _busy == "":
		if state.get("pendingSpin") is Dictionary:
			view.stage.jump_to(int(state.pendingSpin.sliceIndex))
		elif phase == "choose_crown":
			view.stage.jump_to(CROWN_INDEX)
		_positioned = true
	if phase == "spin" and _busy == "" and _overlay == null:
		view.stage.rest()

	var polling := phase == "opponent_turn" or phase == "waiting_opponent"
	if polling and _poll.is_stopped():
		_poll.start()
	elif not polling:
		_poll.stop()
	_render_actions(phase)
	print("GAME_PHASE ", phase)
	if phase == "choose_crown" and _busy == "" and _overlay == null:
		_open_crown_chooser()


func _fill_line(line: Dictionary, p: Dictionary, label: String, active: bool) -> void:
	(line.name as Label).text = label
	var pts := Ui.points_label(int(p.score))
	(line.points as Label).text = ("BOT · " + pts) if bool(p.get("isBot", false)) else pts
	(line.seals as GamePieces.SealRow).set_seals(p.seals)
	var dot: GamePieces.TurnDot = line.dot
	dot.active = active
	dot.queue_redraw()


func _tick_lives() -> void:
	if state.is_empty() or not state.has("lives"):
		return
	var l: Dictionary = state.lives
	var n := int(l.lives)
	var mx := int(l.max)
	var text := I18n.t("{n} de {max} vidas", {"n": n, "max": mx})
	if n < mx and l.get("nextLifeAt") != null:
		var left := int(maxf(0.0, (Util.iso_ms(str(l.nextLifeAt)) - Util.now_ms()) / 1000.0))
		text += " · " + I18n.t("+1 vida em {time}", {"time": "%d:%02d" % [left / 60, left % 60]})
		if left == 0:
			refresh()
	_lives.text = text


func _status_text(phase: String) -> String:
	var landed_name := Ui.category_name(_landed)
	if _busy == "spinning":
		return I18n.t("Girando…")
	if _busy == "opening":
		return I18n.t("Caiu em {category}.", {"category": landed_name}) if landed_name != "" else I18n.t("Abrindo a pergunta…")
	match phase:
		"spin":
			return I18n.t("Sua vez. Gire o sevivon.")
		"spun":
			var p: Variant = state.get("pendingSpin")
			if p is Dictionary and Ui.CATEGORIES.has(str(p.result)):
				return I18n.t("O sevivon caiu em {category}.", {"category": Ui.category_name(str(p.result))})
		"question":
			return I18n.t("Você tem uma pergunta em aberto.")
		"choose_crown":
			return I18n.t("Coroa cheia! Escolha um selo para disputar.")
		"opponent_turn":
			var opp: Variant = state.get("opponent")
			return I18n.t("Vez de {name}. Esta tela se atualiza sozinha.", {"name": str(opp.displayName) if opp is Dictionary else I18n.t("seu adversário")})
		"waiting_opponent":
			return I18n.t("Esperando seu amigo entrar.") if str(state.mode) == "friend" else I18n.t("Procurando um adversário… Se ninguém aparecer em alguns segundos, um Golem-bot do seu nível entra no lugar.")
	return ""


func _render_actions(phase: String) -> void:
	_status.text = _status_text(phase)
	_status.visible = _status.text != ""
	for c in _actions.get_children():
		c.queue_free()
	var no_lives := phase == "spin" and int(state.lives.lives) <= 0 and _busy == ""
	if no_lives:
		_actions.add_child(_no_lives())
	elif phase == "spin" or _busy == "spinning" or _busy == "opening":
		var rp: Variant = state.get("roundPrize")
		if rp is Dictionary and not bool(rp.claimed) and Economy.ads_on() and _busy == "":
			_actions.add_child(_round_prize(rp))
		var spin := Ui.button(I18n.t("Girar"), "gold", "lg")
		spin.disabled = _busy != ""
		spin.custom_minimum_size.y = 70
		spin.add_theme_font_size_override("font_size", 24)
		spin.pressed.connect(_spin)
		Ui.mark("spin", spin)
		_actions.add_child(spin)
		if _busy == "":
			_pulse(spin)
	elif phase == "spun" and state.get("pendingSpin") is Dictionary:
		var b := Ui.button(I18n.t("Ver a pergunta"), "gold", "lg")
		b.pressed.connect(func(): _open_pending(str(state.pendingSpin.spinId)))
		_actions.add_child(b)
	elif phase == "question":
		var b := Ui.button(I18n.t("Voltar para a pergunta"), "gold", "lg")
		b.pressed.connect(_reopen_question)
		_actions.add_child(b)
	elif phase == "choose_crown":
		var b := Ui.button(I18n.t("Escolher o selo"), "gold", "lg")
		b.pressed.connect(_open_crown_chooser)
		_actions.add_child(b)
	elif phase == "finished":
		_actions.add_child(_finished())
	elif phase == "waiting_opponent" and str(state.mode) == "friend" and state.get("inviteCode") != null:
		_actions.add_child(_invite(str(state.inviteCode)))


## O botão de girar "respira" enquanto espera o toque.
func _pulse(b: Button) -> void:
	b.pivot_offset = b.size / 2
	b.resized.connect(func(): b.pivot_offset = b.size / 2)
	var tw := b.create_tween().set_loops()
	tw.tween_property(b, "scale", Vector2(1.03, 1.03), 0.7).set_trans(Tween.TRANS_SINE)
	tw.tween_property(b, "scale", Vector2.ONE, 0.7).set_trans(Tween.TRANS_SINE)


func _no_lives() -> Control:
	var panel := Ui.panel(Ui.VELVET, 20, 16)
	var v := Ui.vbox(8)
	panel.add_child(v)
	v.add_child(Ui.label(I18n.t("Suas vidas acabaram"), 18, Ui.ON, "semibold", HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(Ui.label(I18n.t("Cada erro no sevivon gasta uma vida, e uma volta a cada 10 minutos. A partida espera por você; enquanto isso, que tal treinar no Golem World?"), 14, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	if Economy.can_reward("life"):
		var ad := Ui.button(I18n.t("+1 vida com um anúncio"), "velvet")
		ad.pressed.connect(func():
			ad.disabled = true
			if await Economy.earn("life") == "claimed":
				refresh()
			else:
				ad.disabled = false)
		Ui.mark("lives-ad", ad)
		v.add_child(ad)
	if Economy.store_mode() != "off":
		var refill := Ui.button(I18n.t("Encher as vidas ({price} shekels)", {"price": Economy.LIVES_REFILL_PRICE}), "velvet", "md", true)
		refill.disabled = Economy.shekels() < Economy.LIVES_REFILL_PRICE
		refill.pressed.connect(func():
			refill.disabled = true
			if await Economy.buy_offer("lives-refill"):
				refresh())
		Ui.mark("lives-refill", refill)
		v.add_child(refill)
	var journey := Ui.button(I18n.t("Ir para o Golem World"), "gold")
	journey.pressed.connect(func(): Main.instance.go("journey"))
	v.add_child(journey)
	var back := Ui.button(I18n.t("Voltar ao início"), "ghost", "sm")
	back.pressed.connect(func(): Main.instance.go("home"))
	v.add_child(back)
	return panel


## O código do convite, grande, com "Compartilhar código" (o compartilhamento do sistema
## quando o navegador tem; senão, copia a mensagem).
func _invite(code: String) -> Control:
	var panel := Ui.panel(Color(Ui.VELVET, 0.95), 22, 16)
	var v := Ui.vbox(8)
	panel.add_child(v)
	v.add_child(Ui.label(I18n.t("Código do convite"), 14, Ui.MUTED, "medium", HORIZONTAL_ALIGNMENT_CENTER))
	var big := Ui.title(code, 44, Ui.GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	big.add_theme_constant_override("outline_size", 0)
	v.add_child(big)
	var share := Ui.button(I18n.t("Compartilhar código"), "gold")
	var message := I18n.t("Vamos jogar Trivia Torá? Abra o app, toque em \"Tenho um código de convite\" e digite {code}.", {"code": code})
	share.pressed.connect(func():
		if not _share_native(message):
			DisplayServer.clipboard_set(message)
			Economy.notify(I18n.t("Mensagem copiada: é só colar para o seu amigo.")))
	v.add_child(share)
	Ui.mark("invite-share", share)
	print("INVITE_CODE %s" % code)
	return panel


## navigator.share na web (celular); false quando o navegador não tem.
func _share_native(text: String) -> bool:
	if not OS.has_feature("web"):
		return false
	var nav: JavaScriptObject = JavaScriptBridge.get_interface("navigator")
	if nav == null or nav.share == null:
		return false
	var data: JavaScriptObject = JavaScriptBridge.create_object("Object")
	data.text = text
	nav.share(data)
	return true


## O prêmio da rodada, ao lado do botão de girar: assistir a um anúncio e ganhar.
func _round_prize(rp: Dictionary) -> Control:
	var panel := Ui.panel(Color("#2B2560"), 18, 12, Ui.GOLD)
	var row := Ui.hbox(10)
	panel.add_child(row)
	var v := Ui.vbox(4)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_child(Ui.label(I18n.t("Prêmio do sevivon"), 15, Ui.GOLD, "bold"))
	var badge := Economy.prize_badge(rp.prize, 14)
	badge.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	v.add_child(badge)
	row.add_child(v)
	var b := Ui.button(I18n.t("Assistir"), "emerald", "sm")
	b.tooltip_text = I18n.t("Assista a um anúncio e ganhe o prêmio da rodada")
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	b.pressed.connect(func():
		b.disabled = true
		if await Economy.earn("wheel", str(rp.ref)) == "claimed":
			Economy.notify(I18n.t("Prêmio da rodada resgatado"))
		refresh())
	Ui.mark("round-prize", b)
	row.add_child(b)
	return panel


## O sevivon caiu no Prêmio: o prêmio aparece antes, e o anúncio só começa se o jogador quiser.
func _prize_sheet(rp: Dictionary) -> void:
	var sheet := Sheet.new()
	sheet.body.add_child(Ui.title(I18n.t("O sevivon caiu no Prêmio!"), 26))
	sheet.body.add_child(Economy.prize_badge(rp.prize, 20))
	sheet.body.add_child(Ui.label(I18n.t("Assista a um anúncio curto e o prêmio é seu. Ele vale fora da partida; depois, é só girar de novo."), 15, Ui.MUTED))
	var yes := Ui.button(I18n.t("Assistir e ganhar"), "emerald")
	var no := Ui.button(I18n.t("Agora não, girar de novo"), "velvet")
	sheet.body.add_child(yes)
	sheet.body.add_child(no)
	_overlay = sheet
	add_child(sheet)
	Ui.mark("prize-watch", yes)
	Ui.mark("prize-skip", no)
	print("PRIZE_SHEET")
	var choice := {"v": -1}
	yes.pressed.connect(func(): choice.v = 1)
	no.pressed.connect(func(): choice.v = 0)
	sheet.closed.connect(func(): choice.v = 0)
	while choice.v < 0 and is_instance_valid(sheet):
		await get_tree().process_frame
	if is_instance_valid(sheet):
		sheet.queue_free()
	_overlay = null
	if choice.v == 1:
		await Economy.earn("wheel", str(rp.ref))


func _finished() -> Control:
	var me: Dictionary = state.me
	var won := str(state.status) == "finished" and state.get("winnerUserId") != null and str(state.winnerUserId) == str(me.userId)
	var all_seals := str(state.mode) == "solo" and (me.seals as Array).size() == 6
	var title := ""
	if str(state.status) == "abandoned":
		title = I18n.t("Partida cancelada")
	elif str(state.mode) == "solo":
		title = I18n.t("Todos os selos!") if all_seals else I18n.t("Treino encerrado")
	elif state.get("winnerUserId") == null:
		title = I18n.t("Empate")
	elif won:
		title = I18n.t("Você venceu!")
	else:
		var opp: Variant = state.get("opponent")
		title = I18n.t("{name} venceu", {"name": str(opp.displayName) if opp is Dictionary else I18n.t("Seu adversário")})
	var panel := Ui.panel(Color(Ui.VELVET, 0.95), 22, 18, Ui.GOLD if (won or all_seals) else Ui.LINE)
	var v := Ui.vbox(12)
	panel.add_child(v)
	v.add_child(Ui.title(title, 34, Ui.GOLD if (won or all_seals) else Ui.ON, HORIZONTAL_ALIGNMENT_CENTER))
	var seals := (me.seals as Array).size()
	v.add_child(Ui.label(I18n.t("{seals} e {points} nesta partida.", {"seals": I18n.tn(seals, "{n} selo", "{n} selos"), "points": Ui.points_label(int(me.score))}), 16, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	var again := Ui.button(I18n.t("Jogar de novo"), "gold", "lg")
	again.pressed.connect(_play_again.bind(again))
	Ui.mark("again", again)
	v.add_child(again)
	var home := Ui.button(I18n.t("Voltar ao início"), "velvet")
	home.pressed.connect(func():
		home.disabled = true
		# Fim de partida é uma pausa: pode ser a hora do anúncio (com o presente antes).
		await Economy.ad_break("match")
		Main.instance.go("home"))
	Ui.mark("game-home", home)
	v.add_child(home)
	Ui.pop_in(panel)
	if _celebrate and (won or all_seals):
		_celebrate = false
		Sfx.play("win", 0.9)
		GamePieces.confetti(self, Vector2(size.x / 2, size.y * 0.62), 90)
	return panel


func _show_error(msg: String) -> void:
	_error.text = msg
	_error.visible = msg != ""


# --- Ações -------------------------------------------------------------------------------


func _spin() -> void:
	_show_error("")
	_busy = "spinning"
	_render_actions(str(state.phase))
	var r := await Api.spin(id, Economy.ads_on() and Economy.can_reward("wheel"))
	if not r.ok:
		_busy = ""
		_show_error(r.message)
		refresh()
		return
	var res: Dictionary = r.data
	await view.stage.spin_to(int(res.sliceIndex))
	_landed = str(res.result)
	if _landed == "prize":
		# O Prêmio não gasta a vez: oferece o anúncio com o prêmio da rodada e gira de novo.
		Sfx.play("coin", 0.7)
		if res.get("prize") is Dictionary:
			await _prize_sheet(res.prize)
		_busy = ""
		view.stage.rest()
		refresh()
		return
	await get_tree().create_timer(0.8).timeout
	Sfx.play("reveal", 0.8)
	var seal_owned := (state.me.seals as Array).has(_landed)
	var reveal := CategoryReveal.new(_landed, seal_owned)
	add_child(reveal)
	if _landed == "crown":
		await get_tree().create_timer(1.4).timeout
		reveal.leave()
		_busy = ""
		refresh()
		return
	_busy = "opening"
	_render_actions(str(state.phase))
	# A pergunta é buscada enquanto a revelação toca.
	var timer := get_tree().create_timer(1.3)
	var q := await Api.question(id, str(res.spinId))
	if timer.time_left > 0:
		await timer.timeout
	_busy = ""
	if not q.ok:
		reveal.leave()
		_show_error(q.message)
		refresh()
		return
	_open_question(q.data)
	reveal.leave()


func _open_pending(spin_id: String) -> void:
	_busy = "opening"
	_render_actions(str(state.phase))
	var q := await Api.question(id, spin_id)
	_busy = ""
	if not q.ok:
		_show_error(q.message)
		refresh()
		return
	_open_question(q.data)


func _reopen_question() -> void:
	var q := await Api.current_question(id)
	if not q.ok:
		_show_error(q.message)
		refresh()
		return
	_open_question(q.data)


func _open_question(question: Dictionary) -> void:
	_close_overlay()
	var opp: Variant = state.get("opponent")
	var qv := QuestionView.new(question, id, str(opp.displayName) if opp is Dictionary else "")
	qv.closed.connect(func(_res):
		_close_overlay()
		view.active = true
		refresh())
	_overlay = qv
	add_child(qv)
	Ui.fade_in(qv, 0.0, 0.2)
	view.active = false


func _close_overlay() -> void:
	if _overlay:
		_overlay.queue_free()
		_overlay = null


func _open_crown_chooser() -> void:
	if _overlay:
		return
	var sheet := Sheet.new()
	var v := sheet.body
	v.add_child(Ui.title(I18n.t("Escolha o selo"), 28, Ui.GOLD))
	v.add_child(Ui.label(I18n.t("Acerte a pergunta da categoria escolhida e o selo é seu."), 15, Ui.MUTED))
	var choices: Array = state.get("crownChoices", [])
	if choices.is_empty():
		v.add_child(Ui.label(I18n.t("Nenhuma categoria disponível para disputa agora."), 15, Ui.MUTED))
	var err := Ui.label("", 14, Ui.ERROR)
	for cat in choices:
		var b := Ui.button(Ui.category_name(str(cat)), "velvet", "md")
		b.add_theme_color_override("font_color", Ui.ON)
		var stripe := ColorRect.new()
		stripe.color = Ui.CATEGORIES[str(cat)].color
		stripe.custom_minimum_size = Vector2(6, 0)
		stripe.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stripe.anchor_bottom = 1.0
		stripe.offset_left = 14
		stripe.offset_right = 20
		stripe.offset_top = 14
		stripe.offset_bottom = -17
		b.add_child(stripe)
		b.pressed.connect(func():
			for other in v.get_children():
				if other is Button:
					(other as Button).disabled = true
			var q := await Api.crown(id, str(cat))
			if q.ok:
				sheet.queue_free()
				_overlay = null
				_open_question(q.data)
			else:
				err.text = q.message
				for other in v.get_children():
					if other is Button:
						(other as Button).disabled = false)
		v.add_child(b)
		Ui.mark("crown-%s" % cat, b)
	v.add_child(err)
	sheet.closed.connect(func(): _overlay = null)
	_overlay = sheet
	add_child(sheet)


func _confirm_forfeit() -> void:
	if _overlay:
		return
	var waiting := str(state.get("status", "")) == "waiting_opponent"
	var sheet := Sheet.new()
	var v := sheet.body
	v.add_child(Ui.title(I18n.t("Cancelar partida?") if waiting else I18n.t("Desistir da partida?"), 26))
	v.add_child(Ui.label(I18n.t("A partida será encerrada.") if (waiting or str(state.mode) == "solo") else I18n.t("Seu adversário vence esta partida."), 15, Ui.MUTED))
	var yes := Ui.button(I18n.t("Cancelar partida") if waiting else I18n.t("Desistir"), "gold")
	yes.pressed.connect(func():
		yes.disabled = true
		var r := await Api.forfeit(id)
		sheet.queue_free()
		_overlay = null
		if r.ok:
			state = r.data
			_render()
		else:
			_show_error(r.message))
	v.add_child(yes)
	var no := Ui.button(I18n.t("Voltar"), "velvet")
	no.pressed.connect(func():
		sheet.queue_free()
		_overlay = null)
	v.add_child(no)
	sheet.closed.connect(func(): _overlay = null)
	_overlay = sheet
	add_child(sheet)


func _play_again(button: Button) -> void:
	button.disabled = true
	await Economy.ad_break("match")
	var r := await Api.game_create(str(state.mode))
	if not r.ok:
		button.disabled = false
		_show_error(r.message)
		return
	Main.instance.go("game", {"id": str(r.data.id), "state": r.data})
