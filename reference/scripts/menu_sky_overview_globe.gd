extends Node2D
class_name MenuSkyOverviewGlobe

## Orthographic celestial globe — drag to rotate, scroll to zoom, click a constellation to focus.
## Drag X spins around the pole axis (Y); drag Y tilts toward/away from you (X).
## NCP and SCP stay on a fixed vertical meridian — no roll.
## Focus animates yaw/pitch/zoom, partially dissolves other constellations, then emits constellation_selected.
## Escape reverses to the overview. Full-sky constellations; planets and ecliptic from birth-date orbital math.

signal constellation_selected(constellation_id: String)

const ORBITAL_DATA_PATH := "res://data/orbital_elements.json"
const DEFAULT_CONSTELLATION_LINES_PATH := "res://data/constellations.lines.json"
const DEFAULT_CONSTELLATION_META_PATH := "res://data/constellations.json"
const DEFAULT_LABEL_FONT_PATH := "res://fonts/IMFELLEnglish-Regular.ttf"
const JD_1453_01_01 := 2251766.5

const PLANET_DRAW_ORDER: Array[String] = [
	"mercury", "venus", "mars", "jupiter", "saturn",
]

const PLANET_LABELS: Dictionary = {
	"mercury": "Mercurius",
	"venus": "Venus",
	"mars": "Mars",
	"jupiter": "Iuppiter",
	"saturn": "Saturnus",
}

const UI_TOP_MARGIN := 44.0
const UI_BOTTOM_MARGIN := 80.0
const USER_ZOOM_MIN := 0.6
const USER_ZOOM_MAX := 4.0
const ZOOM_WHEEL_FACTOR := 1.1
const DRAG_SENSITIVITY_RAD := 0.004
const CLICK_DRAG_THRESHOLD_PX := 8.0
const CONSTELLATION_HIT_LINE_PX := 10.0
const CONSTELLATION_HIT_STAR_PX := 14.0
const FOCUS_ANIM_DURATION_SEC := 0.85
const FOCUS_FILL_FRACTION := 0.78
const FOCUS_CENTER_END_FRACTION := 0.68
const FOCUS_ZOOM_START_FRACTION := 0.22
const FOCUS_UNSELECTED_OPACITY := 0.18
const FOCUS_BACKDROP_OPACITY := 0.35

enum ViewAnimMode { NONE, TO_FOCUS, TO_OVERVIEW }

@export_group("Time")
@export var use_system_time: bool = false
@export var fixed_julian_date: float = JD_1453_01_01
@export var initial_day_offset: float = 0.0
@export_range(1.0, 100.0, 1.0) var slider_year_span: float = 50.0
@export var show_time_ui: bool = true

@export_group("Globe")
@export_range(0.0, 360.0, 0.1) var initial_view_ra_deg: float = 0.0
@export_range(-90.0, 90.0, 0.01) var initial_view_dec_deg: float = 35.0
@export_range(30.0, 89.0, 1.0) var max_pitch_deg: float = 70.0
@export_range(0.1, 1, 0.01) var globe_scale_factor: float = 0.5
@export_range(0.25, 3.0, 0.05) var globe_zoom: float = 1.0
@export_range(0.02, 0.25, 0.01) var limb_fade_width: float = 0.1
@export_range(0.0, 2.0, 0.05) var drag_momentum_scale: float = 1.0
@export_range(1.0, 30.0, 0.5) var drag_spin_friction: float = 10.0
@export var ui_top_margin: float = UI_TOP_MARGIN
@export var ui_bottom_margin: float = UI_BOTTOM_MARGIN

@export_group("Focus")
@export var enable_constellation_focus: bool = true
@export_range(0.3, 2.0, 0.05) var focus_anim_duration_sec: float = FOCUS_ANIM_DURATION_SEC
@export_range(0.5, 1.0, 0.01) var focus_center_end_fraction: float = FOCUS_CENTER_END_FRACTION
@export_range(0.0, 0.5, 0.01) var focus_zoom_start_fraction: float = FOCUS_ZOOM_START_FRACTION
@export_range(0.3, 1.0, 0.01) var focus_fill_fraction: float = FOCUS_FILL_FRACTION
@export_range(0.05, 0.5, 0.01) var focus_unselected_opacity: float = FOCUS_UNSELECTED_OPACITY
@export_range(0.1, 0.8, 0.01) var focus_backdrop_opacity: float = FOCUS_BACKDROP_OPACITY

@export_group("Catalog")
@export_file("*.json") var constellation_lines_path: String = DEFAULT_CONSTELLATION_LINES_PATH
@export_file("*.json") var constellation_meta_path: String = DEFAULT_CONSTELLATION_META_PATH
@export_range(1, 3, 1) var max_constellation_rank: int = 3
@export var show_constellation_lines: bool = true
@export var show_constellation_vertex_stars: bool = true
@export var show_constellation_names: bool = true

@export_group("Layers")
@export var show_ecliptic: bool = true
@export var show_mercury: bool = true
@export var show_venus: bool = true
@export var show_mars: bool = true
@export var show_jupiter: bool = true
@export var show_saturn: bool = true
@export var show_sun: bool = true
@export var show_moon: bool = true
@export var show_planet_names: bool = true
@export var show_sun_label: bool = true
@export var show_moon_label: bool = true
@export var show_celestial_poles: bool = true
@export var show_pole_labels: bool = true

