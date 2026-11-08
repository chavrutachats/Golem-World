## Economia no cliente Godot (porte de lib/monetization e components/economy/MonetizationHost.tsx).
##
## - A carteira (moedas e shekels), as ajudas, as vidas e os modos de anúncio e de loja vêm
##   do servidor (GET /economy) e voltam atualizados em cada resposta.
## - Anúncio com prêmio: oferta (o prêmio aparece antes) → anúncio → aviso de visto →
##   resgate. Neste cliente o anúncio é o de demonstração, desenhado pelo próprio jogo, e o
##   servidor só aceita isso fora de produção (ADS_MODE=demo). Com ADS_MODE=admob (anúncios
##   reais do Google), aqui não há anúncio: as ofertas somem, como na versão web do app.
## - Compra: a de demonstração (STORE_MODE=demo), que pede confirmação e não cobra nada.
## - Pausa (fim de partida ou de fase): se for a hora do anúncio obrigatório, o presente antes.
extends Node

signal changed

const DEMO_AD_SECONDS := 5
const GIFT_COUNTDOWN := 5
const BOOST_NAMES := {"time": "+10 segundos", "skip": "Pular pergunta", "eliminate": "Eliminar 2 erradas"}
const SHEKEL_OFFERS := [
	{"id": "lives-refill", "kind": "lives", "price": 25},
	{"id": "time-3", "kind": "boost", "boost": "time", "amount": 3, "price": 30},
	{"id": "eliminate-3", "kind": "boost", "boost": "eliminate", "amount": 3, "price": 35},
	{"id": "skip-3", "kind": "boost", "boost": "skip", "amount": 3, "price": 45},
]
const STORE_PRODUCTS := [
	{"id": "shekels_120", "kind": "shekels", "amount": 120, "bonusPct": 0},
	{"id": "shekels_650", "kind": "shekels", "amount": 650, "bonusPct": 8},
	{"id": "shekels_1400", "kind": "shekels", "amount": 1400, "bonusPct": 17},
	{"id": "no_ads", "kind": "noAds", "amount": 0, "bonusPct": 0},
]
const LIVES_REFILL_PRICE := 25

## EconomyState da API ({} enquanto não carregou).
var state: Dictionary = {}
var _layer := CanvasLayer.new()
var _host := Control.new()
var _notice: PanelContainer
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_layer.layer = 20
	add_child(_layer)
	_host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_host.theme = Ui.theme
	_layer.add_child(_host)
	# Sessão nova (entrou, criou conta, trocou de conta): a carteira é outra.
	Api.session_changed.connect(func():
		if Api.access_token == "":
			state = {}
			changed.emit()
		elif state.is_empty() or str(state.get("_user", "")) != str(Api.user.get("id", "")):
			refresh())


# --- Estado -----------------------------------------------------------------------------


func refresh() -> Dictionary:
	var r := await Api.economy()
	if r.ok:
		apply(r.data)
	return r


func apply(economy: Variant) -> void:
	if economy is Dictionary and not (economy as Dictionary).is_empty():
		state = economy
		state["_user"] = str(Api.user.get("id", ""))
		changed.emit()


func ads_mode() -> String:
	return str(state.get("ads", {}).get("mode", "off"))


func store_mode() -> String:
	return str(state.get("store", {}).get("mode", "off"))


## Há anúncio com prêmio neste aparelho? (Só o de demonstração; o AdMob precisa do app instalado.)
func ads_on() -> bool:
	return ads_mode() == "demo" or ads_mode() == "trust-client"


func store_on() -> bool:
	return store_mode() == "demo"


func coins() -> int:
	return int(state.get("wallet", {}).get("coins", 0))


func shekels() -> int:
	return int(state.get("wallet", {}).get("shekels", 0))


func boosts(kind: String) -> int:
	return int(state.get("boosts", {}).get(kind, 0))


func ad_free() -> bool:
	return bool(state.get("adFree", false))


