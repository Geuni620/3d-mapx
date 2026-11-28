"""Export exterior vehicle parts of the four CC BY-SA MTR packs as GLB."""
import argparse
import json
import math
import struct
from functools import lru_cache
from pathlib import Path
from zipfile import ZipFile

OUTPUT = Path(__file__).resolve().parents[1] / "public/rolling-stock"
PACKS = {
    1: ("flat_face_mtr4.zip", "mtr_custom_train_sm1000", "head_1"),
    2: ("ricecooker_mtr4.zip", "seoul_metro_2000_rotem", "cab_1"),
    3: ("seoul_metro_3000_chopper.zip", "seoul_metro_3000", "cab_1"),
    4: ("ricecooker_mtr4.zip", "seoul_metro_4000_rotem", "cab_1"),
    5: ("smrt_trains_mtr4.zip", "smrt_5000_1", "cab_1"),
    6: ("smrt_trains_mtr4.zip", "smrt_6000", "cab_1"),
    7: ("smrt_trains_mtr4.zip", "smrt_7000_1", "cab_1"),
    8: ("smrt_trains_mtr4.zip", "smrt_8000_1", "cab_1"),
}
FACES = {
    "north": (6, 2, 0, 4), "south": (3, 7, 5, 1),
    "east": (7, 6, 4, 5), "west": (2, 3, 1, 0),
    "up": (2, 6, 7, 3), "down": (1, 5, 4, 0),
}


def around(point, pivot, angles):
    x, y, z = (a - b for a, b in zip(point, pivot))
    ax, ay, az = map(math.radians, angles)
    y, z = y * math.cos(ax) - z * math.sin(ax), y * math.sin(ax) + z * math.cos(ax)
    x, z = x * math.cos(ay) + z * math.sin(ay), z * math.cos(ay) - x * math.sin(ay)
    x, y = x * math.cos(az) - y * math.sin(az), x * math.sin(az) + y * math.cos(az)
    return [x + pivot[0], y + pivot[1], z + pivot[2]]


def model_groups(model):
    elements = {item["uuid"]: item for item in model["elements"]}
    groups = {item["uuid"]: item for item in model.get("groups", [])}

    def cubes(node, rotations):
        if isinstance(node, str):
            if node in elements:
                element = elements[node]
                yield element, [element, *rotations]
            return
        group = groups.get(node["uuid"], node)
        for child in node["children"]:
            yield from cubes(child, [group, *rotations])

    return {groups.get(node["uuid"], node)["name"]: list(cubes(node, []))
            for node in model["outliner"] if isinstance(node, dict)}


def vehicle_meshes(vehicle, read_json):
    meshes = {}
    indicators = {}
    for model_ref in vehicle["models"]:
        model = read_json(model_ref["modelResource"])
        properties = read_json(model_ref["modelPropertiesResource"])
        definitions = read_json(model_ref["positionDefinitionsResource"])
        offsets = {d["name"]: d for d in definitions["positionDefinitions"]}
        texture = model_ref["textureResource"]
        groups = model_groups(model)
        width, height = (model["resolution"][axis] for axis in ("width", "height"))
        for part in properties["parts"]:
            exterior = part["renderStage"] in ("EXTERIOR", "EXTERIOR_TRANSLUCENT", "ALWAYS_ON_LIGHT")
            if not exterior or part["type"] != "NORMAL":
                continue
            if part["condition"] not in ("NORMAL", "DOORS_CLOSED", "ON_ROUTE_FORWARDS"):
                continue
            for name in part["names"]:
                for key in part["positionDefinitions"]:
                    definition = offsets[key]
                    for field in ("positions", "positionsFlipped"):
                        for offset in definition.get(field, []):
                            for cube, rotations in groups.get(name, []):
                                if cube.get("type") != "cube":
                                    continue
                                transformed = []
                                for corner in range(8):
                                    point = [
                                        cube["to" if corner & bit else "from"][i]
                                        for i, bit in enumerate([4, 2, 1])
                                    ]
                                    for transform in rotations:
                                        if any(transform.get("rotation", [])):
                                            point = around(point, transform["origin"], transform["rotation"])
                                    x, y, z = point
                                    if field == "positionsFlipped":
                                        x, z = -x, -z
                                    transformed.append(((x - offset.get("x", 0)) / 16,
                                                        (y - offset.get("y", 0)) / 16 + properties.get("modelYOffset", 0),
                                                        (z + offset.get("z", 0)) / 16))
                                slide = part.get("doorZMultiplier", 0) / 16
                                if field == "positionsFlipped":
                                    slide = -slide
                                side = ""
                                if slide:
                                    x = sum(point[0] for point in transformed) / len(transformed)
                                    side = "right" if x > 0 else "left"
                                    door = side, offset.get("z", 0)
                                    surface = max(abs(point[0]) for point in transformed)
                                    ceiling = max(point[1] for point in transformed)
                                    previous = indicators.get(door, (0, 0))
                                    indicators[door] = max(surface, previous[0]), max(ceiling, previous[1])
                                points, uvs, indices = meshes.setdefault((texture, side, slide), ([], [], []))
                                for direction, face in cube["faces"].items():
                                    if "uv" not in face:
                                        continue
                                    quad = [transformed[i] for i in FACES[direction]]
                                    if len(set(quad)) < 4:
                                        continue
                                    u0, v0, u1, v1 = face["uv"]
                                    if u0 == u1 or v0 == v1:
                                        continue
                                    start = len(points)
                                    points.extend(quad)
                                    uvs.extend([(u0 / width, v0 / height), (u1 / width, v0 / height),
                                                (u1 / width, v1 / height), (u0 / width, v1 / height)])
                                    indices.extend(start + i for i in (0, 2, 1, 0, 3, 2))
    meshes = {key: data for key, data in meshes.items() if data[0]}
    lamps = {"left": [], "right": []}
    if meshes:
        length_coordinates = [z for points, _, _ in meshes.values() for _, _, z in points]
        low, high = min(length_coordinates), max(length_coordinates)
        center = (low + high) / 2
        # 지도에서 사용하는 19.5m 차량 간격 안에 커플러가 겹치지 않도록 외형 길이를 맞춘다.
        length_scale = 19 / (high - low)
        scaled = {}
        for (texture, side, slide), (points, uvs, indices) in meshes.items():
            points[:] = [(x, y, (z - center) * length_scale) for x, y, z in points]
            scaled[texture, side, round(slide * length_scale, 4)] = points, uvs, indices
        meshes = scaled
        for (side, door_z), (x, y) in indicators.items():
            lamps[side].append([
                (x + 0.04) * (1 if side == "right" else -1),
                y - 0.05,
                (door_z / 16 - center) * length_scale,
            ])
    return meshes, lamps


