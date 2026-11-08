## Cliente HTTP da API do Trivia Torá (as mesmas rotas do app React Native).
##
## - Cada chamada devolve um Dictionary: {ok: true, status, data} ou
##   {ok: false, status, code, message}. A mensagem de erro já vem no idioma do jogador
##   (a API lê o Accept-Language).
## - O token de acesso fica só em memória; o de renovação, em user://session.cfg e, na web,
##   também no localStorage do navegador. O user:// da web vai para o IndexedDB em segundo
##   plano: recarregar a página logo depois de uma renovação podia ler o token anterior, já
##   girado, e o servidor encerraria a sessão por reaproveitamento. O localStorage grava na hora.
## - Renovação "de voo único": várias chamadas que recebem 401 ao mesmo tempo esperam UMA
##   renovação, porque a API gira o refresh token a cada uso e encerra todas as sessões
##   se um token antigo for reaproveitado.
## - A sessão só é apagada quando a API diz que ela acabou (401). Rede fora, limite de
##   requisições ou erro do servidor mantêm o token: para um convidado, apagar o token
##   seria perder a conta.
extends Node

signal session_changed

const SESSION := "user://session.cfg"
const WEB_KEY := "trivia.refresh"
const SERVER_USER := "user://server.cfg"
const SERVER_RES := "res://server.cfg"

var base_url := ""
var access_token := ""
## PublicUser: {id, displayName, isGuest, totalPoints}.
var user: Dictionary = {}
var _refresh_token := ""
var _refreshing := false
var _refresh_state := 0
signal _refresh_finished


func _ready() -> void:
	base_url = _detect_base_url().rstrip("/")
	var cfg := ConfigFile.new()
	if cfg.load(SESSION) == OK:
		_refresh_token = str(cfg.get_value("auth", "refresh", ""))
	var web := _web_storage()
	if web != null:
		var stored: Variant = web.getItem(WEB_KEY)
		if stored != null:
			_refresh_token = str(stored)


func _detect_base_url() -> String:
	var env := OS.get_environment("TRIVIA_API_URL")
	if env != "":
		return env
	if OS.has_feature("web"):
		# Servido pela própria API (pnpm lan): a página diz onde ela está (<meta name="trivia-api">).
		# Sem eval de JavaScript (a CSP da página não deixa): lê os objetos do navegador direto.
		var location: JavaScriptObject = JavaScriptBridge.get_interface("location")
		var document: JavaScriptObject = JavaScriptBridge.get_interface("document")
		var prefix := "/api"
		if document:
			var meta: Variant = document.querySelector("meta[name=trivia-api]")
			if meta != null and str(meta.content) != "":
				prefix = str(meta.content)
		return (str(location.origin) if location else "") + prefix
	# No jogo instalado: o endereço que o jogador escolheu, o que o script de exportação
	# gravou (server.cfg, com o IP do computador na rede de casa) ou o padrão do projeto.
	for file in [SERVER_USER, SERVER_RES]:
		var cfg := ConfigFile.new()
		if cfg.load(file) == OK and str(cfg.get_value("server", "api_url", "")) != "":
			return str(cfg.get_value("server", "api_url"))
	return str(ProjectSettings.get_setting("trivia/api_url", "http://127.0.0.1:3000"))


## Endereço da API escolhido no jogo instalado (a tela sem conexão e a de boas-vindas deixam
## trocar). A sessão salva é de outro servidor: volta a ser convidado novo.
func set_base_url(url: String) -> void:
	var clean := url.strip_edges().rstrip("/")
	if clean != "" and not clean.begins_with("http"):
		clean = "http://" + clean
	if clean.count(":") == 1 and clean.begins_with("http://"):
		clean += ":3000"
	var cfg := ConfigFile.new()
	cfg.set_value("server", "api_url", clean)
	cfg.save(SERVER_USER)
	if clean != base_url:
		_store_refresh("")
		_refresh_token = ""
		access_token = ""
		user = {}
	base_url = clean


## Na web o jogo sempre fala com o endereço da página; só o instalado escolhe o servidor.
func can_choose_server() -> bool:
	return not OS.has_feature("web")


func _web_storage() -> JavaScriptObject:
	return JavaScriptBridge.get_interface("localStorage") if OS.has_feature("web") else null


