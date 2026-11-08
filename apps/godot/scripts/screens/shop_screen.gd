## Loja do Golem (porte de app/journey/shop.tsx), em abas: Armário (equipamentos, com
## moedas de sabedoria), Personagens (da história e visitantes) e Barro (o material).
## Tocar num item veste o Golem só de prova, na vitrine, para ver antes de comprar.
## Ajudas: a mochila, vidas e pacotes com shekels e as ofertas com anúncio. Shekels: os
## pacotes e o "Sem anúncios" (compra de demonstração; no app publicado, a loja cobra).
class_name ShopScreen
extends Control

const TABS := [["equipment", "Armário", ["head", "face", "body", "hand", "companion"]], ["character", "Personagens", ["costume"]], ["skin", "Barro", ["skin"]], ["help", "Ajudas", []], ["shekels", "Shekels", []]]

var shop: Dictionary = {}
var _tab := "equipment"
var _trying := ""
var _view := SubViewportContainer.new()
var _viewport := SubViewport.new()
var _pivot := Node3D.new()
var _golem: Golem
var _list := Ui.vbox(10)
var _tabs := HFlowContainer.new()
## Ajuda mostrada antes do anúncio (o prêmio aparece primeiro; o anúncio, no segundo toque).
var _boost_offer: Dictionary = {}
var _coins: PanelContainer
var _shekels: PanelContainer
var _note: Label
var _busy := false
## Marcadores para os testes no navegador (repetidos quando a página rola).
var _marks := {}


func setup(params: Dictionary) -> void:
	if str(params.get("tab", "")) in ["help", "shekels"]:
		_tab = str(params.tab)


func _ready() -> void:
	var content := Ui.vbox(14)
	var scroll := Column.scrolling(Ui.margin(content, 0, 14, 0, 28))
	add_child(scroll)
	Ui.mark_on_scroll(scroll, _marks)
	var top := Ui.hbox(8)
	var back := Ui.button(I18n.t("Voltar"), "ghost", "sm")
	back.pressed.connect(func(): Main.instance.go("journey"))
	top.add_child(back)
	var title := Ui.title(I18n.t("Loja do Golem"), 24)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	top.add_child(title)
	_coins = Ui.pill(I18n.tn(0, "{n} moeda", "{n} moedas"), Ui.GOLD, 13)
	_coins.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	top.add_child(_coins)
	_shekels = Ui.pill("0 ₪", Color("#F08FB0"), 13)
	_shekels.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	top.add_child(_shekels)
	content.add_child(top)
	content.add_child(_showcase())
	_note = Ui.label("", 14, Ui.GOLD, "medium", HORIZONTAL_ALIGNMENT_CENTER)
	content.add_child(_note)
	_tabs.add_theme_constant_override("h_separation", 8)
	_tabs.add_theme_constant_override("v_separation", 8)
	content.add_child(_tabs)
	content.add_child(_list)
	content.add_child(Ui.label(I18n.t("As vantagens dos itens valem só no Golem World. No sevivon todo mundo joga em pé de igualdade: lá o Golem só mostra o visual."), 13, Ui.MUTED))
	_list.add_child(Ui.label(I18n.t("Abrindo o armário…"), 16, Ui.ON, "semibold", HORIZONTAL_ALIGNMENT_CENTER))
	var tab := Main.query("tab")
	if tab in ["help", "shekels"]:
		_tab = tab
	Economy.changed.connect(_on_economy)
	_load()


## Saldo novo (compra, anúncio): a carteira do topo e a aba atual.
func _on_economy() -> void:
	if shop.is_empty() or not is_inside_tree():
		return
	shop.coins = Economy.coins()
	shop.shekels = Economy.shekels()
	(_coins.get_child(0) as Label).text = I18n.tn(int(shop.coins), "{n} moeda", "{n} moedas")
	(_shekels.get_child(0) as Label).text = "%s ₪" % I18n.number(int(shop.shekels))
	if _tab in ["help", "shekels"]:
		_render()


