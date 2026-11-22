"""Fit one plane per cut panel while keeping shared seams and openings together."""
import hashlib
from itertools import product
import json

import numpy as np

from panel_patterns import area, points, value


MODEL_TOL = 1e-6  # One micron in the serialized metre-coordinate design.
JOIN_TOL = 1e-6


def plane(vertices):
    center = vertices.mean(axis=0)
    _, _, basis = np.linalg.svd(vertices - center, full_matrices=False)
    return center, basis[-1]


def segment_fraction(point, a, b):
    edge = b-a
    t = float((point-a)@edge / (edge@edge))
    return t, np.linalg.norm(point-a-t*edge)


def corners(parts):
    """Assign each shared corner one displacement, preserving its input coordinate."""
    positions, cells, indices, fixed = [], {}, {}, set()
    neighbors = tuple(product((-1,0,1),repeat=3))
    for pid, panel in parts.items():
        ids = []
        for point in np.asarray(panel['vertices_m']):
            cell = np.floor(point/JOIN_TOL).astype(int)
            coincident = [i for d in neighbors for i in cells.get(tuple(cell+d), [])
                          if np.linalg.norm(positions[i]-point) <= JOIN_TOL]
            if coincident:
                idx = coincident[0]
            else:
                idx = len(positions)
                positions.append(point)
                cells.setdefault(tuple(cell), []).append(idx)
            ids.append(idx)
            # The window surround is already planar and defines the trim interface.
            if panel['region']=='Hoof' or panel.get('dj_booth'):
                fixed.add(idx)
        indices[pid] = np.asarray(ids)
    return np.asarray(positions), indices, fixed


def junctions(positions, indices):
    """A corner landing midway along its neighbor must follow that edge's motion."""
    constraints = []
    edges = {tuple(sorted((a,b))) for ids in indices.values()
             for a,b in zip(ids,np.roll(ids,-1))}
    for a,b in sorted(edges):
        edge = positions[b]-positions[a]
        t = (positions-positions[a])@edge / (edge@edge)
        distance = np.linalg.norm(positions-positions[a]-t[:,None]*edge,axis=1)
        for i in np.flatnonzero((t>1e-6)&(t<1-1e-6)&(distance<=JOIN_TOL)):
            constraints.append((i,a,b,t[i]))
    return constraints


def fit_flat_panels(parts):
    """Minimum-motion Newton updates of coplanarity, coincident seams and T-joints.

    A free plane has three parameters. Project its point residuals onto the
    complement of translation and the two tilt directions before solving.
    Orbital and service cutouts instead fix a panel's plane directly.
    """
    positions, indices, fixed = corners(parts)
    free = sorted(set(range(len(positions)))-fixed)
    k = {i:j for j,i in enumerate(free)}
    delta = np.zeros_like(positions)
    seams = junctions(positions, indices)
    holes = {pid:plane(np.vstack(panel['holes_m'])) for pid,panel in parts.items() if panel['holes_m']}
    for iteration in range(32):
        rows, residual = [], []
        for pid,panel in parts.items():
            if panel.get('folds_m') or panel.get('formed_angle_deg',0) > 0:
                raise ValueError(f'{pid} still spans a formed crease')
            ids = indices[pid]
            if len(ids)==3 and pid not in holes:
                continue
            xyz = np.asarray(panel['vertices_m'])+delta[ids]
            if pid in holes:
                origin, normal = holes[pid]
                coefficients = np.eye(len(ids))
            else:
                origin = xyz.mean(axis=0)
                # With centered data, leading two directions span this sheet.
                _,_,basis = np.linalg.svd(xyz-origin,full_matrices=False)
                normal = basis[-1]
                chart = np.column_stack([np.ones(len(xyz)),(xyz-origin)@basis[:2].T])
                coefficients = np.linalg.qr(chart,mode='complete')[0][:,3:].T
            errors = coefficients @ ((xyz-origin)@normal)
            for coeff, error in zip(coefficients,errors):
                row = np.zeros((len(free),3))
                for j,i in enumerate(ids):
                    if i in k:
                        row[k[i]] += coeff[j]*normal
                rows.append(row.ravel())
                residual.append(error)
        updated=positions+delta
        for i,a,b,t0 in seams:
            # A T-junction must stay on the adjacent edge, but its location
            # along that line can slide when either neighboring sheet is fitted.
            initial=positions[i]-(1-t0)*positions[a]-t0*positions[b]
            along=updated[b]-updated[a]
            along/=np.linalg.norm(along)
            reference=np.eye(3)[np.argmin(np.abs(along))]
            n1=np.cross(along,reference); n1/=np.linalg.norm(n1)
            n2=np.cross(along,n1)
            t,_=segment_fraction(updated[i]-initial,updated[a],updated[b])
            d=updated[i]-initial-(1-t)*updated[a]-t*updated[b]
            for perpendicular in (n1,n2):
                row=np.zeros((len(free),3))
                for j,coefficient in ((i,1.),(a,t-1.),(b,-t)):
                    if j in k:
                        row[k[j]]+=coefficient*perpendicular
                rows.append(row.ravel())
                residual.append(d@perpendicular)
        if iteration>=10 and max(np.abs(residual),default=0.) <= MODEL_TOL/4:
            break
        equations = np.asarray(rows)
        # Find the lowest-displacement total fit in the free vertices.
        # Near-parallel constraints are rank deficient.
        target=equations@delta[free].ravel()-np.asarray(residual)
        solution=np.linalg.lstsq(equations,target,rcond=1e-6)[0]
        delta[free]=.5*(delta[free]+solution.reshape((-1,3)))
    else:
        raise ValueError(f'Could not preserve panel planes and shared seams ({max(np.abs(residual))*1000:.6f} mm)')
    updated=positions+delta
    for i,a,b,t0 in seams:
        initial=positions[i]-(1-t0)*positions[a]-t0*positions[b]
        t,gap=segment_fraction(updated[i]-initial,updated[a],updated[b])
        if gap>MODEL_TOL or not 0<t<1:
            raise ValueError('Planarizing introduced a gap at a T-junction')
    fitted={}
    for pid,panel in parts.items():
        original=np.asarray(panel['vertices_m'])
        motion=delta[indices[pid]]
        xyz=original+motion
        _,normal=holes[pid] if pid in holes else plane(xyz)
        fitted[pid]=dict(vertices_m=points(xyz) if np.any(motion) else panel['vertices_m'],
                         plane_normal=np.round(normal,12).tolist())
    apply_fit(parts,fitted)
    return fitted