@export_group("Colors")
@export var background_color: Color = Color(0.015, 0.02, 0.05)
@export var globe_fill_color: Color = Color(0.03, 0.05, 0.11)
@export var globe_outline_color: Color = Color(0.35, 0.42, 0.58, 0.55)
@export var ecliptic_color: Color = Color(0.85, 0.55, 0.18, 0.7)
@export var constellation_line_color: Color = Color(0.55, 0.65, 0.85, 0.85)
@export var star_color: Color = Color(0.92, 0.95, 1.0)
@export var mercury_color: Color = Color(0.75, 0.75, 0.8)
@export var venus_color: Color = Color(1.0, 0.92, 0.55)
@export var mars_color: Color = Color(0.95, 0.35, 0.25)
@export var jupiter_color: Color = Color(0.92, 0.78, 0.55)
@export var saturn_color: Color = Color(0.88, 0.82, 0.62)
@export var sun_color: Color = Color(1.0, 0.92, 0.35)
@export var moon_color: Color = Color(0.88, 0.9, 0.95)
@export var north_pole_color: Color = Color(0.35, 0.85, 1.0, 0.95)
@export var south_pole_color: Color = Color(1.0, 0.45, 0.55, 0.95)

@export_group("Sizes")
@export_range(0.5, 3.0, 0.1) var star_size_scale: float = 0.55
@export var show_star_glow: bool = true
@export_range(1.5, 8.0, 0.1) var star_glow_diameter_scale: float = 5.0
@export_range(1.0, 12.0, 0.5) var planet_radius: float = 5.0
@export_range(1.0, 16.0, 0.5) var sun_radius: float = 7.0
@export_range(1.0, 14.0, 0.5) var moon_radius: float = 6.0
@export_range(3.0, 16.0, 0.5) var pole_marker_radius: float = 8.0
@export_range(0.1, 4.0, 0.1) var constellation_line_width: float = 0.6
@export_range(0.1, 4.0, 0.1) var ecliptic_line_width: float = 1.2
@export_range(0.1, 4.0, 0.1) var globe_outline_width: float = 1.5
@export_range(32, 256, 1) var ring_segment_count: int = 144
@export_file("*.ttf", "*.otf") var label_font_path: String = DEFAULT_LABEL_FONT_PATH
@export_range(8, 24, 1) var label_font_size: int = 12
@export var body_label_offset: Vector2 = Vector2(8.0, 8.0)

var _orbital_data: Dictionary = {}
var _constellation_catalog: ConstellationCatalog
var _day_offset: float = 0.0
var _globe_yaw: float = 0.0
var _globe_pitch: float = 0.0
var _user_zoom: float = 1.0
var _dragging: bool = false
var _drag_last_mouse: Vector2 = Vector2.ZERO
var _drag_press_mouse: Vector2 = Vector2.ZERO
var _drag_distance_sq: float = 0.0
var _angular_velocity: Vector2 = Vector2.ZERO
var _label_font: Font
var _star_glow_texture: GradientTexture2D
var _focused_constellation_id: String = ""
var _focus_dissolve: float = 0.0
var _overview_yaw_stash: float = 0.0
var _overview_pitch_stash: float = 0.0
var _overview_user_zoom_stash: float = 1.0
var _view_anim_active: bool = false
var _view_anim_mode: int = ViewAnimMode.NONE
var _view_anim_elapsed: float = 0.0
var _view_anim_from_yaw: float = 0.0
var _view_anim_to_yaw: float = 0.0
var _view_anim_from_pitch: float = 0.0
var _view_anim_to_pitch: float = 0.0
var _view_anim_from_zoom: float = 1.0
var _view_anim_to_zoom: float = 1.0
var _view_anim_from_dissolve: float = 0.0
var _view_anim_to_dissolve: float = 0.0
var _view_anim_emit_selection: bool = false

@warning_ignore("unused_private_class_variable")
@onready var _ui_layer: CanvasLayer = $UiLayer
@onready var _date_label: Label = $UiLayer/DateLabel
@onready var _time_slider: HSlider = $UiLayer/TimeSlider
@onready var _slider_hint: Label = $UiLayer/SliderHint


func _ready() -> void:
	_label_font = _load_label_font()
	_star_glow_texture = _build_star_glow_texture()
	_load_json(ORBITAL_DATA_PATH, _orbital_data)
	var initial_yaw_pitch := CelestialProjection.yaw_pitch_facing_celestial(
		initial_view_ra_deg,
		initial_view_dec_deg
	)
	_globe_yaw = initial_yaw_pitch.x
	_globe_pitch = initial_yaw_pitch.y
	_reload_constellation_catalog()

	_day_offset = initial_day_offset
	var span_days: float = slider_year_span * 365.25
	_time_slider.min_value = -span_days
	_time_slider.max_value = span_days
	_time_slider.step = 1.0
	_time_slider.value = _day_offset
	_time_slider.value_changed.connect(_on_time_slider_changed)

	_slider_hint.text = "Time offset from base date (±%.0f years)" % slider_year_span
	_apply_time_ui_visibility()

	get_viewport().size_changed.connect(_on_viewport_resized)
	_update_date_label()
	queue_redraw()


func _on_time_slider_changed(value: float) -> void:
	_day_offset = value
	_update_date_label()
	queue_redraw()


func _on_viewport_resized() -> void:
	queue_redraw()


## True when the overview is showing (not focused on a constellation, no focus animation).
func is_at_overview() -> bool:
	return (
		_focused_constellation_id.is_empty()
		and not _view_anim_active
		and _focus_dissolve <= 0.0
	)