## A vitrine: o Golem num pedestal, girando devagar.
func _showcase() -> Control:
	var frame := PanelContainer.new()
	var s := Ui.box(Color("#2C3988"), 20, Ui.LINE, 1, 0)
	frame.add_theme_stylebox_override("panel", s)
	frame.custom_minimum_size.y = 250
	_view.stretch = true
	_view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_viewport.own_world_3d = true
	_viewport.msaa_3d = Viewport.MSAA_4X
	_viewport.transparent_bg = true
	_view.add_child(_viewport)
	frame.add_child(_view)
	var root := Node3D.new()
	_viewport.add_child(root)
	var env := Environment.new()
	env.background_mode = Environment.BG_CLEAR_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#FFF6E6").lerp(Color("#8C6A4A"), 0.3)
	env.ambient_light_energy = 2.0 / PI
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.adjustment_enabled = true
	env.adjustment_saturation = 0.85
	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color("#FFE8C4")
	sun.light_energy = 2.0 / PI
	sun.shadow_enabled = true
	root.add_child(sun)
	sun.look_at_from_position(Vector3(4, 8, 6), Vector3.ZERO)
	var cam := Camera3D.new()
	cam.fov = 30
	root.add_child(cam)
	cam.look_at_from_position(Vector3(0, 1.6, 7.2), Vector3(0, 1.0, 0))
	root.add_child(Kit.mesh(Geo.cyl(1.25, 1.35, 0.22, 24), Kit.mat("#E9D9B5"), {"p": [0, -0.11, 0]}))
	root.add_child(Kit.mesh(Geo.cyl(1.32, 1.32, 0.04, 24), Kit.mat(Kit.C.gold), {"p": [0, 0.01, 0], "shadow": false}))
	root.add_child(_pivot)
	return frame


func _process(dt: float) -> void:
	_pivot.rotation.y += dt * 0.5


func _load() -> void:
	var r := await Api.shop()
	await Economy.refresh()
	if not is_inside_tree():
		return
	if not r.ok:
		for c in _list.get_children():
			c.queue_free()
		_list.add_child(Ui.label(r.message, 15, Ui.ERROR))
		return
	_apply(r.data)
	print("SHOP_READY")


func _apply(data: Dictionary) -> void:
	shop = data
	(_coins.get_child(0) as Label).text = I18n.tn(int(data.coins), "{n} moeda", "{n} moedas")
	(_shekels.get_child(0) as Label).text = "%s ₪" % I18n.number(int(data.shekels))
	_dress()
	_render()


## O Golem da vitrine: o que está vestido, mais o item de prova.
func _dress() -> void:
	var look: Dictionary = (shop.golem as Dictionary).duplicate(true)
	if _trying != "":
		var it := JourneyData.item(_trying)
		look.equipped[str(it.slot)] = _trying
	if _golem:
		_golem.queue_free()
	_golem = Golem.build(look)
	_golem.pose_name = "cheer" if _trying != "" else "idle"
	_pivot.add_child(_golem)
	_note.text = I18n.t("Só de prova: toque de novo para tirar.") if _trying != "" else ""


func _render() -> void:
	for c in _tabs.get_children():
		c.queue_free()
	for t in TABS:
		var b := Ui.button(I18n.t(t[1]), "gold" if t[0] == _tab else "velvet", "sm")
		_mark("shop-tab-" + str(t[0]), b)
		var key: String = t[0]
		b.pressed.connect(func():
			_tab = key
			_render())
		_tabs.add_child(b)
	for c in _list.get_children():
		c.queue_free()
	if _tab == "help":
		_help_tab()
		return
	if _tab == "shekels":
		_shekels_tab()
		return
	var slots: Array = []
	for t in TABS:
		if t[0] == _tab:
			slots = t[2]
	if _tab == "character":
		_list.add_child(Ui.label(I18n.t("Fantasias para o Golem, como no Purim. Só mudam o visual; as vantagens dos itens continuam valendo por baixo."), 14, Ui.MUTED))
	for s in shop.items:
		var it := JourneyData.item(str(s.id))
		if it.is_empty() or not slots.has(str(it.slot)):
			continue
		_list.add_child(_card(s, it))


