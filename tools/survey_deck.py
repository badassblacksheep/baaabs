"""Install the survey frame in the workshop using its analytical member endpoints."""
import numpy as np

from dj_booth import read_accessor
from dj_panel_layout import gltf_coordinates, node_matrix, transform_points


def member_matrix(member, bumper):
    a, b, axis = gltf_coordinates([member['a'], member['b'], member['axis_y']])
    d = b - a
    x = d / np.linalg.norm(d)
    y = axis - np.dot(axis, x) * x
    y /= np.linalg.norm(y)
    m = np.eye(4)
    m[:3, :3] = np.column_stack([d, y * member['width'], np.cross(x, y) * member['depth']])
    m[:3, 3] = (a + b) / 2 + [bumper, 0, 0]
    return m


def set_matrix(node, m):
    for k in ('translation', 'rotation', 'scale'):
        node.pop(k, None)
    node['matrix'] = m.T.ravel().tolist()


def mesh_bounds(model, node, world):
    primitives = model.doc['meshes'][node['mesh']]['primitives']
    points = np.concatenate([transform_points(read_accessor(model, p['attributes']['POSITION']), world)
                             for p in primitives])
    return np.array([points.min(axis=0), points.max(axis=0)])


def install_deck(model, recipe, bumper):
    doc = model.doc
    scene = doc['scenes'][doc.get('scene', 0)]
    nodes = doc['nodes']
    frame = recipe['candidate']
    rev = recipe['revision']
    group = next(nodes[i] for i in scene['nodes'] if nodes[i]['name'].startswith('Iteration 06 |'))
    children = [nodes[i] for i in group['children']]
    members = frame['members']
    posts = frame['shorePositions']
    if len(children) != len(members) + 3*len(posts):
        raise ValueError('Unexpected analytical frame inventory')
    old = {}
    for n, m in zip(children, members):
        if n['name'] != m['name']:
            raise ValueError('Analytical member order differs from the baked assembly')
        if m['name'] in ('Front corner post', 'Rear study · mirror of Front corner post'):
            old[m['name']] = node_matrix(n)[0, 3]
        set_matrix(n, member_matrix(m, bumper))
        n['extras']['structural_revision'] = rev
    for j, n in enumerate(children[len(members):]):
        if not n['extras'].get('concept_shore'):
            raise ValueError('Expected a shore tube or bearing')
        n['translation'][0] = bumper + posts[j//3][0]
        n['extras']['structural_revision'] = rev
    group['name'] = 'Survey frame | full truss with six body shores'

    # Floors and guardrails are authored meshes. Their object origins can be
    # outside the mesh, so use installed vertices to place a rigid rail post.
    attached = []
    def visit(i, parent):
        n = nodes[i]
        comp = n.get('extras', {}).get('component')
        world = parent @ node_matrix(n)
        if comp in ('deck', 'rails', 'access', 'ladder', 'structure') and 'mesh' in n:
            attached.append((n, comp, parent, world, mesh_bounds(model, n, world)))
        elif n is not group:
            for child in n.get('children', []):
                visit(child, world)
    for i in scene['nodes']:
        visit(i, np.eye(4))
    floors = [bounds for _, comp, _, _, bounds in attached if comp == 'deck']
    if len(floors) != 12:
        raise ValueError('Expected twelve dancefloor sections')
    old_start = min(b[0, 0] for b in floors)
    old_end = max(b[1, 0] for b in floors)
    start, end = bumper + np.array(frame['deckBoundsM'])
    old_portals = np.array([old['Front corner post'], old['Rear study · mirror of Front corner post']])
    portals = bumper + np.array(frame['portalXsM'])
    ratio = (end-start)/(old_end-old_start)
    portal_ratio = np.diff(portals)[0] / np.diff(old_portals)[0]
    for n, comp, parent, world, bounds in attached:
        name = n['name']
        center = bounds[:, 0].mean()
        change = np.eye(4)
        if comp == 'deck' or (comp == 'rails' and name.startswith(('Longitudinal_rail', 'Toe_board'))):
            change[0, 0] = ratio
            change[0, 3] = start - ratio*old_start
        elif comp == 'rails':
            change[0, 3] = start + (center-old_start)*ratio - center
        elif comp in ('access', 'ladder'):
            change[0, 3] = end-old_end
        elif name.startswith('Reference') or name.startswith('Interior post foot'):
            # Reference rail extents follow the assumed portal span. Retired
            # interior foot markers retain their relative chainage and section.
            change[0, 0] = portal_ratio if name.startswith('Reference') else 1
            change[0, 3] = portals[0] + (center-old_portals[0])*portal_ratio - center*change[0, 0]
        else:
            i = int(name.startswith('Rear study'))
            change[0, 3] = portals[i]-old_portals[i]
        set_matrix(n, np.linalg.solve(parent, change @ world))
        n['extras']['roof_iteration'] = rev

    extras = doc['asset']['extras']
    for key in ('roof_front_extension_ft', 'rear_body_face_datum_m', 'rear_body_face_datum_basis'):
        extras.pop(key, None)
    extras.update(roof_iteration=rev, structural_iteration=rev, concept_shoring_revision=rev,
                  roof_dimensions_ft=[frame['deckLengthIn']/12, frame['deckWidthIn']/12],
                  roof_bounds_world_x_m=[start, end], structural_geometry='assets/earl-deck-model.json',
                  deck_rear_overhang_from_support_m=end-portals[1],
                  concept_shore_positions_m=[[x+bumper, y, z] for x,y,z in posts],
                  rear_roof_frame_method='Inherited portal setbacks on survey-centered deck',
                  roof_revision_note='Deck centered on nominal bumper-to-bumper measurement.')
    scene['extras']['Deck concept'] = f"{frame['deckLengthIn']/12:g} × {frame['deckWidthIn']/12:g} ft trial deck, centered on surveyed Earl."
    scene['extras']['fit_revision'] = 'Surveyed longitudinal donor fit and survey-centered trial deck.'