func _store_refresh(token: String) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("auth", "refresh", token)
	cfg.save(SESSION)
	var web := _web_storage()
	if web != null:
		if token == "":
			web.removeItem(WEB_KEY)
		else:
			web.setItem(WEB_KEY, token)


func has_stored_session() -> bool:
	return _refresh_token != ""


# --- Sessão -----------------------------------------------------------------------------


## Retoma a sessão salva no aparelho: 1 = ok, 0 = não há sessão válida, -1 = sem conexão.
func restore() -> int:
	return await _refresh()


func guest(display_name: String = "") -> Dictionary:
	var body := {"locale": I18n.locale}
	if display_name.strip_edges() != "":
		body["displayName"] = display_name.strip_edges()
	var r := await _raw(HTTPClient.METHOD_POST, "/auth/guest", body, "")
	if r.ok:
		_adopt(r.data)
	return r


## Entra com e-mail e senha (troca a sessão deste aparelho pela da conta).
func login(email: String, password: String) -> Dictionary:
	var r := await _raw(HTTPClient.METHOD_POST, "/auth/login", {"email": email.strip_edges(), "password": password}, "")
	if r.ok:
		_adopt(r.data)
	return r


## Com a sessão de convidado aberta, a API promove a conta do convidado (mantém pontos e partidas).
func register(email: String, password: String, display_name: String) -> Dictionary:
	var r := await request(HTTPClient.METHOD_POST, "/auth/register", {"email": email.strip_edges(), "password": password, "displayName": display_name, "locale": I18n.locale})
	if r.ok:
		_adopt(r.data)
	return r


## Que logins sociais o servidor aceita: {google, apple, facebook} (booleanos).
func providers() -> Dictionary:
	return await _raw(HTTPClient.METHOD_GET, "/auth/providers", null, "")


## Login com Google ou Facebook. Com sessão aberta (convidado ou conta), o login é ligado à
## conta atual, que mantém o progresso; sem sessão, entra (ou cria a conta).
func social(provider: String, token: String, nonce := "") -> Dictionary:
	var body := {"provider": provider, "token": token, "locale": I18n.locale}
	if nonce != "":
		body["nonce"] = nonce
	var r: Dictionary
	if access_token != "" or _refresh_token != "":
		r = await request(HTTPClient.METHOD_POST, "/auth/social", body)
	else:
		r = await _raw(HTTPClient.METHOD_POST, "/auth/social", body, "")
	if r.ok:
		_adopt(r.data)
	return r


## Troca a senha; as outras sessões caem e este aparelho recebe tokens novos.
func change_password(current: String, new_password: String) -> Dictionary:
	var r := await request(HTTPClient.METHOD_POST, "/me/password", {"currentPassword": current, "newPassword": new_password})
	if r.ok:
		_adopt(r.data)
	return r


## Encerra a sessão em todos os aparelhos, inclusive neste.
func logout_all() -> Dictionary:
	var r := await request(HTTPClient.METHOD_POST, "/auth/logout-all")
	if r.ok:
		_clear()
	return r


## Desliga um login social (precisa sobrar outro jeito de entrar).
func unlink(provider: String) -> Dictionary:
	return await request(HTTPClient.METHOD_DELETE, "/me/identities/%s" % provider)


## Exclui a conta (conta com senha: confirma com ela) e encerra a sessão local.
func delete_account(password := "") -> Dictionary:
	var body := {"confirm": true}
	if password != "":
		body["password"] = password
	var r := await request(HTTPClient.METHOD_POST, "/me/delete", body)
	if r.ok:
		_clear()
	return r


func logout() -> void:
	if _refresh_token != "":
		await _raw(HTTPClient.METHOD_POST, "/auth/logout", {"refreshToken": _refresh_token}, "")
	_clear()


func _adopt(tokens: Dictionary) -> void:
	access_token = str(tokens.get("accessToken", ""))
	_refresh_token = str(tokens.get("refreshToken", ""))
	user = tokens.get("user", {})
	_store_refresh(_refresh_token)
	session_changed.emit()


func _clear() -> void:
	access_token = ""
	_refresh_token = ""
	user = {}
	_store_refresh("")
	session_changed.emit()