func _card(s: Dictionary, it: Dictionary) -> Control:
	var on := bool(s.equipped)
	var panel := Ui.panel(Color("#26317A") if on else Ui.VELVET, 18, 14, Ui.TEKHELET if on else Ui.LINE)
	var v := Ui.vbox(6)
	panel.add_child(v)
	var head := Ui.hbox(8)
	head.add_child(Ui.label(JourneyData.loc(it.name), 17, Ui.ON, "semibold"))
	head.add_child(Ui.pill(JourneyData.loc(JourneyData.data().slots[str(it.slot)]), Ui.MUTED, 12))
	if on:
		head.add_child(Ui.pill(I18n.t("vestido"), Ui.EMERALD, 12))
	v.add_child(head)
	if it.get("perk") != null:
		v.add_child(Ui.label(JourneyData.loc(it.perk), 14, Ui.GOLD, "medium"))
	v.add_child(Ui.label(JourneyData.loc(it.flavor), 14, Ui.MUTED))
	var row := Ui.hbox(8)
	var id := str(s.id)
	var try := Ui.button(I18n.t("Tirar") if _trying == id else I18n.t("Provar"), "ghost", "sm")
	try.pressed.connect(func():
		_trying = "" if _trying == id else id
		Sfx.play("pop", 0.5)
		_dress()
		_render())
	row.add_child(try)
	if bool(s.owned):
		var wear := Ui.button(I18n.t("Tirar") if on else I18n.t("Vestir"), "velvet" if on else "emerald", "sm")
		wear.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		wear.pressed.connect(func(): _equip(id, not on))
		row.add_child(wear)
	elif bool(s.purchasable) and s.get("price") != null:
		var coins := str(s.currency) == "coins"
		var price := int(s.price)
		var label := I18n.tn(price, "{n} moeda", "{n} moedas") if coins else "%s ₪" % I18n.number(price)
		var buy := Ui.button("%s · %s" % [I18n.t("Comprar"), label], "gold", "sm")
		buy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		buy.disabled = price > int(shop.coins if coins else shop.shekels)
		buy.pressed.connect(func(): _buy(id))
		row.add_child(buy)
	elif s.get("howToEarn") != null:
		var how := Ui.label(str(s.howToEarn), 13, Ui.MUTED)
		row.add_child(how)
	v.add_child(row)
	return panel


func _buy(id: String) -> void:
	if _busy:
		return
	_busy = true
	var r := await Api.shop_buy(id)
	_busy = false
	if r.ok:
		Sfx.play("coin", 0.8)
		_trying = ""
		_apply(r.data)
		# Comprou, já veste.
		_equip(id, true)
	else:
		_note.text = r.message


func _equip(id: String, on: bool) -> void:
	if _busy:
		return
	_busy = true
	var r := await Api.shop_equip(id, on)
	_busy = false
	if r.ok:
		Sfx.play("power", 0.6)
		_trying = ""
		_apply(r.data)
	else:
		_note.text = r.message



# --- Ajudas e shekels --------------------------------------------------------------------


func _mark(name: String, node: Control) -> void:
	_marks[name] = node
	Ui.mark(name, node)


func _section(title: String, note := "") -> void:
	var l := Ui.title(title, 20, Ui.GOLD)
	l.custom_minimum_size.y = 34
	l.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	_list.add_child(l)
	if note != "":
		_list.add_child(Ui.label(note, 14, Ui.MUTED))


## Uma linha de oferta: título, nota e o botão à direita.
func _offer_row(title: String, note: String, button: Button, extra: Control = null) -> Control:
	var panel := Ui.panel(Ui.VELVET, 18, 14)
	var row := Ui.hbox(12)
	panel.add_child(row)
	var v := Ui.vbox(4)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if extra:
		v.add_child(extra)
	else:
		v.add_child(Ui.label(title, 16, Ui.ON, "semibold"))
	if note != "":
		v.add_child(Ui.label(note, 13, Ui.MUTED))
	row.add_child(v)
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(button)
	return panel