## Gameplay overlay: lock sky to the volunteer's birth date; hide the dev time slider.
func configure_for_volunteer(character: CharacterData) -> void:
	use_system_time = false
	show_time_ui = false
	_day_offset = 0.0
	if character and character.birth_julian_date > 0.0:
		fixed_julian_date = character.birth_julian_date
	_apply_time_ui_visibility()
	if _time_slider:
		_time_slider.value = 0.0
	_update_date_label()
	queue_redraw()


func _apply_time_ui_visibility() -> void:
	if _time_slider:
		_time_slider.visible = show_time_ui
	if _slider_hint:
		_slider_hint.visible = show_time_ui
	if _date_label:
		_date_label.visible = true


func _process(delta: float) -> void:
	if _view_anim_active:
		_advance_view_animation(delta)
		queue_redraw()
		return

	if _dragging or _angular_velocity.length_squared() < 1e-12:
		return
	_apply_globe_orientation_delta(
		_angular_velocity.x * delta,
		_angular_velocity.y * delta
	)
	_angular_velocity *= exp(-drag_spin_friction * delta)
	queue_redraw()


func _input(event: InputEvent) -> void:
	if _is_exit_focus_input(event):
		_begin_overview_animation()
		get_viewport().set_input_as_handled()
		return

	if _view_anim_active or not _focused_constellation_id.is_empty():
		if event is InputEventMouseButton or event is InputEventMouseMotion:
			get_viewport().set_input_as_handled()
		return

	if event is InputEventMouseButton:
		var mouse_button := event as InputEventMouseButton
		if mouse_button.button_index == MOUSE_BUTTON_WHEEL_UP:
			if _is_pointer_over_time_ui(mouse_button.position):
				return
			_apply_zoom(ZOOM_WHEEL_FACTOR)
			get_viewport().set_input_as_handled()
		elif mouse_button.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			if _is_pointer_over_time_ui(mouse_button.position):
				return
			_apply_zoom(1.0 / ZOOM_WHEEL_FACTOR)
			get_viewport().set_input_as_handled()
		elif mouse_button.button_index == MOUSE_BUTTON_LEFT:
			if mouse_button.pressed:
				if _is_pointer_over_time_ui(mouse_button.position):
					return
				_dragging = true
				_angular_velocity = Vector2.ZERO
				_drag_last_mouse = mouse_button.position
				_drag_press_mouse = mouse_button.position
				_drag_distance_sq = 0.0
				get_viewport().set_input_as_handled()
			elif _dragging:
				var was_click := _drag_distance_sq <= CLICK_DRAG_THRESHOLD_PX * CLICK_DRAG_THRESHOLD_PX
				_dragging = false
				if was_click and enable_constellation_focus:
					_try_select_constellation_at(mouse_button.position)
				get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if not (motion.button_mask & MOUSE_BUTTON_MASK_LEFT):
			_dragging = false
			return
		if _is_pointer_over_time_ui(motion.position):
			return
		if not _dragging:
			_dragging = true
			_angular_velocity = Vector2.ZERO
			_drag_last_mouse = motion.position
			_drag_press_mouse = motion.position
			_drag_distance_sq = 0.0
			get_viewport().set_input_as_handled()
			return
		var delta := motion.position - _drag_last_mouse
		_drag_distance_sq = maxf(
			_drag_distance_sq,
			motion.position.distance_squared_to(_drag_press_mouse)
		)
		_drag_last_mouse = motion.position
		_apply_drag_rotation(delta, motion.velocity)
		queue_redraw()
		get_viewport().set_input_as_handled()


func _reload_constellation_catalog() -> void:
	_constellation_catalog = ConstellationCatalog.load_from_d3_celestial(
		constellation_lines_path,
		constellation_meta_path,
		max_constellation_rank,
		-90.0,
		show_constellation_vertex_stars
	)
	queue_redraw()


func _load_json(path: String, target: Dictionary) -> void:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("MenuSkyOverviewGlobe: failed to open %s (error %d)." % [path, FileAccess.get_open_error()])
		return
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed == null:
		push_error("MenuSkyOverviewGlobe: invalid JSON in %s." % path)
		return
	if parsed is Dictionary:
		target.clear()
		target.merge(parsed, true)


func _current_julian_date() -> float:
	if use_system_time:
		return OrbitalMechanics.julian_date_from_unix(float(Time.get_unix_time_from_system())) + _day_offset
	return fixed_julian_date + _day_offset


func _update_date_label() -> void:
	var jd := _current_julian_date()
	var date: Dictionary = OrbitalMechanics.julian_date_to_gregorian(jd)
	if show_time_ui:
		_date_label.text = "%04d-%02d-%02d  (JD %.1f, %+d days)" % [
			int(date["year"]),
			int(date["month"]),
			int(date["day"]),
			jd,
			int(_day_offset),
		]
	else:
		_date_label.text = "Birth sky  %04d-%02d-%02d" % [
			int(date["year"]),
			int(date["month"]),
			int(date["day"]),
		]


func _usable_viewport_size() -> Vector2:
	var full := get_viewport_rect().size
	return Vector2(full.x, maxf(full.y - ui_top_margin - ui_bottom_margin, 1.0))


func _layout_center() -> Vector2:
	var full := get_viewport_rect().size
	return Vector2(
		full.x * 0.5,
		ui_top_margin + _usable_viewport_size().y * 0.5
	)


