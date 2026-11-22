"""Build the party-side window and interior DJ layout in Earl's design model.

The cut is a projection along Blender Y. Each plate and trim segment stays on
its own tilted facet. The donor glazing is a photo on an opaque surface, so
only the photographed glass is replaced, leaving the original frames and sash.
"""
import math
import numpy as np

PANEL_IDS = ('B-D-047', 'B-D-048', 'B-D-050', 'B-D-071')
CENTER_X = (-2.9095 + .6895) / 2
# Counterclockwise, as seen in the X / height elevation. All lengths are metres.
APERTURE = np.array([(CENTER_X + x, z) for x, z in
                     [(-.86, 2.27), (-.61, 1.96), (.61, 1.96),
                      (.86, 2.27), (.44, 2.55), (-.44, 2.55)]])
EPS = 1.e-9


def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def edges(poly):
    return zip(poly, np.roll(poly, -1, axis=0))


def signed_area(poly):
    return sum(cross2(a, b) for a, b in edges(poly)) / 2


def segment_interval(p, q, convex):
    """Return the parameter interval inside a convex polygon in either winding."""
    lo, hi = 0., 1.
    winding = 1 if signed_area(convex) > 0 else -1
    for a, b in edges(convex):
        d0 = winding * cross2(b-a, p-a)
        d1 = winding * cross2(b-a, q-a)
        if max(d0, d1) < -EPS:
            return None
        if d0 < -EPS:
            lo = max(lo, d0 / (d0-d1))
        if d1 < -EPS:
            hi = min(hi, d0 / (d0-d1))
    return (lo, hi) if hi-lo > EPS else None


def panel_loops(vertices):
    """Return ordered surviving XYZ contours for one registered triangular panel."""
    vertices = np.asarray(vertices, dtype=float)
    subject = vertices[:, [0, 2]]
    segments = []
    def append(p, q, a, b):
        if b-a > EPS:
            segments.append((p+(q-p)*a, p+(q-p)*b))
    for p, q in edges(subject):
        interval = segment_interval(p, q, APERTURE)
        if interval is None:
            append(p, q, 0, 1)
        else:
            append(p, q, 0, interval[0])
            append(p, q, interval[1], 1)
    # A hole's edges must wind opposite to the sheet's perimeter.
    cut = APERTURE[::-1] if signed_area(subject) > 0 else APERTURE
    for p, q in edges(cut):
        interval = segment_interval(p, q, subject)
        if interval:
            append(p, q, *interval)
    key = lambda p: tuple(np.round(p, 8))
    outgoing = {key(p): (p, q) for p, q in segments}
    embedding = np.linalg.solve(np.column_stack((subject, np.ones(3))), vertices[:, 1])
    loops = []
    while outgoing:
        first = cursor = next(iter(outgoing))
        loop = []
        while True:
            p, q = outgoing.pop(cursor)
            loop.append([float(p[0]), float(np.dot(p, embedding[:2])+embedding[2]), float(p[1])])
            cursor = key(q)
            if cursor == first:
                break
        loops.append(loop)
    return loops


def split_at_edge(polygon, a, b):
    """Clip packed vertices and linearly interpolate position, normal and UV."""
    inside, outside = [], []
    for p, q in edges(polygon):
        d0 = cross2(b-a, p[:2]-a)
        d1 = cross2(b-a, q[:2]-a)
        if d0 >= -EPS:
            inside.append(p)
        if d0 <= EPS:
            outside.append(p)
        if (d0 < -EPS and d1 > EPS) or (d0 > EPS and d1 < -EPS):
            hit = p + (q-p) * (d0 / (d0-d1))
            inside.append(hit)
            outside.append(hit)
    def as_polygon(points):
        if len(points) >= 3 and abs(signed_area(np.asarray(points)[:, :2])) > EPS:
            return np.asarray(points)
        return None
    return as_polygon(inside), as_polygon(outside)


def difference(polygon, convex):
    """Subtract a convex cutter; each returned polygon can be triangulated as a fan."""
    retained = []
    remaining = polygon
    for a, b in edges(convex):
        remaining, outside = split_at_edge(remaining, a, b)
        if outside is not None:
            retained.append(outside)
        if remaining is None:
            break
    return retained, remaining


