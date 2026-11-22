# /// script
# requires-python = ">=3.10"
# dependencies = ["mapbox-vector-tile>=2,<3", "shapely>=2,<3", "pillow>=10"]
# ///
"""uv run scripts/generate-dangsan-scenery.py — rebuild the local Three.js scenery from public tiles."""
import io
import json
import math
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import mapbox_vector_tile
from PIL import Image
from shapely.geometry import shape, box, LineString
from shapely.ops import transform, unary_union
from shapely.prepared import prep

BASE = "https://tiles.openfreemap.org/planet/20261115_080022_pt"
DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"
ORIGIN = (126.90909, 37.54232)
R = 6371008.8
SCALE = math.pi * R / 180
COS = math.cos(math.radians(ORIGIN[1]))
BOUNDS = box(-2500, -2800, 4600, 2900)
OUT = Path(__file__).resolve().parents[1] / "src/features/dangsan/data"
OUT.mkdir(parents=True, exist_ok=True)

def tile(lon, lat, z):
    n = 2**z
    return (lon+180)/360*n, (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n

def coords(x, y):
    return ORIGIN[0]+x/(SCALE*COS), ORIGIN[1]+y/SCALE

def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "3d-mapx-scenery/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                return response.read()
        except OSError:
            if attempt == 2:
                raise

def load_tile(xy):
    x,y=xy
    data=mapbox_vector_tile.decode(get(f"{BASE}/14/{x}/{y}.pbf"), default_options={"y_coord_down":True})
    result=[]
    for layer in ["water","building","landcover","landuse","transportation"]:
        for feature in data.get(layer,{}).get("features",[]):
            tags=feature["properties"]
            kind=tags.get("class","")
            if layer=="transportation" and kind not in ["motorway","trunk","primary","secondary","tertiary","minor","service","path","rail"]: continue
            if layer=="landcover" and kind not in ["grass","wood","farmland"]: continue
            if layer=="landuse" and kind not in ["park","grass","cemetery","recreation_ground","forest"]: continue
            extent=data[layer]["extent"]
            def to_local(px,py):
                lon=(x+px/extent)/16384*360-180
                lat=math.degrees(math.atan(math.sinh(math.pi*(1-2*(y+py/extent)/16384))))
                return (lon-ORIGIN[0])*SCALE*COS,(lat-ORIGIN[1])*SCALE
            g=transform(to_local,shape(feature["geometry"]))
            # Remove the vector tile buffer before combining neighboring tiles.
            l,top=to_local(0,0);r,b=to_local(extent,extent)
            if not g.is_valid: g=g.buffer(0)
            g=g.intersection(box(l,b,r,top)).intersection(BOUNDS)
            if not g.is_empty: result.append((layer,kind,tags,g))
    return result

def parts(g,typ):
    if g.geom_type == typ: return [g]
    return [p for item in getattr(g,"geoms",[]) for p in parts(item,typ)]

def ring(g):
    return [round(v,1) for x,y in list(g.coords)[:-1] for v in (x,y)]

def polygon(g):
    return [ring(g.exterior),*[ring(h) for h in g.interiors if len(h.coords)>3]]

if __name__=="__main__":
    west,south,east,north=BOUNDS.bounds
    x0,y0=tile(*coords(west,north),14);x1,y1=tile(*coords(east,south),14)
    jobs=[(x,y) for x in range(int(x0),int(x1)+1) for y in range(int(y0),int(y1)+1)]
    buildings=[];water=[];parks=[];roads=[];seen=set()
    with ThreadPoolExecutor(max_workers=4) as pool:
        for features in pool.map(load_tile,jobs):
            for layer,kind,tags,g in features:
                if layer=="transportation":
                    for line in parts(g,"LineString"):
                        if line.length<20:continue
                        roads.append([kind,[round(n,1) for x,y in line.simplify(1.2).coords for n in (x,y)]])
                    continue
                for p in parts(g,"Polygon"):
                    if p.area<12:continue
                    if layer=="water":water.append(p)
                    elif layer=="building":
                        c=p.centroid
                        if p.area<80 and math.hypot(c.x,c.y)>1600:continue
                        # Prefer actual feature heights in the vector tiles, with a documented fallback.
                        key=(round(c.x),round(c.y),round(p.area))
                        if key in seen:continue
                        seen.add(key)
                        buildings.append([float(tags.get("render_height") or tags.get("height") or 6),*polygon(p.simplify(.65))])
                    else:parks.append(p)
    river=unary_union(water).simplify(1.7)
    land=BOUNDS.difference(river)
    wet = prep(river)
    dry_roads = []
    for kind, flat in roads:
        line = LineString(zip(flat[::2], flat[1::2]))
        if not wet.intersects(line):
            dry_roads.append([kind, flat])
        else:
            for clipped in parts(line.difference(river), "LineString"):
                if clipped.length > 5:
                    dry_roads.append([kind, [round(v, 1) for p in clipped.coords for v in p]])
    roads = dry_roads
    terrain={}
    print("vector tiles:",len(jobs),"buildings:",len(buildings),"roads:",len(roads),flush=True)
    def height(x,y):
        tx,ty=tile(*coords(x,y),9);key=(int(tx),int(ty))
        if key not in terrain:
            terrain[key]=Image.open(io.BytesIO(get(f"{DEM}/9/{key[0]}/{key[1]}.png"))).convert("RGB")
        r,g,b=terrain[key].getpixel((int(tx%1*256),int(ty%1*256)))
        return round(r*256+g+b/256-32768)
    grid=[[height(x,y) for x in range(-12000,24001,360)] for y in range(-16000,20001,360)]
    payload=dict(origin=ORIGIN,land=[polygon(p) for p in parts(land,"Polygon") if p.area>150],
        river=[polygon(p) for p in parts(river,"Polygon") if p.area>300],
        parks=[polygon(p.simplify(2)) for p in parts(unary_union(parks),"Polygon") if p.area>400],
        roads=roads,buildings=buildings,dem=grid)
    path=OUT/"riverfront.json"
    path.write_text(json.dumps(payload,separators=(",",":"))+"\n");print(path,path.stat().st_size,flush=True)
