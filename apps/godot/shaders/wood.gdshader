// Madeira envernizada: anéis de crescimento em volta de um eixo vertical, veios finos e
// verniz brilhante (reflete o estúdio de luz). Calculada no espaço do objeto, então os
// veios acompanham a peça quando ela gira.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;
#include "res://shaders/noise.gdshaderinc"

uniform vec3 light_wood : source_color = vec3(0.72, 0.48, 0.25);
uniform vec3 dark_wood : source_color = vec3(0.40, 0.22, 0.10);
uniform float ring_scale = 13.0;
uniform float grain = 1.0;
uniform float gloss = 0.78;
uniform vec3 center_offset = vec3(1.1, 0.0, 0.7);

varying vec3 obj;

void vertex() {
	obj = VERTEX;
}

void fragment() {
	vec3 p = obj + center_offset;
	float warp = fbm3(p * vec3(2.2, 0.35, 2.2)) * 1.6;
	float r = length(p.xz) * ring_scale + warp;
	float rings = smoothstep(0.05, 0.95, abs(fract(r) - 0.5) * 2.0);
	float fine = noise3(p * vec3(60.0, 3.0, 60.0));
	float tone = mix(rings, fine, 0.25) * grain;
	vec3 col = mix(dark_wood, light_wood, 0.55 + 0.45 * tone);
	ALBEDO = col;
	ROUGHNESS = clamp(mix(0.16, 0.32, 1.0 - rings) + (0.78 - gloss), 0.05, 1.0);
	SPECULAR = 0.55;
	METALLIC = 0.0;
}