## {used, cap} dos anúncios com prêmio de hoje num lugar.
func today(placement: String) -> Dictionary:
	return state.get("rewardsToday", {}).get(placement, {"used": 0, "cap": 0})


func can_reward(placement: String) -> bool:
	var d := today(placement)
	return ads_on() and int(d.used) < int(d.cap)


# --- Textos ---------------------------------------------------------------------------------


func boost_name(kind: String) -> String:
	return I18n.t(BOOST_NAMES.get(kind, kind))


## "+15 moedas", "+1 vida no sevivon", "Ajuda: +10 segundos"…
func prize_label(prize: Dictionary) -> String:
	match str(prize.get("kind", "")):
		"coins", "double":
			return I18n.tn(int(prize.amount), "+{n} moeda", "+{n} moedas")
		"shekels":
			return I18n.tn(int(prize.amount), "+{n} shekel", "+{n} shekels")
		"life":
			return I18n.tn(int(prize.amount), "+{n} vida no sevivon", "+{n} vidas no sevivon")
		"boost":
			return I18n.t("Ajuda: {name}", {"name": boost_name(str(prize.boost))})
		"heart":
			return I18n.t("Continuar com 1 coração")
		"moves":
			return I18n.tn(int(prize.amount), "+{n} jogada", "+{n} jogadas")
	return ""


## Cor do selo de um prêmio.
func prize_color(prize: Dictionary) -> Color:
	match str(prize.get("kind", "")):
		"coins", "double":
			return Ui.GOLD
		"shekels":
			return Color("#F08FB0")
		"life", "heart":
			return Ui.RUBY
		"boost":
			return Ui.TEKHELET
		"moves":
			return Ui.EMERALD
	return Ui.ON


func product_name(id: String) -> String:
	for p in STORE_PRODUCTS:
		if p.id == id:
			return I18n.t("Sem anúncios") if p.kind == "noAds" else I18n.tn(int(p.amount), "{n} shekel", "{n} shekels")
	return id


## Selo do prêmio: o texto numa pílula da cor do prêmio.
func prize_badge(prize: Dictionary, size := 18) -> Control:
	var c := prize_color(prize)
	var p := Ui.pill(prize_label(prize), c, size)
	p.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	return p


# --- Anúncios com prêmio ------------------------------------------------------------------


## Pede a oferta: o prêmio vem aqui, para a tela mostrar antes do anúncio.
func offer(placement: String, ref := "") -> Dictionary:
	return await Api.reward_offer(placement, ref)


## Mostra o anúncio e resgata o prêmio. claimed | pending | skipped | failed | unavailable.
func watch(ticket: Dictionary, interstitial := false) -> String:
	if not ads_on():
		return "unavailable"
	var outcome: String = await _demo_ad(true, interstitial)
	if outcome == "dismissed":
		return "skipped"
	var w := await Api.reward_watched(str(ticket.id))
	if not w.ok:
		notify(str(w.message))
		return "failed"
	for wait in [0.0, 0.8, 1.5, 2.5]:
		if wait > 0:
			await get_tree().create_timer(wait).timeout
		var r := await Api.reward_claim(str(ticket.id))
		if r.ok and str(r.data.status) == "claimed":
			apply(r.data.economy)
			return "claimed"
		if not r.ok:
			notify(str(r.message))
			return "failed"
	notify(I18n.t("Seu prêmio está a caminho: ele aparece em instantes."))
	return "pending"


## Oferta + anúncio + resgate, para os lugares em que o prêmio já é conhecido (vida, continuar…).
func earn(placement: String, ref := "") -> String:
	var o := await offer(placement, ref)
	if not o.ok:
		notify(str(o.message))
		return "failed"
	var result := await watch(o.data)
	if result == "claimed":
		notify(prize_label(o.data.prize))
		Sfx.play("coin", 0.8)
	return result


# --- Pausas ---------------------------------------------------------------------------------