func _base_globe_radius() -> float:
	var usable := _usable_viewport_size()
	return minf(usable.x, usable.y) * 0.5 * globe_scale_factor * globe_zoom


func _globe_radius() -> float:
	return _base_globe_radius() * _user_zoom


func _view_basis() -> Basis:
	return CelestialProjection.globe_orientation_from_yaw_pitch(_globe_yaw, _globe_pitch)


func _apply_drag_rotation(delta: Vector2, motion_velocity: Vector2) -> void:
	var updated := CelestialProjection.apply_globe_drag_turntable(
		_globe_yaw,
		_globe_pitch,
		delta,
		DRAG_SENSITIVITY_RAD,
		deg_to_rad(max_pitch_deg)
	)
	_globe_yaw = _normalize_yaw_rad(updated.x)
	_globe_pitch = updated.y
	_angular_velocity = Vector2(
		motion_velocity.x * DRAG_SENSITIVITY_RAD * drag_momentum_scale,
		-motion_velocity.y * DRAG_SENSITIVITY_RAD * drag_momentum_scale
	)


func _apply_globe_orientation_delta(yaw_delta: float, pitch_delta: float) -> void:
	var pitch_limit := deg_to_rad(max_pitch_deg)
	var next_pitch := _globe_pitch + pitch_delta
	if not is_equal_approx(clampf(next_pitch, -pitch_limit, pitch_limit), next_pitch):
		_angular_velocity.y = 0.0
	_globe_yaw += yaw_delta
	_globe_pitch = clampf(next_pitch, -pitch_limit, pitch_limit)


func _normalize_yaw_rad(yaw_rad: float) -> float:
	return wrapf(yaw_rad, -PI, PI)


func _apply_zoom(factor: float) -> void:
	_user_zoom = clampf(_user_zoom * factor, USER_ZOOM_MIN, USER_ZOOM_MAX)
	queue_redraw()


func _is_pointer_over_time_ui(screen_pos: Vector2) -> bool:
	if not show_time_ui:
		return false
	return (
		_time_slider.get_global_rect().has_point(screen_pos)
		or _slider_hint.get_global_rect().has_point(screen_pos)
	)


func _screen_from_view_pos(view_pos: Vector3, center: Vector2, radius: float) -> Vector2:
	return center + CelestialProjection.orthographic_view_xy(view_pos, radius)


func _project_ra_dec(ra_deg: float, dec_deg: float, radius: float, basis: Basis) -> Variant:
	return CelestialProjection.orthographic_ra_dec_deg_to_xy(ra_deg, dec_deg, radius, basis)


func _with_alpha(color: Color, alpha_scale: float) -> Color:
	var faded := color
	faded.a *= alpha_scale
	return faded


func _try_select_constellation_at(screen_pos: Vector2) -> void:
	if _constellation_catalog == null:
		return
	var hit := _constellation_at_screen_pos(screen_pos)
	if hit.is_empty():
		return
	_begin_focus_animation(hit)


func _constellation_centroid_ra_dec(constellation: Dictionary) -> Vector2:
	var direction_sum := Vector3.ZERO
	var count := 0
	for star_variant in constellation.get("stars", []):
		var star := star_variant as Dictionary
		direction_sum += CelestialProjection.unit_vector_from_ra_dec_deg(
			float(star["ra"]),
			float(star["dec"])
		)
		count += 1
	if count == 0:
		for segment_variant in constellation.get("lines", []):
			var segment := segment_variant as Array
			for point_variant in segment:
				var point := point_variant as Array
				if point.size() < 2:
					continue
				direction_sum += CelestialProjection.unit_vector_from_ra_dec_deg(
					float(point[0]),
					float(point[1])
				)
				count += 1
	if count == 0:
		return Vector2(initial_view_ra_deg, initial_view_dec_deg)
	return CelestialProjection.ra_dec_deg_from_unit_vector(direction_sum / float(count))


func _constellation_view_extent(constellation: Dictionary, yaw: float, pitch: float) -> float:
	var basis := CelestialProjection.globe_orientation_from_yaw_pitch(yaw, pitch)
	var min_point := Vector2(INF, INF)
	var max_point := Vector2(-INF, -INF)
	var found := false

	for star_variant in constellation.get("stars", []):
		var star := star_variant as Dictionary
		var view_pos := CelestialProjection.orthographic_ra_dec_deg_to_view(
			float(star["ra"]),
			float(star["dec"]),
			basis
		)
		if not CelestialProjection.is_visible_in_view(view_pos):
			continue
		var flat := CelestialProjection.orthographic_view_xy(view_pos, 1.0)
		min_point = Vector2(minf(min_point.x, flat.x), minf(min_point.y, flat.y))
		max_point = Vector2(maxf(max_point.x, flat.x), maxf(max_point.y, flat.y))
		found = true

	if not found:
		return 0.1
	var size := max_point - min_point
	return maxf(size.x, size.y) * 0.5


func _focus_user_zoom_for_extent(view_half_extent: float) -> float:
	var target_radius := minf(_usable_viewport_size().x, _usable_viewport_size().y) * 0.5 * focus_fill_fraction
	return clampf(
		target_radius / (maxf(view_half_extent, 0.001) * _base_globe_radius()),
		USER_ZOOM_MIN,
		USER_ZOOM_MAX
	)