def glb(archive, parts):
    data = bytearray()
    doc = {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0, 1]}],
           "nodes": [], "meshes": [], "images": [], "textures": [], "materials": [],
           "bufferViews": [], "accessors": [], "buffers": [], "samplers": [{}]}

    def view(blob):
        index = len(doc["bufferViews"])
        doc["bufferViews"].append({"buffer": 0, "byteOffset": len(data), "byteLength": len(blob)})
        data.extend(blob)
        data.extend(b"\0" * (-len(data) % 4))
        return index

    def accessor(values, scalar, kind, component, bounds=False):
        flat = values if kind == "SCALAR" else [item for value in values for item in value]
        index = len(doc["accessors"])
        item = {"bufferView": view(struct.pack(f"<{len(flat)}{scalar}", *flat)),
                "componentType": component, "count": len(values), "type": kind}
        if bounds:
            item["min"] = [min(axis) for axis in zip(*values)]
            item["max"] = [max(axis) for axis in zip(*values)]
        doc["accessors"].append(item)
        return index

    materials = {}
    for name, (_, lamps) in parts.items():
        doc["nodes"].append({"name": name, "children": [], "extras": {"doorIndicators": lamps}})
    for parent, (name, (meshes, _)) in enumerate(parts.items()):
        for (texture, side, slide), (points, uvs, indices) in meshes.items():
            if texture not in materials:
                material = materials[texture] = len(materials)
                filename = texture.replace("mtr:", "assets/mtr/", 1)
                doc["images"].append({"mimeType": "image/png", "bufferView": view(archive.read(filename))})
                doc["textures"].append({"source": material, "sampler": 0})
                doc["materials"].append({"alphaMode": "MASK", "alphaCutoff": 0.12,
                    "pbrMetallicRoughness": {"baseColorTexture": {"index": material},
                                              "roughnessFactor": 0.9, "metallicFactor": 0}})
            primitive = {"material": materials[texture],
                "attributes": {"POSITION": accessor(points, "f", "VEC3", 5126, True),
                               "TEXCOORD_0": accessor(uvs, "f", "VEC2", 5126)},
                "indices": accessor(indices, "I", "SCALAR", 5125)}
            child = {"name": f"{name}-{side or 'shell'}-{len(doc['meshes'])}", "mesh": len(doc["meshes"])}
            if side:
                child["extras"] = {"doorSide": side, "doorSlide": slide}
            doc["nodes"][parent]["children"].append(len(doc["nodes"]))
            doc["nodes"].append(child)
            doc["meshes"].append({"primitives": [primitive]})
    doc["buffers"].append({"byteLength": len(data)})
    metadata = json.dumps(doc, separators=(",", ":")).encode()
    metadata += b" " * (-len(metadata) % 4)
    return (struct.pack("<4sIIII", b"glTF", 2, 28 + len(metadata) + len(data),
                        len(metadata), 0x4E4F534A) + metadata +
            struct.pack("<II", len(data), 0x004E4942) + data)


def export_line(packs, line, spec):
    filename, prefix, cab = spec
    with ZipFile(packs / filename) as archive:
        @lru_cache
        def read_json(resource):
            return json.loads(archive.read(resource.replace("mtr:", "assets/mtr/", 1)))

        vehicles = {vehicle["id"]: vehicle for vehicle in
                    read_json("mtr:mtr_custom_resources.json")["vehicles"]}
        parts = {name: vehicle_meshes(vehicles[f"{prefix}_{variant}"], read_json)
                 for name, variant in (("cab", cab), ("trailer", "trailer"))}
        if any(not meshes or not all(lamps.values()) for meshes, lamps in parts.values()):
            raise ValueError(f"Missing exterior geometry or door leaves for line {line}")
        target = OUTPUT / f"line-{line}.glb"
        target.write_bytes(glb(archive, parts))
        print(target.name, target.stat().st_size, vehicles[f"{prefix}_{cab}"]["name"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("packs", type=Path)
    args = parser.parse_args()
    OUTPUT.mkdir(exist_ok=True)
    for line, spec in PACKS.items():
        export_line(args.packs, line, spec)
