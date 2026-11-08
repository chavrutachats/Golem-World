## Chanucá no sevivon (porte de lib/hanukkah.ts): nas 8 noites, uma chanukiá com as velas da
## noite aparece atrás dele. A véspera (24 de Kislev) de cada ano vem da mesma tabela do app,
## calculada com o calendário hebraico do ICU. A noite acende às 17h, hora local.
class_name Hanukkah

const EVE := [
	"2025-12-14", "2026-12-04", "2027-12-24", "2028-12-12", "2029-12-01", "2030-12-20", "2031-12-09",
	"2032-11-27", "2033-12-16", "2034-12-06", "2035-12-25", "2036-12-13", "2037-12-02", "2038-12-21",
	"2039-12-11", "2040-11-29", "2041-12-17", "2042-12-07", "2043-12-26", "2044-12-14", "2045-12-03",
]
const LIGHTING_HOUR := 17


## Noite de Chanucá agora (1 a 8), ou 0 fora da festa. `now`: segundos, na hora local
## (por padrão, o relógio do aparelho).
static func night(now := -1.0) -> int:
	if now < 0:
		now = Time.get_unix_time_from_system() + Time.get_time_zone_from_system().bias * 60.0
	for eve in EVE:
		var start := Time.get_unix_time_from_datetime_string("%sT%02d:00:00" % [eve, LIGHTING_HOUR])
		var nights := floori((now - start) / 86400.0)
		if nights >= 0 and nights < 8:
			return nights + 1
	return 0


## A chanukiá de prata com as velas da noite acesas (e o shamash), como no app.
static func build(n: int) -> Node3D:
	var silver := Kit.mat("#C9CED9", {"smooth": true})
	silver.metallic = 0.6
	silver.roughness = 0.3
	var parts: Array = [
		Kit.mesh(Geo.cyl(0.05, 0.12, 0.5, 10), silver, {"p": [0, 0.25, 0]}),
		Kit.mesh(Geo.box(1.2, 0.05, 0.08), silver, {"p": [0, 0.52, 0]}),
	]
	var flame := func(x: float, y: float) -> Node3D:
		return Kit.group({"p": [x, y, 0]}, [
			Kit.mesh(Geo.ball(0.035, 1), Kit.glow(Kit.C.fireCore), {"s": [1, 1.6, 1], "shadow": false}),
			Kit.mesh(Geo.ball(0.022, 1), Kit.glow("#FFFFFF"), {"p": [0, -0.01, 0.01], "shadow": false}),
		])
	# Do ponto de vista de quem acende: as velas entram da direita para a esquerda.
	for i in 8:
		var x := 0.55 - i * (1.1 / 7.0)
		parts.append(Kit.mesh(Geo.cyl(0.022, 0.022, 0.16, 6), Kit.mat("#F7F1E1" if i < n else "#B9BDC8"), {"p": [x, 0.62, 0]}))
		if i < n:
			parts.append(flame.call(x, 0.74))
	parts.append(Kit.mesh(Geo.cyl(0.025, 0.025, 0.18, 6), Kit.mat("#F7F1E1"), {"p": [0, 0.83, 0.04]}))
	parts.append(Kit.mesh(Geo.box(0.06, 0.24, 0.06), silver, {"p": [0, 0.66, 0.04]}))
	parts.append(flame.call(0, 0.96))
	var g := Kit.group({}, parts)
	# Um brilho quente das velas na mesa.
	var light := OmniLight3D.new()
	light.light_color = Color("#FFB347")
	light.light_energy = 0.25 + 0.06 * n
	light.omni_range = 1.6
	light.position = Vector3(0, 0.9, 0.25)
	g.add_child(light)
	return g