func _begin_focus_animation(constellation: Dictionary) -> void:
	var constellation_id := str(constellation.get("id", ""))
	if constellation_id.is_empty():
		return

	var centroid := _constellation_centroid_ra_dec(constellation)
	var target_yaw_pitch := CelestialProjection.yaw_pitch_facing_celestial(centroid.x, centroid.y)
	var pitch_limit := deg_to_rad(max_pitch_deg)
	target_yaw_pitch.y = clampf(target_yaw_pitch.y, -pitch_limit, pitch_limit)
	var target_extent := _constellation_view_extent(
		constellation,
		target_yaw_pitch.x,
		target_yaw_pitch.y
	)
	var target_zoom := _focus_user_zoom_for_extent(target_extent)

	_overview_yaw_stash = _normalize_yaw_rad(_globe_yaw)
	_overview_pitch_stash = _globe_pitch
	_overview_user_zoom_stash = _user_zoom
	_globe_yaw = _overview_yaw_stash
	_focused_constellation_id = constellation_id
	_start_view_animation(
		ViewAnimMode.TO_FOCUS,
		_overview_yaw_stash,
		_normalize_yaw_rad(target_yaw_pitch.x),
		_globe_pitch,
		target_yaw_pitch.y,
		_user_zoom,
		target_zoom,
		_focus_dissolve,
		1.0,
		true
	)


func _begin_overview_animation() -> void:
	if not _view_anim_active and _focused_constellation_id.is_empty() and _focus_dissolve <= 0.0:
		return

	_start_view_animation(
		ViewAnimMode.TO_OVERVIEW,
		_globe_yaw,
		_overview_yaw_stash,
		_globe_pitch,
		_overview_pitch_stash,
		_user_zoom,
		_overview_user_zoom_stash,
		_focus_dissolve,
		0.0,
		false
	)


func _start_view_animation(
	mode: int,
	from_yaw: float,
	to_yaw: float,
	from_pitch: float,
	to_pitch: float,
	from_zoom: float,
	to_zoom: float,
	from_dissolve: float,
	to_dissolve: float,
	emit_selection_on_complete: bool
) -> void:
	_view_anim_mode = mode
	_view_anim_from_yaw = _normalize_yaw_rad(from_yaw)
	_view_anim_to_yaw = _normalize_yaw_rad(to_yaw)
	_view_anim_from_pitch = from_pitch
	_view_anim_to_pitch = to_pitch
	_view_anim_from_zoom = from_zoom
	_view_anim_to_zoom = to_zoom
	_view_anim_from_dissolve = from_dissolve
	_view_anim_to_dissolve = to_dissolve
	_view_anim_emit_selection = emit_selection_on_complete
	_view_anim_active = true
	_view_anim_elapsed = 0.0
	_dragging = false
	queue_redraw()


func _advance_view_animation(delta: float) -> void:
	_view_anim_elapsed += delta
	var duration := maxf(focus_anim_duration_sec, 0.05)
	var raw_t := clampf(_view_anim_elapsed / duration, 0.0, 1.0)
	var center_weight := _view_anim_center_weight(raw_t)
	var zoom_weight := _view_anim_zoom_weight(raw_t)

	_globe_yaw = _lerp_angle_rad(_view_anim_from_yaw, _view_anim_to_yaw, center_weight)
	_globe_pitch = lerpf(_view_anim_from_pitch, _view_anim_to_pitch, center_weight)
	_user_zoom = lerpf(_view_anim_from_zoom, _view_anim_to_zoom, zoom_weight)
	_focus_dissolve = lerpf(_view_anim_from_dissolve, _view_anim_to_dissolve, center_weight)

	if raw_t < 1.0:
		return

	var completed_mode := _view_anim_mode
	var emit_selection := _view_anim_emit_selection
	_view_anim_active = false
	_view_anim_mode = ViewAnimMode.NONE
	_view_anim_emit_selection = false
	_focus_dissolve = _view_anim_to_dissolve

	if completed_mode == ViewAnimMode.TO_OVERVIEW:
		_focused_constellation_id = ""
		_globe_yaw = _overview_yaw_stash
		_globe_pitch = _overview_pitch_stash
		_user_zoom = _overview_user_zoom_stash
	else:
		_globe_yaw = _view_anim_to_yaw
		_globe_pitch = _view_anim_to_pitch
		_user_zoom = _view_anim_to_zoom
		if emit_selection and not _focused_constellation_id.is_empty():
			constellation_selected.emit(_focused_constellation_id)


func _lerp_angle_rad(from_rad: float, to_rad: float, weight: float) -> float:
	var delta := wrapf(to_rad - from_rad, -PI, PI)
	return from_rad + delta * weight


func _smoothstep01(t: float) -> float:
	var clamped := clampf(t, 0.0, 1.0)
	return clamped * clamped * (3.0 - 2.0 * clamped)


func _segment_ease(raw_t: float, start: float, end: float) -> float:
	if end <= start + 1e-6:
		return _smoothstep01(raw_t)
	return _smoothstep01((raw_t - start) / (end - start))


func _view_anim_center_weight(raw_t: float) -> float:
	if _view_anim_mode == ViewAnimMode.TO_FOCUS:
		return _segment_ease(raw_t, 0.0, focus_center_end_fraction)
	if _view_anim_mode == ViewAnimMode.TO_OVERVIEW:
		return _segment_ease(raw_t, focus_zoom_start_fraction, 1.0)
	return _smoothstep01(raw_t)