def apply_fit(parts, fitted):
    """Check the physical constraints independently of the numerical solver."""
    if set(fitted)!=set(parts):
        raise ValueError('Stored fit does not match the installed panel IDs')
    original,indices,fixed=corners(parts)
    changes={}
    for pid,panel in parts.items():
        source=np.asarray(panel['vertices_m'])
        target=np.asarray(fitted[pid]['vertices_m'])
        if target.shape!=source.shape or not np.isfinite(target).all():
            raise ValueError(f'{pid} lacks an installed position for every corner')
        if panel['region']=='Hoof' and not np.array_equal(target,source):
            raise ValueError(f'{pid} changed an original hoof')
        for i,motion in zip(indices[pid],target-source):
            if i in fixed and np.linalg.norm(motion)>MODEL_TOL:
                raise ValueError(f'{pid} moved a fixed exterior point')
            if i in changes and np.linalg.norm(motion-changes[i])>MODEL_TOL:
                raise ValueError(f'{pid} opened a shared corner')
            changes[i]=motion
    updated=original+np.asarray([changes[i] for i in range(len(original))])
    for i,a,b,t0 in junctions(original,indices):
        initial=original[i]-(1-t0)*original[a]-t0*original[b]
        t,gap=segment_fraction(updated[i]-initial,updated[a],updated[b])
        if gap>MODEL_TOL or not 0<t<1:
            raise ValueError('Stored fit opened an edge junction')
    for pid,panel in parts.items():
        source=np.asarray(panel['vertices_m'])
        final=np.asarray(fitted[pid]['vertices_m'])
        normal=np.asarray(fitted[pid]['plane_normal'])
        if abs(np.linalg.norm(normal)-1.)>1e-9:
            raise ValueError(f'{pid} has an invalid stored plane')
        if panel.get('folds_m') or panel.get('formed_angle_deg',0)>0:
            raise ValueError(f'{pid} spans a formed crease')
        shift=np.linalg.norm(final-source,axis=1).max()
        origin=(np.vstack(panel['holes_m']) if panel['holes_m'] else final).mean(axis=0)
        prior_u,prior_v=np.asarray([panel['u_axis'],panel['v_axis']])
        if normal@np.cross(prior_u,prior_v)<0:
            normal=-normal
        u=prior_u-normal*(prior_u@normal)
        u/=np.linalg.norm(u)
        v=np.cross(normal,u)
        axes=np.stack((u,v))
        all_points=np.vstack([final,*panel['holes_m']])
        error=np.abs((all_points-origin)@normal).max()
        if error>MODEL_TOL:
            raise ValueError(f'{pid} misses its plane by {error*1000:.6f} mm')
        flat=(final-origin)@axes.T
        net_area=area(flat)-sum(area((np.asarray(h)-origin)@axes.T) for h in panel['holes_m'])
        facing=normal if normal@panel['normal']>=0 else -normal
        tilt=np.degrees(np.arccos(np.clip(abs(normal[2]),0.,1.)))
        panel.update(vertices_m=fitted[pid]['vertices_m'],origin_m=origin.tolist(),
                     u_axis=u.tolist(),v_axis=v.tolist(),tilt_from_horizontal_deg=value(tilt),
                     normal=points([facing])[0],flat_vertices_m=points(flat),
                     net_area_m2=value(net_area),vertex_average_m=points([final.mean(axis=0)])[0],
                     planarity_error_mm=value(error*1000),seam_fit_adjustment_mm=value(shift*1000))


def use_stored_fit(parts, path, refit=False):
    """Refit explicitly when seam geometry changes. Production reads surveyed design data."""
    inputs={pid:dict(outline=points(p['vertices_m']),holes=[points(h) for h in p['holes_m']],
                     hoof=p['region']=='Hoof',window=bool(p.get('dj_booth')))
            for pid,p in sorted(parts.items())}
    geometry=json.dumps(inputs,sort_keys=True,separators=(',',':')).encode()
    digest=hashlib.sha256(geometry).hexdigest()
    if refit:
        fitted=fit_flat_panels(parts)
        path.write_text(json.dumps(dict(geometry_sha256=digest,panels=fitted),
                                   sort_keys=True,separators=(',',':'))+'\n')
    else:
        record=json.loads(path.read_text())
        if record['geometry_sha256']!=digest:
            raise ValueError('Seam input changed. Refit the surface with build-dj-register.py --refit')
        apply_fit(parts,record['panels'])