## Fim de partida ou de fase. Na hora do anúncio obrigatório, oferece antes o presente; quem
## recusa vê o anúncio comum. Nunca no meio de uma pergunta: quem chama é a tela de fim.
func ad_break(kind: String) -> void:
	if state.is_empty():
		await refresh()
	if state.is_empty() or ad_free() or not ads_on():
		return
	var r := await Api.ad_break(kind)
	if not r.ok or str(r.data.action) == "none":
		return
	var gift: Variant = r.data.get("gift")
	if gift is Dictionary and await _gift_intro(gift):
		var result := await watch(gift, true)
		if result == "claimed":
			notify(prize_label(gift.prize))
		if result != "failed":
			return
	await _demo_ad(false)


# --- Compras --------------------------------------------------------------------------------


## Compra um produto (aqui, a compra de demonstração). false: cancelada ou recusada.
func buy_product(product_id: String) -> bool:
	if not store_on():
		return false
	if not await _demo_purchase(product_id):
		return false
	var r := await Api.purchase("demo", product_id, _uuid())
	if not r.ok:
		notify(str(r.message))
		return false
	apply(r.data.economy)
	Sfx.play("coin", 0.9)
	notify(I18n.t("Pronto: sem anúncios obrigatórios.") if bool(r.data.granted.adFree) else I18n.tn(int(r.data.granted.shekels), "+{n} shekel", "+{n} shekels"))
	return true


## Gasta shekels numa oferta (vidas cheias, pacotes de ajudas).
func buy_offer(offer_id: String) -> bool:
	var r := await Api.buy_offer(offer_id)
	if not r.ok:
		notify(str(r.message))
		return false
	apply(r.data)
	Sfx.play("coin", 0.8)
	return true


func _uuid() -> String:
	var b := PackedByteArray()
	for i in 16:
		b.append(_rng.randi_range(0, 255))
	b[6] = (b[6] & 0x0F) | 0x40
	b[8] = (b[8] & 0x3F) | 0x80
	var h := b.hex_encode()
	return "%s-%s-%s-%s-%s" % [h.substr(0, 8), h.substr(8, 4), h.substr(12, 4), h.substr(16, 4), h.substr(20, 12)]


# --- Telas por cima de tudo -----------------------------------------------------------------


func _overlay(dark := false) -> Control:
	var o := Control.new()
	o.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	o.layout_direction = Control.LAYOUT_DIRECTION_RTL if I18n.rtl() else Control.LAYOUT_DIRECTION_LTR
	o.mouse_filter = Control.MOUSE_FILTER_STOP
	var bg := ColorRect.new()
	bg.color = Color("#0B1240") if dark else Color(0.03, 0.04, 0.12, 0.8)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	o.add_child(bg)
	_host.add_child(o)
	Ui.fade_in(o, 0.0, 0.2)
	return o


func _card(o: Control) -> VBoxContainer:
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	o.add_child(center)
	var panel := Ui.panel(Ui.VELVET, 24, 20)
	panel.custom_minimum_size.x = minf(400.0, _host.size.x - 32.0)
	center.add_child(panel)
	var v := Ui.vbox(14)
	panel.add_child(v)
	return v