func _view_anim_zoom_weight(raw_t: float) -> float:
	if _view_anim_mode == ViewAnimMode.TO_FOCUS:
		return _segment_ease(raw_t, focus_zoom_start_fraction, 1.0)
	if _view_anim_mode == ViewAnimMode.TO_OVERVIEW:
		return _segment_ease(raw_t, 0.0, focus_center_end_fraction)
	return _smoothstep01(raw_t)


func _is_exit_focus_input(event: InputEvent) -> bool:
	if not (_view_anim_active or not _focused_constellation_id.is_empty() or _focus_dissolve > 0.0):
		return false
	if event.is_action_pressed("ui_cancel"):
		return true
	if event is InputEventKey:
		var key := event as InputEventKey
		return key.pressed and not key.echo and key.keycode == KEY_ESCAPE
	return false


func _constellation_content_fade(constellation_id: String) -> float:
	if _focus_dissolve <= 0.0:
		return 1.0
	if constellation_id == _focused_constellation_id:
		return 1.0
	return lerpf(1.0, focus_unselected_opacity, _focus_dissolve)


func _sky_backdrop_fade() -> float:
	if _focus_dissolve <= 0.0:
		return 1.0
	return lerpf(1.0, focus_backdrop_opacity, _focus_dissolve)


func _constellation_at_screen_pos(screen_pos: Vector2) -> Dictionary:
	var center := _layout_center()
	var radius := _globe_radius()
	var basis := _view_basis()
	var best: Dictionary = {}
	var best_dist_sq := INF

	for constellation_variant in _constellation_catalog.constellations:
		var constellation := constellation_variant as Dictionary
		for star_variant in constellation.get("stars", []):
			var star := star_variant as Dictionary
			var projected: Variant = _project_ra_dec(
				float(star["ra"]),
				float(star["dec"]),
				radius,
				basis
			)
			if projected == null:
				continue
			var pos: Vector2 = center + (projected as Vector2)
			var hit_radius := CONSTELLATION_HIT_STAR_PX + constellation_line_width
			var dist_sq := screen_pos.distance_squared_to(pos)
			if dist_sq <= hit_radius * hit_radius and dist_sq < best_dist_sq:
				best_dist_sq = dist_sq
				best = constellation

		for segment_variant in constellation.get("lines", []):
			var segment := segment_variant as Array
			if segment.size() < 2:
				continue
			var clipped := _clip_segment_screen(segment, center, radius, basis)
			if clipped.size() < 2:
				continue
			var dist := _point_segment_distance(screen_pos, clipped[0], clipped[1])
			if dist <= CONSTELLATION_HIT_LINE_PX and dist * dist < best_dist_sq:
				best_dist_sq = dist * dist
				best = constellation

	return best


func _clip_segment_screen(
	segment: Array,
	center: Vector2,
	radius: float,
	basis: Basis
) -> PackedVector2Array:
	if segment.size() < 2:
		return PackedVector2Array()

	var start := segment[0] as Array
	var end := segment[1] as Array
	var start_unit := CelestialProjection.unit_vector_from_ra_dec_deg(float(start[0]), float(start[1]))
	var end_unit := CelestialProjection.unit_vector_from_ra_dec_deg(float(end[0]), float(end[1]))
	var clipped_view: Array = CelestialProjection.clip_unit_segment_to_visible_hemisphere(
		start_unit,
		end_unit,
		basis
	)
	if clipped_view.is_empty():
		return PackedVector2Array()

	var points := PackedVector2Array()
	points.resize(clipped_view.size())
	for i in clipped_view.size():
		points[i] = _screen_from_view_pos(clipped_view[i] as Vector3, center, radius)
	return points


static func _point_segment_distance(point: Vector2, start: Vector2, end: Vector2) -> float:
	var segment := end - start
	var length_sq := segment.length_squared()
	if length_sq <= 1e-8:
		return point.distance_to(start)
	var t := clampf((point - start).dot(segment) / length_sq, 0.0, 1.0)
	return point.distance_to(start + segment * t)


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, get_viewport_rect().size), background_color)
	if _orbital_data.is_empty():
		return

	var center := _layout_center()
	var radius := _globe_radius()
	var basis := _view_basis()
	var jd := _current_julian_date()
	var backdrop_fade := _sky_backdrop_fade()

	_draw_globe_disk(center, radius)
	if show_ecliptic and backdrop_fade > 0.0:
		_draw_ecliptic(center, radius, basis, backdrop_fade)
	if _constellation_catalog != null:
		_draw_constellations(center, radius, basis)
	if backdrop_fade > 0.0:
		_draw_bodies(center, radius, basis, jd, backdrop_fade)
	if show_celestial_poles and backdrop_fade > 0.0:
		_draw_celestial_poles(center, radius, basis, backdrop_fade)
	draw_arc(center, radius, 0.0, TAU, 96, globe_outline_color, globe_outline_width, true)


func _draw_globe_disk(center: Vector2, radius: float) -> void:
	draw_circle(center, radius, globe_fill_color)


func _draw_celestial_poles(center: Vector2, radius: float, basis: Basis, backdrop_fade: float = 1.0) -> void:
	_draw_celestial_pole(
		center,
		radius,
		basis,
		CelestialProjection.NCP_RA_DEG,
		CelestialProjection.NCP_DEC_DEG,
		north_pole_color,
		"NCP",
		backdrop_fade
	)
	_draw_celestial_pole(
		center,
		radius,
		basis,
		CelestialProjection.NCP_RA_DEG,
		-90.0,
		south_pole_color,
		"SCP",
		backdrop_fade
	)