func _help_tab() -> void:
	if Economy.state.is_empty():
		_list.add_child(Ui.label(I18n.t("Carregando…"), 15, Ui.MUTED))
		return
	var lives: Dictionary = Economy.state.lives
	var full := int(lives.lives) >= int(lives.max)
	_section(I18n.t("Sua mochila"), I18n.t("As ajudas valem só no Golem World, quando as dos itens da fase acabam. O sevivon não tem ajuda nenhuma."))
	var bag := Ui.panel(Ui.VELVET, 18, 14)
	var grid := Ui.hbox(8)
	bag.add_child(grid)
	for b in ["time", "skip", "eliminate"]:
		var col := Ui.vbox(2)
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		col.add_child(Ui.label(str(Economy.boosts(b)), 22, Ui.ON, "bold", HORIZONTAL_ALIGNMENT_CENTER))
		col.add_child(Ui.label(Economy.boost_name(b), 13, Ui.MUTED, "regular", HORIZONTAL_ALIGNMENT_CENTER))
		grid.add_child(col)
	_list.add_child(bag)
	_section(I18n.t("Com shekels"))
	for o in Economy.SHEKEL_OFFERS:
		var price := int(o.price)
		var b := Ui.button("%s ₪" % price, "gold", "sm")
		b.disabled = Economy.shekels() < price or (o.kind == "lives" and full)
		var id: String = o.id
		b.pressed.connect(func():
			b.disabled = true
			if await Economy.buy_offer(id):
				Economy.notify(I18n.t("Pronto!"))
			_render())
		_mark("offer-" + id, b)
		var title := I18n.t("Vidas cheias no sevivon") if o.kind == "lives" else I18n.t("Pacote: {n}× {name}", {"n": int(o.amount), "name": Economy.boost_name(str(o.boost))})
		var note := I18n.t("Agora: {n} de {max}", {"n": int(lives.lives), "max": int(lives.max)}) if o.kind == "lives" else ""
		_list.add_child(_offer_row(title, note, b))
	if Economy.ads_on():
		_section(I18n.t("Com um anúncio"), I18n.t("Só se você quiser: o prêmio aparece antes, e o anúncio começa quando você tocar."))
		var life := Ui.button(I18n.t("Assistir"), "velvet", "sm")
		life.disabled = full or not Economy.can_reward("life")
		life.pressed.connect(func():
			life.disabled = true
			await Economy.earn("life")
			_render())
		_mark("ad-life", life)
		_list.add_child(_offer_row(I18n.t("+1 vida no sevivon"), I18n.t("Suas vidas estão cheias.") if full else I18n.t("Agora: {n} de {max}", {"n": int(lives.lives), "max": int(lives.max)}), life))
		var used := Economy.today("boost")
		var boost := Ui.button(I18n.t("Assistir") if not _boost_offer.is_empty() else I18n.t("Ver prêmio"), "velvet", "sm")
		boost.disabled = int(used.used) >= int(used.cap)
		boost.pressed.connect(func():
			boost.disabled = true
			if _boost_offer.is_empty():
				var r := await Economy.offer("boost")
				if r.ok:
					_boost_offer = r.data
				else:
					Economy.notify(str(r.message))
			else:
				var result := await Economy.watch(_boost_offer)
				if result == "claimed":
					Economy.notify(Economy.prize_label(_boost_offer.prize))
					_boost_offer = {}
			_render())
		_mark("ad-boost", boost)
		var badge: Control = Economy.prize_badge(_boost_offer.prize, 15) if not _boost_offer.is_empty() else null
		if badge:
			badge.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_list.add_child(_offer_row(I18n.t("Uma ajuda para a mochila"), I18n.t("{used} de {cap} hoje", {"used": int(used.used), "cap": int(used.cap)}), boost, badge))
	print("SHOP_HELP_READY")


func _shekels_tab() -> void:
	if Economy.state.is_empty():
		_list.add_child(Ui.label(I18n.t("Carregando…"), 15, Ui.MUTED))
		return
	_list.add_child(Ui.label(I18n.t("Shekels compram o material do Golem, os personagens visitantes, vidas e ajudas. Nada que decida uma partida do sevivon: lá todo mundo joga igual."), 14, Ui.MUTED))
	var store := Economy.store_on()
	_list.add_child(Ui.label(I18n.t("Modo de demonstração: nada é cobrado.") if store else I18n.t("As compras ficam disponíveis no app instalado pela App Store ou pelo Google Play."), 15, Ui.GOLD, "semibold"))
	for p in Economy.STORE_PRODUCTS:
		var id: String = p.id
		var buy := Ui.button(I18n.t("Comprar"), "emerald", "sm")
		buy.visible = store
		if p.kind == "noAds":
			continue
		buy.pressed.connect(func():
			buy.disabled = true
			await Economy.buy_product(id)
			buy.disabled = false)
		_mark("product-" + id, buy)
		_list.add_child(_offer_row(Economy.product_name(id), I18n.t("+{n}% de bônus", {"n": int(p.bonusPct)}) if int(p.bonusPct) > 0 else "", buy))
	_section(I18n.t("Sem anúncios"))
	var no_ads := Ui.button(I18n.t("Comprar"), "emerald", "sm")
	no_ads.visible = store and not Economy.ad_free()
	no_ads.pressed.connect(func():
		no_ads.disabled = true
		await Economy.buy_product("no_ads")
		_render())
	_mark("product-no_ads", no_ads)
	var ok := Ui.label("✓", 22, Ui.EMERALD, "bold")
	_list.add_child(_offer_row(I18n.t("Você já tirou os anúncios obrigatórios.") if Economy.ad_free() else I18n.t("Sem anúncio obrigatório nas pausas, para sempre."), I18n.t("Os anúncios com prêmio continuam disponíveis para quando você quiser."), no_ads))
	ok.queue_free()
	print("SHOP_SHEKELS_READY")
