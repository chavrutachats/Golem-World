// Raios de luz girando devagar atrás do nome da categoria (revelação do sevivon).
shader_type canvas_item;

uniform vec4 base : source_color = vec4(0.7, 0.14, 0.25, 1.0);
uniform vec4 ray : source_color = vec4(1.0, 1.0, 1.0, 0.12);
uniform float rays = 14.0;
uniform float speed = 0.15;
uniform vec2 center = vec2(0.5, 0.42);
uniform float aspect = 0.46;

void fragment() {
	vec2 p = UV - center;
	p.x /= aspect;
	float a = atan(p.y, p.x) + TIME * speed;
	float r = length(p);
	float s = smoothstep(0.2, 0.8, sin(a * rays) * 0.5 + 0.5);
	float fade = exp(-r * 1.6);
	vec3 col = base.rgb * (0.78 + 0.4 * fade);
	col = mix(col, ray.rgb, s * ray.a * fade * 2.0);
	// Vinheta.
	col *= 1.0 - 0.45 * smoothstep(0.35, 1.1, r);
	COLOR = vec4(col, base.a);
}