func _draw_celestial_pole(
	center: Vector2,
	radius: float,
	basis: Basis,
	ra_deg: float,
	dec_deg: float,
	color: Color,
	label: String,
	backdrop_fade: float = 1.0
) -> void:
	var view_pos := CelestialProjection.orthographic_ra_dec_deg_to_view(ra_deg, dec_deg, basis)
	if not CelestialProjection.is_visible_in_view(view_pos):
		return
	var fade := CelestialProjection.limb_fade(view_pos, limb_fade_width) * backdrop_fade
	if fade <= 0.0:
		return

	var pos: Vector2 = _screen_from_view_pos(view_pos, center, radius)
	var arm := pole_marker_radius
	var draw_color := _with_alpha(color, fade)
	draw_line(pos + Vector2(-arm, 0.0), pos + Vector2(arm, 0.0), draw_color, 2.0, true)
	draw_line(pos + Vector2(0.0, -arm), pos + Vector2(0.0, arm), draw_color, 2.0, true)
	draw_circle(pos, arm * 0.35, draw_color)
	if show_pole_labels:
		_draw_label(
			pos + Vector2(arm + 4.0, -arm - 2.0),
			label,
			color.lightened(0.12),
			label_font_size,
			fade
		)


func _draw_ecliptic(center: Vector2, radius: float, basis: Basis, backdrop_fade: float = 1.0) -> void:
	for degree in range(360):
		var lon_a := deg_to_rad(float(degree))
		var lon_b := deg_to_rad(float(degree + 1))
		var equ_a := OrbitalMechanics.ecliptic_lon_lat_to_equatorial_rad(lon_a, 0.0)
		var equ_b := OrbitalMechanics.ecliptic_lon_lat_to_equatorial_rad(lon_b, 0.0)
		var segment := [
			[
				ConstellationCatalog.normalize_ra_deg(rad_to_deg(equ_a.x)),
				rad_to_deg(equ_a.y),
			],
			[
				ConstellationCatalog.normalize_ra_deg(rad_to_deg(equ_b.x)),
				rad_to_deg(equ_b.y),
			],
		]
		var clipped := _clip_segment_screen(segment, center, radius, basis)
		if clipped.size() < 2:
			continue
		var view_pos := CelestialProjection.orthographic_ra_dec_deg_to_view(
			float(segment[0][0]),
			float(segment[0][1]),
			basis
		)
		var fade := CelestialProjection.limb_fade(view_pos, limb_fade_width) * backdrop_fade
		draw_line(
			clipped[0],
			clipped[1],
			_with_alpha(ecliptic_color, fade),
			ecliptic_line_width,
			true
		)


func _draw_constellations(center: Vector2, radius: float, basis: Basis) -> void:
	for constellation_variant in _constellation_catalog.constellations:
		var constellation := constellation_variant as Dictionary
		var constellation_id := str(constellation.get("id", ""))
		var content_fade := _constellation_content_fade(constellation_id)
		if content_fade <= 0.0:
			continue

		if show_constellation_lines:
			for segment_variant in constellation.get("lines", []):
				var segment := segment_variant as Array
				var clipped := _clip_segment_screen(segment, center, radius, basis)
				if clipped.size() < 2:
					continue
				var view_pos := CelestialProjection.orthographic_ra_dec_deg_to_view(
					float((segment[0] as Array)[0]),
					float((segment[0] as Array)[1]),
					basis
				)
				var fade := CelestialProjection.limb_fade(view_pos, limb_fade_width) * content_fade
				if fade <= 0.0:
					continue
				draw_line(
					clipped[0],
					clipped[1],
					_with_alpha(constellation_line_color, fade),
					constellation_line_width,
					true
				)

		if show_constellation_vertex_stars:
			for star_variant in constellation.get("stars", []):
				var star := star_variant as Dictionary
				var view_pos := CelestialProjection.orthographic_ra_dec_deg_to_view(
					float(star["ra"]),
					float(star["dec"]),
					basis
				)
				if not CelestialProjection.is_visible_in_view(view_pos):
					continue
				var fade := CelestialProjection.limb_fade(view_pos, limb_fade_width) * content_fade
				if fade <= 0.0:
					continue
				var pos: Vector2 = _screen_from_view_pos(view_pos, center, radius)
				var magnitude: float = float(star.get("mag", 3.0))
				var core_radius: float = clampf((4.2 - magnitude * 0.9) * star_size_scale, 1.0, 6.0)
				_draw_star(pos, core_radius, star_color, fade)

		if show_constellation_names and content_fade > 0.05:
			var label_pos: Variant = _constellation_label_position(constellation, center, radius, basis)
			if label_pos != null:
				var label_fade := 0.85 * content_fade
				if constellation_id == _focused_constellation_id:
					label_fade = 1.0
				_draw_label(
					label_pos as Vector2,
					str(constellation.get("name", constellation.get("id", ""))),
					constellation_line_color.lightened(0.1),
					label_font_size - 1,
					label_fade
				)


func _constellation_label_position(
	constellation: Dictionary,
	center: Vector2,
	radius: float,
	basis: Basis
) -> Variant:
	var sum := Vector3.ZERO
	var count := 0
	for segment_variant in constellation.get("lines", []):
		var segment := segment_variant as Array
		for point_variant in segment:
			var point := point_variant as Array
			if point.size() < 2:
				continue
			var view_pos := CelestialProjection.orthographic_ra_dec_deg_to_view(
				float(point[0]),
				float(point[1]),
				basis
			)
			if not CelestialProjection.is_visible_in_view(view_pos):
				continue
			sum += view_pos
			count += 1
	if count == 0:
		return null
	var mean_view := (sum / float(count)).normalized()
	if not CelestialProjection.is_visible_in_view(mean_view):
		return null
	return _screen_from_view_pos(mean_view, center, radius)