def read_accessor(model, index):
    a = model.doc['accessors'][index]
    v = model.doc['bufferViews'][a['bufferView']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    dtype = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']])
    arr = np.ndarray((a['count'], width), dtype=dtype, buffer=model.bin,
                     offset=v.get('byteOffset', 0) + a.get('byteOffset', 0),
                     strides=(v.get('byteStride', width*dtype.itemsize), dtype.itemsize))
    return arr.copy()


def unpack_surface(model, node):
    # The registered plates and donor skins use only identity or translation.
    if any(k in node for k in ('matrix', 'rotation', 'scale')):
        raise ValueError(f"Unsupported local transform on {node['name']}")
    mesh = model.doc['meshes'][node['mesh']]
    prim, = mesh['primitives']
    attrs = prim['attributes']
    xyz = read_accessor(model, attrs['POSITION']).astype(float) + node.get('translation', [0, 0, 0])
    packed = np.column_stack((xyz, read_accessor(model, attrs['NORMAL']),
                              read_accessor(model, attrs['TEXCOORD_0'])))
    indices = read_accessor(model, prim['indices']).reshape(-1, 3)
    return [packed[tri] for tri in indices], prim['material']


def make_surface(model, faces, material, origin):
    vertices, indices = [], []
    for face in faces:
        start = len(vertices)
        vertices.extend(face)
        for j in range(1, len(face)-1):
            indices.extend((start, start+j, start+j+1))
    data = np.asarray(vertices)
    attrs = {'POSITION': model.accessor((data[:, :3] - origin).tolist(), 3),
             'NORMAL': model.accessor(data[:, 3:6].tolist(), 3),
             'TEXCOORD_0': model.accessor(data[:, 6:8].tolist(), 2)}
    return {'attributes': attrs, 'indices': model.accessor(indices, 1, True), 'material': material}


def replace_surface(model, node, primitives):
    # Keep the untouched source mesh in the document for archives and comparisons.
    old = model.doc['meshes'][node['mesh']]
    node['mesh'] = len(model.doc['meshes'])
    model.doc['meshes'].append({**old, 'name': node['name'] + ' / DJ revision', 'primitives': primitives})


def add_material(model, name, rgba, roughness=.78, metallic=0):
    mat = {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': {
        'baseColorFactor': rgba, 'metallicFactor': metallic, 'roughnessFactor': roughness}}
    if rgba[3] < 1:
        mat['alphaMode'] = 'BLEND'
    model.doc['materials'].append(mat)
    return len(model.doc['materials'])-1


def add_mesh(model, name, faces, mat, component):
    """Small flat-shaded meshes specified in Blender world XYZ."""
    positions, normals, indices = [], [], []
    for face in faces:
        gltf = np.asarray(face, dtype=float)[:, [0, 2, 1]].copy()
        gltf[:, 2] *= -1
        norm = np.cross(gltf[1]-gltf[0], gltf[2]-gltf[0])
        norm /= np.linalg.norm(norm)
        start = len(positions)
        positions.extend(gltf.tolist())
        normals.extend([norm.tolist()] * len(gltf))
        for j in range(1, len(gltf)-1):
            indices.extend((start, start+j, start+j+1))
    doc = model.doc
    mesh = len(doc['meshes'])
    doc['meshes'].append({'name': name, 'primitives': [{
        'attributes': {'POSITION': model.accessor(positions, 3), 'NORMAL': model.accessor(normals, 3)},
        'indices': model.accessor(indices, 1, True), 'material': mat}]})
    node = len(doc['nodes'])
    doc['nodes'].append({'name': name, 'mesh': mesh, 'extras': {
        'component': component, 'dj_booth_revision': 1, 'layout_provisional': True}})
    doc['scenes'][doc.get('scene', 0)]['nodes'].append(node)


def pane_cutters():
    # Opaque photograph retains the window posts, sill and horizontal sash. These
    # sloped boundaries are traced from the photo as registered on the model.
    for left_lower, left_upper, right_lower, right_upper in (
            (-1.975, -2.005, -1.43, -1.44),
            (-1.255, -1.29, -.70, -.71),
            (-.515, -.55, -.23, -.235)):
        sl, su = 1.944, 2.609
        def x_at(low, high, z):
            return low + (high-low)*(z-sl)/(su-sl)
        for z0, z1 in ((sl, 2.23), (2.288, su)):
            yield np.array([(x_at(left_lower, left_upper, z0), z0),
                            (x_at(right_lower, right_upper, z0), z0),
                            (x_at(right_lower, right_upper, z1), z1),
                            (x_at(left_lower, left_upper, z1), z1)])


def open_donor_glass(model, glass_material):
    for node in model.doc['nodes']:
        if not node['name'].startswith('Bus__Driver glazing band '):
            continue
        faces, original_material = unpack_surface(model, node)
        all_x = np.concatenate(faces)[:, 0]
        cutters = [c for c in pane_cutters() if c[:,0].max() > all_x.min() and c[:,0].min() < all_x.max()]
        if not cutters:
            continue
        transparent = []
        for cutter in cutters:
            rest = []
            for poly in faces:
                clipped, glass = difference(poly, cutter)
                if glass is None:
                    rest.append(poly)
                else:
                    rest.extend(clipped)
                    transparent.append(glass)
            faces = rest
        if transparent:
            origin = node['translation']
            replace_surface(model, node, [make_surface(model, faces, original_material, origin),
                                         make_surface(model, transparent, glass_material, origin)])


def outer_border(width):
    # Intersect each pair of offset lines, producing a constant-width mitered frame.
    result = []
    for i, p in enumerate(APERTURE):
        directions = np.array([p-APERTURE[i-1], APERTURE[(i+1) % len(APERTURE)]-p])
        normals = directions[:, [1, 0]].copy()
        normals[:, 1] *= -1
        normals /= np.linalg.norm(normals, axis=1)[:, None]
        result.append(p + np.linalg.solve(normals, [width, width]))
    return np.array(result)


