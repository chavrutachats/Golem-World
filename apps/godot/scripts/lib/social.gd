## Login com Google e Facebook na web (porte de lib/social: google.ts, facebook.ts, oauth.ts).
##
## O navegador vai para a página de login do provedor e volta para esta mesma página com o
## token no fragmento da URL (#id_token=… no Google, #access_token=… no Facebook). Na volta,
## o jogo confere o `state` guardado antes de sair (contra login forjado) e manda o token
## para a API, que o verifica com o provedor.
##
## - Os ids públicos (cliente web do Google, app do Facebook) vêm da página, que a API
##   preenche (<meta name="trivia-google-client">, <meta name="trivia-facebook-app">).
## - O Google recebe o SHA-256 do nonce; a API recebe o nonce original e confere.
## - Os provedores só aceitam voltar para https, localhost ou 127.0.0.1: na rede de casa
##   por http (pnpm lan pelo IP), os botões não aparecem, como no app.
## - A Apple só entra pelo app do iPhone.
class_name Social

const PENDING := "user://oauth.cfg"
const NAMES := {"google": "Google", "apple": "Apple", "facebook": "Facebook"}


static func _meta(name: String) -> String:
	if not OS.has_feature("web"):
		return ""
	var document: JavaScriptObject = JavaScriptBridge.get_interface("document")
	if document == null:
		return ""
	var m: Variant = document.querySelector("meta[name=%s]" % name)
	return str(m.content) if m != null else ""


static func _location() -> JavaScriptObject:
	return JavaScriptBridge.get_interface("location") if OS.has_feature("web") else null


## Endereço de volta aceito pelos provedores?
static func secure_origin() -> bool:
	var loc := _location()
	if loc == null:
		return false
	return str(loc.protocol) == "https:" or str(loc.hostname) in ["localhost", "127.0.0.1"]


static func client_id(provider: String) -> String:
	match provider:
		"google":
			return _meta("trivia-google-client")
		"facebook":
			return _meta("trivia-facebook-app")
	return ""


## Os logins que funcionam aqui: o servidor aceita, a página tem o id e o endereço é seguro.
static func available() -> Array[String]:
	var out: Array[String] = []
	if not secure_origin():
		return out
	var r := await Api.providers()
	if not r.ok:
		return out
	for p in ["google", "facebook"]:
		if bool(r.data.get(p, false)) and client_id(p) != "":
			out.append(p)
	return out


static func _random_hex(bytes: int) -> String:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var b := PackedByteArray()
	for i in bytes:
		b.append(rng.randi_range(0, 255))
	return b.hex_encode()


## Sai para o login do provedor. `back`: a tela para onde voltar depois (home, profile…).
static func start(provider: String, back := "home") -> void:
	var loc := _location()
	if loc == null:
		return
	var redirect := str(loc.origin) + "/"
	var state := _random_hex(16)
	var nonce := _random_hex(24)
	var cfg := ConfigFile.new()
	cfg.set_value("oauth", "provider", provider)
	cfg.set_value("oauth", "state", state)
	cfg.set_value("oauth", "nonce", nonce)
	cfg.set_value("oauth", "back", back)
	cfg.set_value("oauth", "at", Time.get_unix_time_from_system())
	cfg.save(PENDING)
	var q := {"client_id": client_id(provider), "redirect_uri": redirect, "state": state}
	var url := ""
	if provider == "google":
		q.merge({"response_type": "id_token", "scope": "openid email profile", "nonce": nonce.sha256_text(), "prompt": "select_account"})
		url = "https://accounts.google.com/o/oauth2/v2/auth"
	else:
		q.merge({"response_type": "token", "scope": "public_profile,email"})
		url = "https://www.facebook.com/v21.0/dialog/oauth"
	var parts: PackedStringArray = []
	for k in q:
		parts.append("%s=%s" % [k, str(q[k]).uri_encode()])
	# Guarda no IndexedDB antes de sair da página (o user:// da web grava em segundo plano).
	await Engine.get_main_loop().create_timer(0.3).timeout
	loc.assign(url + "?" + "&".join(parts))


## Na abertura do jogo: a página voltou de um login? Devolve {} se não, ou
## {ok, message, back} depois de falar com a API.
static func finish_redirect() -> Dictionary:
	var loc := _location()
	if loc == null:
		return {}
	var hash := str(loc.hash).trim_prefix("#")
	if hash == "" or not (hash.contains("id_token=") or hash.contains("access_token=") or hash.contains("error=")):
		return {}
	var params := {}
	for pair in hash.split("&"):
		var kv := pair.split("=", true, 1)
		params[kv[0].uri_decode()] = kv[1].uri_decode() if kv.size() > 1 else ""
	# Tira o token da barra de endereço (e do histórico) antes de qualquer outra coisa.
	var history: JavaScriptObject = JavaScriptBridge.get_interface("history")
	if history:
		history.replaceState(null, "", str(loc.pathname) + str(loc.search))
	var cfg := ConfigFile.new()
	if cfg.load(PENDING) != OK:
		return {"ok": false, "message": I18n.t("O login não foi concluído. Tente de novo."), "back": "welcome"}
	var provider := str(cfg.get_value("oauth", "provider", ""))
	var state := str(cfg.get_value("oauth", "state", ""))
	var nonce := str(cfg.get_value("oauth", "nonce", ""))
	var back := str(cfg.get_value("oauth", "back", "home"))
	var at := float(cfg.get_value("oauth", "at", 0))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(PENDING))
	if params.has("error"):
		return {"ok": false, "message": I18n.t("O login não foi concluído. Tente de novo."), "back": back}
	# O state precisa ser o que saiu daqui, e o login, recente (10 min).
	if state == "" or str(params.get("state", "")) != state or Time.get_unix_time_from_system() - at > 600:
		return {"ok": false, "message": I18n.t("O login não foi concluído. Tente de novo."), "back": back}
	var token := str(params.get("id_token" if provider == "google" else "access_token", ""))
	if token == "":
		return {"ok": false, "message": I18n.t("O login não foi concluído. Tente de novo."), "back": back}
	var r := await Api.social(provider, token, nonce if provider == "google" else "")
	if not r.ok:
		return {"ok": false, "message": str(r.message), "back": back}
	return {"ok": true, "message": I18n.t("Login com {provider} conectado. Agora você também entra por ele.", {"provider": NAMES[provider]}), "back": back}


## Botões "Continuar com o Google / Facebook" (ou "Conectar…"), um por login disponível.
static func buttons(providers: Array, connect := false, back := "home") -> VBoxContainer:
	var v := Ui.vbox(10)
	for p in providers:
		var label := ""
		if connect:
			label = I18n.t("Conectar o Google") if p == "google" else I18n.t("Conectar o Facebook")
		else:
			label = I18n.t("Continuar com o Google") if p == "google" else I18n.t("Continuar com o Facebook")
		var b := Ui.button(label, "velvet")
		var provider: String = p
		b.pressed.connect(func():
			b.disabled = true
			Social.start(provider, back))
		v.add_child(b)
	return v