func _refresh() -> int:
	if _refreshing:
		await _refresh_finished
		return _refresh_state
	if _refresh_token == "":
		return 0
	_refreshing = true
	var r := await _raw(HTTPClient.METHOD_POST, "/auth/refresh", {"refreshToken": _refresh_token}, "")
	if r.ok:
		_adopt(r.data)
		_refresh_state = 1
	elif r.status == 401:
		_clear()
		_refresh_state = 0
	else:
		_refresh_state = -1
	_refreshing = false
	_refresh_finished.emit()
	return _refresh_state


# --- Rotas ------------------------------------------------------------------------------


func me() -> Dictionary:
	return await request(HTTPClient.METHOD_GET, "/me")


func rename(display_name: String) -> Dictionary:
	var r := await request(HTTPClient.METHOD_PATCH, "/me", {"displayName": display_name.strip_edges()})
	if r.ok:
		user["displayName"] = str(r.data.get("displayName", display_name))
		session_changed.emit()
	return r


## period: week | all.
func ranking(period: String) -> Dictionary:
	return await request(HTTPClient.METHOD_GET, "/ranking?period=%s" % period)


func set_locale(value: String) -> Dictionary:
	return await request(HTTPClient.METHOD_PATCH, "/me", {"locale": value})


func games() -> Dictionary:
	return await request(HTTPClient.METHOD_GET, "/games")


## invite_code: entrar na partida de um amigo (modo friend) pelo código de 6 letras.
func game_create(mode: String, invite_code := "") -> Dictionary:
	var body := {"mode": mode}
	if invite_code != "":
		body["inviteCode"] = invite_code
	return await request(HTTPClient.METHOD_POST, "/games", body)


func game_state(id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_GET, "/games/%s" % id)


## with_prize: este aparelho consegue mostrar um anúncio com prêmio agora (só então a face
## do Prêmio entra no sorteio).
func spin(id: String, with_prize := false) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/games/%s/spin" % id, {"withPrize": with_prize})