def rim_for_sheet(model, node, rim_faces):
    triangles, _ = unpack_surface(model, node)
    triangle, = triangles
    subject = triangle[:, :2]
    if signed_area(subject) < 0:
        subject = subject[::-1]
    outer = outer_border(.025)
    plane = np.linalg.solve(np.column_stack((triangle[:, :2], np.ones(3))), triangle[:, 2])
    for i, (p, q) in enumerate(edges(APERTURE)):
        quad = np.array([q, p, outer[i], outer[(i+1) % len(outer)]])
        _, band = difference(quad, subject)
        if band is not None:
            rim_faces.append([(x, -float(plane[0]*x+plane[1]*z+plane[2])-.004, z) for x, z in band])


def block(x0, x1, y0, y1, z0, z1):
    corners = [(x, y, z) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    return [[corners[i] for i in face] for face in
            [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]]


def disc(cx, cy, radius, z):
    return [[(cx+radius*math.cos(i*math.tau/32), cy+radius*math.sin(i*math.tau/32), z)
             for i in range(32)]]


def add_interior(model):
    def material(label, color):
        return add_material(model, 'Workshop_equipment_DJ_'+label, [*color, 1])
    black = material('Console', [.027, .034, .044])
    felt = material('Lounge', [.19, .046, .125])
    brass = material('Controls', [.62, .39, .13])
    deck = material('Platter', [.22, .24, .27])
    def add(label, faces, mat):
        add_mesh(model, label, faces, mat, 'dj_interior')
    # Floor elevation and usable cabin dimensions are provisional. Booth and
    # settee stay forward of the driver-side exit, with approach via center aisle.
    add('DJ booth / console', block(-1.89,-.33,-1.12,-.64,1.79,1.85) +
        block(-1.79,-1.74,-1.09,-.69,1.01,1.79) + block(-.48,-.43,-1.09,-.69,1.01,1.79),black)
    players, jogs, mixer = [], [], []
    for x in (CENTER_X-.42, CENTER_X+.42):
        players += block(x-.20,x+.20,-1.08,-.68,1.85,1.892)
        jogs += disc(x,-.85,.109,1.895)
    players += block(CENTER_X-.167,CENTER_X+.167,-1.08,-.68,1.85,1.892)
    for ch in range(4):
        x = CENTER_X-.111+.074*ch
        mixer += block(x-.008,x+.008,-.923,-.77,1.893,1.897)
        mixer += block(x-.019,x+.019,-.85+.013*(ch%2),-.825+.013*(ch%2),1.897,1.907)
    add('DJ booth / players and mixer', players, black)
    add('DJ booth / jog wheels', jogs, deck)
    add('DJ booth / channel faders', mixer, brass)
    # Open under-seat bay with ends but no center divider leaves 1.64 m for props.
    add('DJ lounge / under-seat prop cubby', block(-1.99,-.25,.50,1.09,1.02,1.07) +
        block(-1.99,-1.94,.50,1.09,1.07,1.31) + block(-.30,-.25,.50,1.09,1.07,1.31) +
        block(-1.99,-.25,.50,1.09,1.31,1.36),black)
    add('DJ lounge / charcoal liner below passenger windows',
        block(-3.0,.14,1.148,1.160,1.01,1.91),black)
    add('DJ lounge / couch', block(-1.97,-1.13,.47,1.065,1.36,1.46) +
        block(-1.11,-.27,.47,1.065,1.36,1.46) +
        block(-1.99,-.25,.98,1.12,1.46,1.84),felt)


def apply_dj_booth(model):
    doc = model.doc
    rim = add_material(model, 'Workshop_panels_DJ_Rim', [.018, .020, .024, 1], .86)
    glass = add_material(model, 'Workshop_bus_DJ_Glazing', [.47, .65, .72, .10], .2)
    found, rim_faces = set(), []
    for n in doc['nodes']:
        pid = n.get('extras', {}).get('panel_id')
        if pid in PANEL_IDS:
            rim_for_sheet(model, n, rim_faces)
            found.add(pid)
    if found != set(PANEL_IDS):
        raise ValueError(f'DJ opening requires {PANEL_IDS}, found {found}')
    from dj_panel_layout import apply_sheet_spec, repack_panels
    panel_count = repack_panels(model)
    apply_sheet_spec(doc,panel_count)
    add_mesh(model, 'DJ port / folded matte perimeter', rim_faces, rim, 'dj_rim')
    open_donor_glass(model, glass)
    add_interior(model)
    doc['asset'].setdefault('extras', {})['dj_booth_revision'] = 1
    doc['scenes'][doc.get('scene', 0)].setdefault('extras', {}).update(
        panel_count=panel_count, dj_booth_layout='Party-side DJ, opposite lounge and under-seat prop bay; verify on Earl.')
