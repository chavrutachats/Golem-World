// Fundo atrás da mesa: noite de tekhelet com um halo suave atrás do sevivon e grão leve
// (sem degraus de cor), escurecendo nas bordas.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, fog_disabled;

uniform vec3 night : source_color = vec3(0.0706, 0.0941, 0.2392);
uniform vec3 glow : source_color = vec3(0.17, 0.21, 0.48);
uniform float strength = 0.6;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

void fragment() {
	vec2 uv = UV * 2.0 - 1.0;
	float d = length(uv * vec2(1.0, 1.25));
	float halo = exp(-d * d * 3.2) * strength;
	vec3 col = mix(night, glow, halo);
	col *= 1.0 - 0.35 * smoothstep(0.6, 1.4, d);
	col += (hash12(FRAGCOORD.xy) - 0.5) / 255.0;
	ALBEDO = col;
}