func question(id: String, spin_id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/games/%s/question" % id, {"spinId": spin_id})


func current_question(id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_GET, "/games/%s/question" % id)


func crown(id: String, category: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/games/%s/crown" % id, {"category": category})


## option_index = -1: o tempo acabou (vai null para a API).
func answer(id: String, play_id: String, option_index: int) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/games/%s/answer" % id, {"playId": play_id, "optionIndex": option_index if option_index >= 0 else null})


func forfeit(id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/games/%s/forfeit" % id)


## Prepara perguntas no idioma do jogador antes de abrir o sevivon.
func prepare() -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/games/prepare")


## reason: incorrect | ambiguous | disrespectful | typo | other.
func report_question(play_id: String, reason: String, comment := "") -> Dictionary:
	var body := {"playId": play_id, "reason": reason}
	if comment.strip_edges() != "":
		body["comment"] = comment.strip_edges()
	return await request(HTTPClient.METHOD_POST, "/questions/report", body)


# --- Golem World -------------------------------------------------------------------------


func journey() -> Dictionary:
	return await request(HTTPClient.METHOD_GET, "/journey")


func journey_prepare(node_id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/journey/prepare", {"nodeId": node_id})


func journey_start(node_id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/journey/runs", {"nodeId": node_id})


func journey_run(run_id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_GET, "/journey/runs/%s" % run_id)


func journey_question(run_id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/journey/runs/%s/question" % run_id)


## option_index = -1: o tempo acabou.
func journey_answer(run_id: String, answer_id: String, option_index: int) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/journey/runs/%s/answer" % run_id, {"answerId": answer_id, "optionIndex": option_index if option_index >= 0 else null})


## kind: eliminate | skip | hint | time.
func journey_power(run_id: String, answer_id: String, kind: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/journey/runs/%s/power" % run_id, {"answerId": answer_id, "kind": kind})


func journey_abandon(run_id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/journey/runs/%s/abandon" % run_id)


func shop() -> Dictionary:
	return await request(HTTPClient.METHOD_GET, "/journey/shop")


func shop_buy(item_id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/journey/shop/buy", {"itemId": item_id})


func shop_equip(item_id: String, equipped: bool) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/journey/shop/equip", {"itemId": item_id, "equipped": equipped})


# --- Pedras do Choshen --------------------------------------------------------------------


func puzzle_overview() -> Dictionary:
	return await request(HTTPClient.METHOD_GET, "/puzzle")


func puzzle_start(level: int) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/puzzle/runs", {"level": level})


## moves: [[r1, c1, r2, c2], …] — o servidor refaz a partida com elas.
func puzzle_finish(run_id: String, moves: Array) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/puzzle/runs/%s/finish" % run_id, {"moves": moves})


# --- Economia (carteira, lojas, anúncios com prêmio, pausas) -------------------------------


func economy() -> Dictionary:
	return await request(HTTPClient.METHOD_GET, "/economy")


## Gasta shekels numa oferta (vidas cheias, pacotes de ajudas).
func buy_offer(offer_id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/economy/offers", {"offerId": offer_id})


## Entrega uma compra da loja (aqui, só a de demonstração: store = "demo").
func purchase(store: String, product_id: String, receipt: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/store/purchases", {"store": store, "productId": product_id, "receipt": receipt})


func reward_offer(placement: String, ref: String = "") -> Dictionary:
	var body := {"placement": placement}
	if ref != "":
		body["ref"] = ref
	return await request(HTTPClient.METHOD_POST, "/rewards/offers", body)


func reward_watched(ticket_id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/rewards/%s/watched" % ticket_id)


func reward_claim(ticket_id: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/rewards/%s/claim" % ticket_id)


## kind: match | level. Diz se é hora do anúncio obrigatório (e traz o presente).
func ad_break(kind: String) -> Dictionary:
	return await request(HTTPClient.METHOD_POST, "/ads/break", {"kind": kind})


# --- Transporte -------------------------------------------------------------------------


func request(method: int, path: String, body: Variant = null, auth := true) -> Dictionary:
	if auth and access_token == "":
		var s := await _refresh()
		if s != 1:
			return _session_error(s)
	var sent := access_token if auth else ""
	var r := await _raw(method, path, body, sent)
	if r.status == 401 and auth:
		# Outra chamada pode ter renovado enquanto esta estava no ar.
		if access_token == "" or access_token == sent:
			var s := await _refresh()
			if s != 1:
				return _session_error(s)
		r = await _raw(method, path, body, access_token)
	return r


func _session_error(state: int) -> Dictionary:
	if state == -1:
		return _network_error()
	return {"ok": false, "status": 401, "code": "UNAUTHORIZED", "message": I18n.t("Sua sessão terminou. Entre novamente.")}


func _network_error() -> Dictionary:
	return {"ok": false, "status": 0, "code": "NETWORK", "message": I18n.t("Não foi possível falar com o servidor. Confira se a API está rodando e se o aparelho está na mesma rede.")}


func _raw(method: int, path: String, body: Variant, token: String) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = 25.0
	add_child(http)
	var headers := PackedStringArray(["Accept: application/json", "Accept-Language: " + I18n.locale])
	var payload := ""
	if body != null:
		headers.append("Content-Type: application/json")
		payload = JSON.stringify(body)
	elif method == HTTPClient.METHOD_POST:
		headers.append("Content-Type: application/json")
		payload = "{}"
	if token != "":
		headers.append("Authorization: Bearer " + token)
	if http.request(base_url + path, headers, method, payload) != OK:
		http.queue_free()
		return _network_error()
	var res: Array = await http.request_completed
	http.queue_free()
	if int(res[0]) != HTTPRequest.RESULT_SUCCESS:
		push_warning("HTTP %s %s: resultado %d" % [method, path, int(res[0])])
		return _network_error()
	var status := int(res[1])
	var text := (res[3] as PackedByteArray).get_string_from_utf8()
	var data: Variant = JSON.parse_string(text) if text != "" else null
	if status >= 200 and status < 300:
		return {"ok": true, "status": status, "data": data}
	var d: Dictionary = data if data is Dictionary else {}
	return {
		"ok": false,
		"status": status,
		"code": str(d.get("code", "UNAUTHORIZED" if status == 401 else "HTTP_%d" % status)),
		"message": str(d.get("message", I18n.t("O servidor respondeu com erro {status}.", {"status": status}))),
	}
