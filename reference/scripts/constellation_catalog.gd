extends RefCounted
class_name ConstellationCatalog

## Loads d3-celestial GeoJSON constellation lines + metadata into the sky-map schema.

var polaris: Dictionary = {}
var constellations: Array = []


static func load_from_d3_celestial(
	lines_path: String,
	meta_path: String,
	max_rank: int = 3,
	min_declination_deg: float = -90.0,
	extract_vertex_stars: bool = true
) -> ConstellationCatalog:
	var catalog := ConstellationCatalog.new()
	var meta_by_id: Dictionary = _load_metadata(meta_path)
	var lines_root: Dictionary = _load_json_file(lines_path)
	if lines_root.is_empty():
		return catalog

	var merged: Dictionary = {}
	var best_polaris_dec: float = -INF

	var features: Array = lines_root.get("features", [])
	for feature_variant in features:
		var feature := feature_variant as Dictionary
		var feature_id: String = str(feature.get("id", ""))
		if feature_id.is_empty():
			continue

		var meta: Dictionary = meta_by_id.get(feature_id, {})
		var rank: int = int(meta.get("rank", 3))
		if rank > max_rank:
			continue

		var geometry: Dictionary = feature.get("geometry", {})
		var line_groups: Array = geometry.get("coordinates", [])
		var segments: Array = _segments_from_coordinates(line_groups, min_declination_deg)

		if segments.is_empty():
			continue

		if not merged.has(feature_id):
			merged[feature_id] = {
				"id": feature_id.to_lower(),
				"name": str(meta.get("name", feature_id)),
				"rank": rank,
				"lines": [],
				"stars": [],
			}

		var entry: Dictionary = merged[feature_id]
		var entry_lines: Array = entry["lines"]
		for segment in segments:
			entry_lines.append(segment)
			for point in segment:
				var point_ra: float = float(point[0])
				var point_dec: float = float(point[1])
				if point_dec > best_polaris_dec:
					best_polaris_dec = point_dec
					catalog.polaris = {
						"ra": point_ra,
						"dec": point_dec,
						"name": "Polaris",
					}

		if extract_vertex_stars:
			var entry_stars: Array = entry["stars"]
			_append_vertex_stars(entry_stars, segments, min_declination_deg)

	catalog.constellations = merged.values()
	catalog.constellations.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return str(a.get("id", "")) < str(b.get("id", ""))
	)
	return catalog


static func _load_json_file(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("ConstellationCatalog: failed to open %s (error %d)." % [path, FileAccess.get_open_error()])
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		return parsed
	push_error("ConstellationCatalog: invalid JSON in %s." % path)
	return {}


static func _load_metadata(meta_path: String) -> Dictionary:
	var root: Dictionary = _load_json_file(meta_path)
	var meta_by_id: Dictionary = {}
	for feature_variant in root.get("features", []):
		var feature := feature_variant as Dictionary
		var feature_id: String = str(feature.get("id", ""))
		if feature_id.is_empty():
			continue
		var properties: Dictionary = feature.get("properties", {})
		meta_by_id[feature_id] = {
			"name": str(properties.get("name", properties.get("la", properties.get("en", feature_id)))),
			"rank": int(properties.get("rank", 3)),
		}
	return meta_by_id


static func _segments_from_coordinates(line_groups: Array, min_declination_deg: float) -> Array:
	var segments: Array = []
	for group_variant in line_groups:
		var group := group_variant as Array
		if group.size() < 2:
			continue
		for index in range(group.size() - 1):
			var start := group[index] as Array
			var end := group[index + 1] as Array
			if start.size() < 2 or end.size() < 2:
				continue
			var start_ra: float = normalize_ra_deg(float(start[0]))
			var start_dec: float = float(start[1])
			var end_ra: float = normalize_ra_deg(float(end[0]))
			var end_dec: float = float(end[1])
			if start_dec < min_declination_deg and end_dec < min_declination_deg:
				continue
			segments.append([[start_ra, start_dec], [end_ra, end_dec]])
	return segments


static func _append_vertex_stars(stars: Array, segments: Array, min_declination_deg: float) -> void:
	var seen: Dictionary = {}
	for segment_variant in segments:
		var segment := segment_variant as Array
		for point_variant in segment:
			var point := point_variant as Array
			if point.size() < 2:
				continue
			var ra: float = normalize_ra_deg(float(point[0]))
			var dec: float = float(point[1])
			if dec < min_declination_deg:
				continue
			var key := "%0.4f,%0.4f" % [ra, dec]
			if seen.has(key):
				continue
			seen[key] = true
			stars.append({"ra": ra, "dec": dec, "mag": 3.0})


static func normalize_ra_deg(ra_deg: float) -> float:
	return fposmod(ra_deg, 360.0)
