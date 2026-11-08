// Feltro de mesa de jogo: fosco, com fibras e manchas suaves de tom.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;
#include "res://shaders/noise.gdshaderinc"

uniform vec3 felt : source_color = vec3(0.13, 0.16, 0.42);
varying vec3 obj;

void vertex() {
	obj = VERTEX;
}

void fragment() {
	float blot = fbm3(obj * 1.7);
	float fiber = noise3(obj * 38.0);
	vec3 col = felt * (0.88 + 0.18 * blot) * (0.97 + 0.05 * fiber);
	ALBEDO = col;
	ROUGHNESS = 0.96;
	SPECULAR = 0.25;
	// Brilho de veludo nas bordas (luz rasante).
	float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	EMISSION = felt * rim * 0.12;
}
