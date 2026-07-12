shader_type canvas_item;

const int PALETTE_SIZE = 16;

uniform sampler2D screen_texture : hint_screen_texture, filter_nearest;
uniform sampler2D pattern_texture : source_color, repeat_enable;
uniform float pattern_tiling = 512.0;

uniform vec3 palette[PALETTE_SIZE] : source_color;

uniform float dither_strength : hint_range(0.0, 1.0, 0.05) = 1.0;
uniform float blend : hint_range(0.0, 1.0, 0.05) = 1.0;

void fragment() {
    vec3 src = texture(screen_texture, SCREEN_UV).rgb;

    float best_d = 1e9;
    float second_d = 1e9;
    vec3 a = palette[0];
    vec3 b = palette[0];
    for (int i = 0; i < PALETTE_SIZE; i++) {
        vec3 diff = palette[i] - src;
        float d = dot(diff, diff);
        if (d < best_d) {
            second_d = best_d;
            b = a;
            best_d = d;
            a = palette[i];
        } else if (d < second_d) {
            second_d = d;
            b = palette[i];
        }
    }

    float da = sqrt(best_d);
    float db = sqrt(second_d);
    float t = da / max(da + db, 1e-5);

    vec2 screen_size = 1.0 / SCREEN_PIXEL_SIZE;
    float aspect = screen_size.y / screen_size.x;
    vec2 pattern_uv = SCREEN_UV * pattern_tiling * vec2(1.0, aspect);
    float threshold = texture(pattern_texture, pattern_uv).r;

    float mix_factor = t * 2.0 * dither_strength;
    vec3 picked = mix_factor > threshold ? b : a;

    COLOR = vec4(mix(src, picked, blend), 1.0);
}