func _draw_bodies(center: Vector2, radius: float, basis: Basis, jd: float, backdrop_fade: float = 1.0) -> void:
	var earth := OrbitalMechanics.heliocentric_ecliptic(_orbital_data["earth"] as Dictionary, jd)
	for planet_name in PLANET_DRAW_ORDER:
		if not _planet_visible(planet_name) or not _orbital_data.has(planet_name):
			continue
		var equatorial := OrbitalMechanics.geocentric_equatorial_rad(
			planet_name,
			_orbital_data,
			jd,
			earth
		)
		_draw_equatorial_body(
			center,
			radius,
			basis,
			equatorial,
			planet_radius,
			_planet_color(planet_name),
			PLANET_LABELS.get(planet_name, planet_name.capitalize()),
			show_planet_names,
			backdrop_fade
		)

	if show_sun:
		var sun_equatorial := OrbitalMechanics.sun_geocentric_equatorial_rad(_orbital_data, jd)
		_draw_equatorial_body(
			center,
			radius,
			basis,
			sun_equatorial,
			sun_radius,
			sun_color,
			"Sol",
			show_sun_label,
			backdrop_fade
		)

	if show_moon:
		var moon_equatorial := OrbitalMechanics.moon_geocentric_equatorial_rad(jd)
		_draw_equatorial_body(
			center,
			radius,
			basis,
			moon_equatorial,
			moon_radius,
			moon_color,
			"Luna",
			show_moon_label,
			backdrop_fade
		)


func _draw_equatorial_body(
	center: Vector2,
	radius: float,
	basis: Basis,
	equatorial: Vector2,
	body_radius: float,
	color: Color,
	label: String,
	show_label: bool,
	backdrop_fade: float = 1.0
) -> void:
	var ra_deg := rad_to_deg(equatorial.x)
	if ra_deg < 0.0:
		ra_deg += 360.0
	var dec_deg := rad_to_deg(equatorial.y)
	var view_pos := CelestialProjection.orthographic_ra_dec_deg_to_view(ra_deg, dec_deg, basis)
	if not CelestialProjection.is_visible_in_view(view_pos):
		return
	var fade := CelestialProjection.limb_fade(view_pos, limb_fade_width) * backdrop_fade
	if fade <= 0.0:
		return
	var pos: Vector2 = _screen_from_view_pos(view_pos, center, radius)
	draw_circle(pos, body_radius + 1.0, _with_alpha(color.darkened(0.25), fade))
	draw_circle(pos, body_radius, _with_alpha(color, fade))
	if show_label:
		_draw_label(pos + body_label_offset, label, color.lightened(0.15), label_font_size, fade)


func _planet_color(planet_name: String) -> Color:
	match planet_name:
		"mercury":
			return mercury_color
		"venus":
			return venus_color
		"mars":
			return mars_color
		"jupiter":
			return jupiter_color
		"saturn":
			return saturn_color
		_:
			return Color.WHITE


func _planet_visible(planet_name: String) -> bool:
	match planet_name:
		"mercury":
			return show_mercury
		"venus":
			return show_venus
		"mars":
			return show_mars
		"jupiter":
			return show_jupiter
		"saturn":
			return show_saturn
		_:
			return false


func _build_star_glow_texture() -> GradientTexture2D:
	var gradient := Gradient.new()
	gradient.colors = PackedColorArray([
		Color(1.0, 1.0, 1.0, 1.0),
		Color(1.0, 1.0, 1.0, 0.55),
		Color(1.0, 1.0, 1.0, 0.12),
		Color(1.0, 1.0, 1.0, 0.0),
	])
	gradient.offsets = PackedFloat32Array([0.0, 0.18, 0.45, 1.0])

	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.width = 64
	texture.height = 64
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(0.5, 0.0)
	return texture


func _draw_star(at: Vector2, core_radius: float, color: Color, fade: float) -> void:
	if fade <= 0.0:
		return
	var draw_color := _with_alpha(color, fade)
	if show_star_glow and _star_glow_texture != null:
		var diameter := maxf(core_radius * star_glow_diameter_scale, core_radius + 2.0)
		var half := diameter * 0.5
		draw_texture_rect(
			_star_glow_texture,
			Rect2(at - Vector2(half, half), Vector2(diameter, diameter)),
			false,
			draw_color
		)
	draw_circle(at, core_radius, draw_color)


func _load_label_font() -> Font:
	if label_font_path.is_empty() or not ResourceLoader.exists(label_font_path):
		return ThemeDB.fallback_font
	var font_file := FontFile.new()
	var err := font_file.load_dynamic_font(label_font_path)
	if err != OK:
		push_warning("MenuSkyOverviewGlobe: failed to load label font %s (error %d)." % [label_font_path, err])
		return ThemeDB.fallback_font
	return font_file


func _draw_label(at: Vector2, text: String, color: Color, font_size: int, fade: float = 1.0) -> void:
	if fade <= 0.0:
		return
	var font := _label_font if _label_font != null else ThemeDB.fallback_font
	draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, _with_alpha(color, fade))