## Anúncio de demonstração: contagem regressiva; no com prêmio, "Pegar o prêmio" só no fim
## (fechar antes não dá nada, como num anúncio de verdade). earned | dismissed.
func _demo_ad(rewarded: bool, _interstitial := false) -> String:
	var o := _overlay(true)
	var col := Column.new(Ui.margin(Ui.vbox(16), 0, 40, 0, 32), true)
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	o.add_child(col)
	var v: VBoxContainer = col.get_child(0).get_child(0)
	var top := Ui.hbox(8)
	var tag := Ui.pill(I18n.t("Anúncio de demonstração"), Ui.GOLD, 12)
	top.add_child(tag)
	var gap := Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(gap)
	var close := Ui.button("✕", "velvet", "sm")
	close.custom_minimum_size.x = 44
	close.tooltip_text = I18n.t("Fechar")
	top.add_child(close)
	var count := Ui.label(str(DEMO_AD_SECONDS), 16, Ui.MUTED, "semibold")
	count.autowrap_mode = TextServer.AUTOWRAP_OFF
	count.size_flags_horizontal = Control.SIZE_SHRINK_END
	top.add_child(count)
	v.add_child(top)
	var body := Ui.vbox(16)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.alignment = BoxContainer.ALIGNMENT_CENTER
	var gems := Ui.hbox(6)
	gems.alignment = BoxContainer.ALIGNMENT_CENTER
	for i in 6:
		gems.add_child(StoneIcon.new(i, 34))
	body.add_child(gems)
	body.add_child(Ui.title(I18n.t("Aqui entra um anúncio"), 28, Ui.ON, HORIZONTAL_ALIGNMENT_CENTER))
	body.add_child(Ui.label(I18n.t("No app publicado, o anúncio vem do Google. Nesta versão de teste, o jogo só mostra esta tela."), 15, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(body)
	var claim: Button = null
	if rewarded:
		claim = Ui.button(I18n.t("O prêmio libera em {n} s", {"n": DEMO_AD_SECONDS}), "velvet", "lg")
		claim.disabled = true
		v.add_child(claim)
	# Anúncio sem prêmio: o fechar só aparece no fim da contagem.
	close.visible = rewarded
	count.visible = not rewarded
	print("DEMO_AD rewarded=%s" % rewarded)
	var result := {"v": ""}
	var finish := func(value: String) -> void:
		if result.v == "":
			result.v = value
	close.pressed.connect(func(): finish.call("earned" if rewarded and claim != null and not claim.disabled else "dismissed"))
	if claim:
		claim.pressed.connect(func(): finish.call("earned"))
	var left := DEMO_AD_SECONDS
	while left > 0 and result.v == "":
		await get_tree().create_timer(1.0).timeout
		left -= 1
		count.text = str(left)
		if claim and left > 0:
			claim.text = I18n.t("O prêmio libera em {n} s", {"n": left})
	if claim and result.v == "":
		claim.disabled = false
		claim.text = I18n.t("Pegar o prêmio")
		Ui.style_button(claim, "emerald", "lg")
		Ui.mark("demo-ad-reward", claim)
	elif result.v == "":
		count.visible = false
		close.visible = true
		Ui.mark("demo-ad-close", close)
	while result.v == "":
		await get_tree().process_frame
	o.queue_free()
	return result.v


## O aviso do presente antes do anúncio de pausa: mostra o prêmio, começa sozinho em 5 s e
## tem "Não, obrigado" (regra do AdMob para anúncio de pausa com prêmio).
func _gift_intro(ticket: Dictionary) -> bool:
	var o := _overlay()
	var v := _card(o)
	v.add_child(Ui.title(I18n.t("Um presente antes da pausa"), 24, Ui.ON, HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(prize_badge(ticket.prize, 20))
	var note := Ui.label("", 15, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER)
	v.add_child(note)
	var yes := Ui.button(I18n.t("Assistir agora"), "emerald")
	v.add_child(yes)
	var no := Ui.button(I18n.t("Não, obrigado"), "ghost", "sm")
	v.add_child(no)
	Ui.mark("gift-accept", yes)
	Ui.mark("gift-decline", no)
	print("GIFT_INTRO")
	var result := {"v": -1}
	yes.pressed.connect(func(): result.v = 1)
	no.pressed.connect(func(): result.v = 0)
	var left := GIFT_COUNTDOWN
	while left > 0 and result.v < 0:
		note.text = I18n.t("Assista a um anúncio curto e o presente é seu. O anúncio começa em {n} s.", {"n": left})
		await get_tree().create_timer(1.0).timeout
		left -= 1
	o.queue_free()
	return result.v != 0


## Confirmação da compra de demonstração (nada é cobrado).
func _demo_purchase(product_id: String) -> bool:
	var o := _overlay()
	var v := _card(o)
	v.add_child(Ui.title(product_name(product_id), 24, Ui.ON, HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(Ui.label(I18n.t("Compra de demonstração: nada é cobrado. No app publicado, quem cobra é a App Store ou o Google Play."), 15, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	var yes := Ui.button(I18n.t("Confirmar compra"), "emerald")
	v.add_child(yes)
	var no := Ui.button(I18n.t("Cancelar"), "ghost", "sm")
	v.add_child(no)
	Ui.mark("purchase-confirm", yes)
	var result := {"v": -1}
	yes.pressed.connect(func(): result.v = 1)
	no.pressed.connect(func(): result.v = 0)
	while result.v < 0:
		await get_tree().process_frame
	o.queue_free()
	return result.v == 1


## Aviso curto no rodapé.
func notify(text: String) -> void:
	if text == "":
		return
	if is_instance_valid(_notice):
		_notice.queue_free()
	var p := PanelContainer.new()
	var s := Ui.box(Color(0.075, 0.11, 0.33, 0.95), 16, Ui.GOLD, 1, 0)
	s.content_margin_left = 16
	s.content_margin_right = 16
	s.content_margin_top = 10
	s.content_margin_bottom = 10
	p.add_theme_stylebox_override("panel", s)
	var l := Ui.label(text, 15, Ui.ON, "semibold", HORIZONTAL_ALIGNMENT_CENTER)
	l.custom_minimum_size.x = 0
	p.add_child(l)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var w := minf(360.0, _host.size.x - 32.0)
	p.custom_minimum_size.x = w
	p.position = Vector2((_host.size.x - w) / 2.0, _host.size.y - 140.0)
	_host.add_child(p)
	_notice = p
	print("NOTICE %s" % text)
	Ui.fade_in(p, 0.0, 0.2)
	await get_tree().create_timer(2.6).timeout
	if is_instance_valid(p):
		var tw := p.create_tween()
		tw.tween_property(p, "modulate:a", 0.0, 0.25)
		tw.tween_callback(p.queue_free)


# --- "Sem anúncios" -------------------------------------------------------------------------


## Botão pequeno "Sem anúncios" (porte do NoAdsFab): some quando a conta já tirou os
## anúncios ou quando não há anúncio nesta instalação.
func no_ads_button() -> Button:
	var b := Ui.button(I18n.t("Sem anúncios"), "ghost", "sm")
	b.tooltip_text = I18n.t("Mostra como tirar os anúncios obrigatórios")
	b.add_theme_font_size_override("font_size", 13)
	var sync := func():
		if is_instance_valid(b):
			b.visible = not state.is_empty() and not ad_free() and ads_mode() != "off"
	sync.call()
	changed.connect(sync)
	b.tree_exited.connect(func():
		if changed.is_connected(sync):
			changed.disconnect(sync))
	b.pressed.connect(no_ads_sheet)
	return b


func no_ads_sheet() -> void:
	var o := _overlay()
	var v := _card(o)
	v.add_child(Ui.title(I18n.t("Sem anúncios"), 26, Ui.ON, HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(Ui.label(I18n.t("Tira para sempre os anúncios obrigatórios das pausas, em qualquer aparelho com a sua conta."), 15, Ui.ON, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(Ui.label(I18n.t("Os anúncios com prêmio continuam aqui: assista quando quiser ganhar uma vida, uma ajuda ou o prêmio da rodada."), 14, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
	if store_on():
		v.add_child(Ui.label(I18n.t("Modo de demonstração: nada é cobrado."), 14, Ui.GOLD, "semibold", HORIZONTAL_ALIGNMENT_CENTER))
		var buy := Ui.button(I18n.t("Comprar"), "emerald")
		buy.pressed.connect(func():
			o.visible = false
			if await buy_product("no_ads"):
				o.queue_free()
			else:
				o.visible = true)
		v.add_child(buy)
		Ui.mark("no-ads-buy", buy)
	else:
		v.add_child(Ui.label(I18n.t("A compra fica disponível no app instalado pela App Store ou pelo Google Play."), 14, Ui.GOLD, "semibold", HORIZONTAL_ALIGNMENT_CENTER))
	var later := Ui.button(I18n.t("Agora não"), "ghost", "sm")
	later.pressed.connect(o.queue_free)
	v.add_child(later)
