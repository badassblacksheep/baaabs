"""Compute revision 07 static compliance using the archived revision 06 frame element.

From repository root: python3 tools/study-modular07.py   (requires NumPy and Node.js)
Use --check to compare the published results with a fresh solve.
"""
import argparse
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import numpy as np

SITE = Path(__file__).resolve().parents[1] / "site"
STUDY = SITE / "structural/modular-07"
ARCHIVE = SITE / "assets/downloads/structural/iteration-06-source.zip"


def read(path):
    return json.loads(path.read_text())


def profile(members, name):
    return next(member for member in members if member["name"] == name)


def cross_section(solver, member):
    return solver.section(member["width"], member["depth"], member["wall"])


def viewer_geometry(frame, primary):
    """Read the viewer's demountable pieces and reduce paired seam uprights for stiffness."""
    export = """
        import {readFileSync} from 'node:fs';
        import {primaryGeometry} from './backbone.mjs';
        const {frame, primary} = JSON.parse(readFileSync(0,'utf8'));
        const {pieces, seams, pitch} = primaryGeometry(frame, primary);
        const members = pieces.flatMap(p => p.members).filter(m => !m.duplicateSeamUpright);
        process.stdout.write(JSON.stringify({members, seams, pitch}));
    """
    result = subprocess.run(["node", "--input-type=module", "-e", export], cwd=STUDY,
                            input=json.dumps(dict(frame=frame, primary=primary)),
                            text=True, check=True, stdout=subprocess.PIPE)
    return json.loads(result.stdout)


def build_mesh(solver, members, shores, seams, probes):
    """Keep coincident bay-end chord nodes distinct across a configurable splice plane."""
    points, elements, seats, _, _ = solver.idealize(
        members, True, "ends_only", 1, list(shores) + probes)
    nodes = list(points)
    pairs = {}
    links = []
    for a, b, member in elements:
        ends = [a, b]
        center_x = (points[a, 0] + points[b, 0]) / 2
        for j, idx in enumerate(ends):
            x = points[idx, 0]
            if np.any(np.isclose(x, seams, atol=2e-6, rtol=0)) and center_x > x + 2e-6:
                if idx not in pairs:
                    pairs[idx] = len(nodes)
                    nodes.append(points[idx].copy())
                ends[j] = pairs[idx]
        links.append((*ends, member))
    if len(pairs) != 4 * len(seams):
        raise ValueError("Each seam must have exactly four chord interfaces")
    nodes = np.array(nodes)
    matrix = np.zeros((6 * len(nodes), 6 * len(nodes)))
    for a, b, member in links:
        _, _, transform, stiffness = solver.beam(nodes[a], nodes[b], np.array(member["axis_y"]),
                                                cross_section(solver, member))
        dofs = np.r_[a*6:a*6+6, b*6:b*6+6]
        matrix[np.ix_(dofs, dofs)] += transform.T @ stiffness @ transform
    return nodes, matrix, seats, pairs, links


def crowd_forces(solver, frame, nodes, links, patch, inputs, F):
    """Map uniform pressure to idealized simply supported transverse carriers and continuous upper rails."""
    lo, hi = patch
    width = frame["deckWidthIn"] * .0254
    half_span = abs(profile(frame["members"], "Deck edge girder")["a"][1])
    load_cases = []
    target = inputs["people"] * inputs["personLbf"]
    for distribution, centroid in [("centered-full", 0), ("centered-driver-half", -width/4)]:
        driver_share = (1 - centroid/half_span)/2
        for multiplier in (1, inputs["liveMultiplier"]):
            load_cases.append({
                "distribution": distribution, "multiplier": multiplier,
                "people": inputs["people"], "personLbf": inputs["personLbf"],
                "patchLengthFt": round((hi-lo)/.3048, 5), "appliedLbf": target * multiplier,
                "driverRailFraction": driver_share
            })
    forces = np.zeros((len(F), len(load_cases)))
    intensities = {}
    for a, b, member in links:
        if not member.get("crowdRail"):
            continue
        x = (nodes[a, 0] + nodes[b, 0])/2
        if not lo < x < hi:
            continue
        if np.min(nodes[[a, b], 0]) < lo - 3e-6 or np.max(nodes[[a, b], 0]) > hi + 3e-6:
            raise ValueError("Element straddles the edge of a crowd patch")
        L, axis, transform, _ = solver.beam(nodes[a], nodes[b], np.array(member["axis_y"]),
                                            cross_section(solver, member))
        densities = []
        for j, case in enumerate(load_cases):
            fraction = case["driverRailFraction"]
            if nodes[a, 1] > 0:
                fraction = 1 - fraction
            density = case["appliedLbf"] * solver.LBF * fraction / (hi - lo)
            local_force = solver.distributed(axis @ [0, 0, -density], L)
            dofs = np.r_[a*6:a*6+6, b*6:b*6+6]
            forces[dofs, j] += transform.T @ local_force
            densities.append(density)
        intensities[a, b] = np.array(densities)
    actual = -forces[2::6].sum(axis=0)/solver.LBF
    if not np.allclose(actual, [case["appliedLbf"] for case in load_cases], rtol=2e-6):
        raise ValueError("Crowd patch loads do not close")
    for j, case in enumerate(load_cases):
        centroid = 0 if case["distribution"] == "centered-full" else -width/4
        rail_torque = nodes[:, 1] @ forces[2::6, j]
        target_torque = -centroid * case["appliedLbf"] * solver.LBF
        if not np.isclose(rail_torque, target_torque, rtol=2e-6, atol=1e-4):
            raise ValueError("Incorrect crowd center of pressure")
        case["driverRailFraction"] = round(case["driverRailFraction"], 6)
    return load_cases, intensities, np.column_stack((F, forces))


def roof_drop(solver, nodes, links, top, U, intensities):
    """Sample deformed roof-plane primary members, including their distributed-load particular solution."""
    u = np.linspace(0, 1, 33)[:, None]
    min_z = np.zeros(U.shape[1])
    for a, b, member in links:
        if max(abs(nodes[[a, b], 2] - top)) > 3e-6:
            continue
        delta = nodes[b]-nodes[a]
        L = np.linalg.norm(delta)
        axis = delta / L
        i, j = a*6, b*6
        sa = U[i+3] * axis[1] - U[i+4] * axis[0]
        sb = U[j+3] * axis[1] - U[j+4] * axis[0]
        disp = ((1 - 3*u**2 + 2*u**3)*U[i+2] + (3*u**2 - 2*u**3)*U[j+2] +
                L*((u - 2*u**2 + u**3)*sa + (u**3 - u**2)*sb))
        if (a, b) in intensities:
            _, iy, _, _ = cross_section(solver, member)
            disp -= intensities[a, b] * (L*u)**2 * (L*(1-u))**2 / (24*solver.E*iy)
        min_z = np.minimum(min_z, disp.min(axis=0))
    return -min_z


def compliance(solver, bearings, frame, model, settings, k_shore, modular=None, factor=None, crowd=None):
    members = frame["members"]
    seams = []
    if modular:
        members = modular["members"]
        if factor is not None:
            seams = modular["seams"]
    upper = profile(frame["members"], "Deck edge girder")
    lower = profile(frame["members"], "Truss lower chord driver")
    x0, x1 = upper["a"][0], upper["b"][0]
    y, z = abs(upper["a"][1]), upper["a"][2]
    probes = [[(x0 + x1)/2, side, z] for side in (-y, y)]
    shores = frame["shorePositions"]
    patch_probes = []
    if crowd:
        patch_half = settings["crowdPatchFt"]*.3048/2
        patch = ((x0+x1)/2 - patch_half, (x0+x1)/2 + patch_half)
        if patch[0] < x0 or patch[1] > x1 or patch_half <= 0:
            raise ValueError("Crowd patch must lie within the deck")
        patch_probes = [[x, side, z] for x in patch for side in (-y, y)]
    nodes, K, seats, interfaces, links = build_mesh(solver, members, shores, seams, probes + patch_probes)
    force, torque = settings["testForceN"], settings["testTorqueNm"]
    F = np.zeros((len(K), 3))
    probe_sets = []
    for i, point in enumerate(probes):
        ids = np.flatnonzero(np.linalg.norm(nodes - point, axis=1) < 3e-6)
        if not len(ids):
            raise ValueError("Missing central load application point")
        dofs = ids*6 + 2
        probe_sets.append(dofs)
        # When the probe lies directly on a split seam its load is shared by the two faces.
        F[dofs] = np.array([-force / 2, (-1 if i == 0 else 1) * torque / (2*y),
                            -force if i == 0 else 0]) / len(dofs)
    if crowd:
        crowd_rows, q, F = crowd_forces(solver, frame, nodes, links, patch, crowd, F)
    for left, right in interfaces.items():
        sec = upper if abs(nodes[left, 2] - z) < 2e-6 else lower
        area, iy, iz, j = cross_section(solver, sec)
        L = modular["pitch"]
        stiffness = factor * np.array([solver.E*area/L, 12*solver.E*iz/L**3, 12*solver.E*iy/L**3,
                                      solver.G*j/L, solver.E*iy/L, solver.E*iz/L])
        ld = np.arange(left*6, left*6+6)
        rd = np.arange(right*6, right*6+6)
        K[ld, ld] += stiffness
        K[rd, rd] += stiffness
        K[ld, rd] -= stiffness
        K[rd, ld] -= stiffness
    if len(seats) != 4 or any("sill seat" not in name for _, name in seats):
        raise ValueError("Only the four inherited rail seats can restrain the frame")
    fixed = np.array([6*i + d for i, _ in seats for d in range(6)])
    free = np.setdiff1d(np.arange(len(K)), fixed)
    k = K[np.ix_(free, free)]
    loads = F[free]
    shore_nodes = [np.argmin(np.linalg.norm(nodes - p, axis=1)) for p in shores]
    if not np.allclose(nodes[shore_nodes], shores, atol=2e-6, rtol=0):
        raise ValueError("Missing a surveyed-frame shore coordinate")
    shore_dofs = np.array(shore_nodes) * 6 + 2
    U = np.zeros_like(F)
    if k_shore:
        bearing_dofs = np.searchsorted(free, shore_dofs)
        if not np.array_equal(free[bearing_dofs], shore_dofs):
            raise ValueError("Shore spring shares a fixed support DOF")
        U[free] = bearings.compression_bearings(k, loads, bearing_dofs, k_shore)
    else:
        U[free] = np.linalg.solve(k, loads)
    bearing_force = np.maximum(0, -U[shore_dofs]) * k_shore
    residual = K @ U - F
    residual[shore_dofs] -= bearing_force
    if np.max(abs(residual[free])) > 1.e-4:
        raise ValueError(f"Unbalanced unknowns in {model} at joint factor {factor}: {np.max(abs(residual[free])):g}")
    external = F.copy()
    external[fixed] += residual[fixed]
    external[shore_dofs] += bearing_force
    external = external.reshape(len(nodes), 6, F.shape[1])
    for i in range(external.shape[2]):
        f = external[:, :3, i]
        if max(np.linalg.norm(f.sum(axis=0)),
               np.linalg.norm(np.sum(np.cross(nodes, f) + external[:, 3:, i], axis=0))) > 1.e-4:
            raise ValueError("Global force and moment balance failed")
    driver, passenger = [U[ids].mean(axis=0) for ids in probe_sets]
    travel = -(driver[0] + passenger[0])/2
    twist = (passenger[1] - driver[1])/(2*y)
    if travel <= 0 or twist <= 0:
        raise ValueError("Non-positive generalized compliance")
    slip = [np.linalg.norm(U[6*i:6*i+3, :3] - U[6*j:6*j+3, :3], axis=0)
            for i, j in interfaces.items()]
    result = {
        "model": model, "jointFactor": factor,
        "shoreKLbfPerIn": round(k_shore * 0.0254 / solver.LBF, 3),
        "dropMm": round(travel*1000, 5), "twistMrad": round(twist*1000, 5),
        "verticalKNPerM": round(force/travel/1000, 2), "torsionalKNmPerRad": round(torque/twist/1000, 2),
        "driverLoadDropMm": round(-driver[2]*1000, 5),
        "driverLoadTwistMrad": round((passenger[2]-driver[2])/(2*y)*1000, 5),
        "maxSeamTravelMm": round(float(np.max(slip))*1000, 5) if slip else 0,
        "engagedShores": [int(n) for n in (bearing_force[:, :3] > 1.e-4).sum(axis=0)],
    }
    if crowd:
        crowd_U = U[:, 3:]
        for j in (0, 2):
            if not np.allclose(crowd_U[:, j+1], crowd_U[:, j]*crowd["liveMultiplier"],
                               atol=2e-8, rtol=1e-6):
                raise ValueError("Proportional zero-preload crowd response failed")
        drops = roof_drop(solver, nodes, links, z, crowd_U, q)
        seat_z = [6*i + 2 for i, _ in seats]
        for j, case in enumerate(crowd_rows):
            case.update(peakVerticalDropMm=round(drops[j]*1000, 3),
                        peakShoreLbf=round(bearing_force[:, j+3].max()/solver.LBF, 2),
                        peakSeatLbf=round(residual[seat_z, j+3].max()/solver.LBF, 2),
                        engagedShores=int((bearing_force[:, j+3] > 1.e-4).sum()),
                        jointFactor=factor, shoreKLbfPerIn=result["shoreKLbfPerIn"])
        result["crowdCases"] = crowd_rows
    return result


def study(solver, bearings, design):
    paths = design["inputs"]
    survey = read(STUDY / paths["recipe"])
    archive = read(SITE / "assets/structural-models-06.json")
    history = next(f for f in archive["variants"] if f["id"] == archive["selected"])
    frame, inputs = survey["candidate"], survey["loadInputs"]
    k = inputs["shoreK_LbfPerIn"]*solver.LBF/.0254
    settings = design["stiffnessStudy"]
    factors = settings["jointFactors"]
    if not factors or min(factors) <= 0 or not np.isfinite(factors).all():
        raise ValueError("Spring multipliers must be finite and positive")
    modular = viewer_geometry(frame, design["primary"])
    solver.check_element()
    bearings.check_bearings()
    baseline = compliance(solver, bearings, history, "06-archive", settings, k)
    fit = compliance(solver, bearings, frame, "06-survey", settings, k)
    cases = [baseline, fit]
    crowd_cases = []
    for shore in [k, 0]:
        rows = [compliance(solver, bearings, frame, "07", settings, shore, modular, factor,
                           inputs if factor == settings["crowdJointFactor"] and shore == k else None)
                for factor in [None, *sorted(factors, reverse=True)]]
        for stiffer, softer in zip(rows, rows[1:]):
            if any(softer[q] < stiffer[q] for q in ("dropMm", "twistMrad")):
                raise ValueError("Decreasing splice stiffness reduced compliance")
        for row in rows:
            crowd_cases.extend(row.pop("crowdCases", []))
        cases.extend(rows)
    if not crowd_cases:
        raise ValueError("crowdJointFactor must be in the elastic splice sweep")
    archived = read(STUDY / paths["archived"])["selected"]
    surveyed = next(case for case in read(STUDY / paths["surveyResults"])["cases"] if case["label"] == "baseline")
    references = [
        dict(model="06-archive", stressMPa=archived["stress"], dropIn=archived["drop"]),
        dict(model="06-survey", stressMPa=surveyed["stressMPa"], dropIn=surveyed["deckDropIn"])
    ]
    return {
        "method": "3D elastic frame, original screen04 element and HSS catalog. Centered downward force, pure roll couple and driver-edge downward force, each applied separately at the upper rail centerlines at deck midlength.",
        "testForceN": settings["testForceN"], "testTorqueNm": settings["testTorqueNm"],
        "coordinates": "x rearward, y toward passenger side, z up. Drop is the mean of the two rail displacements under the centered force. Twist is differential rail displacement divided by rail spacing under the pure couple.",
        "jointModel": "Null factor means a continuous welded reference. At each split seam four independent six-DOF spring groups join coincident upper and lower chord ends. One transverse frame is assigned to the preceding module. For chord properties A, Iy, Iz, J and bay length L, the diagonal spring terms are factor times [EA/L, 12EIz/L³, 12EIy/L³, GJ/L, EIy/L, EIz/L]. Maximum seam travel is the largest relative translation over all seams and all three probes.",
        "bounds": "Factors span assumed elastic interface stiffness only. Measure initial take-up separately from post-engagement slope in load, unload and reverse cycles. Differential longitudinal take-up between upper and lower chords gives approximate seam rotation (s_upper − s_lower)/truss depth. Free play, preload loss, hysteresis, fatigue and failure are outside the linear spring model. The no-body-credit branch retains fixed baseline portal sill seats. All results omit initial dead-load preload. Shores can lift off under the signed test couple. Effective roll stiffness includes differential side bending, support and warping effects and is specific to this probe.",
        "idealization": "Alternating side webs, one effective vertical and two transverse members at every bay boundary, local shore verticals and top plan X with end-only connections. Retains the inherited portal subassemblies and effective fixed rail seats. One effective upright per seam represents the pair of shop-welded truss end uprights and mating end planes shown in the assembly. Double-upright composite action and end-plate stiffness receive no credit. Single linear beam per node interval. Cassettes, center spine, plywood, panels and audio add no stiffness or weight in these unit-load comparisons. Within-bay connections are idealized as welded. The same end-only brace crossing convention is used for all compliance cases. The historical published load sweeps retain their original meshing convention. No member, connection, or foundation capacity calculation.",
        "publishedBasis": "Historical full-load sweeps from iteration-06-data.json and deck-results.json. These envelopes include dead load, skins, gear and amplified crowd loading and differ from the isolated compliance probes.",
        "crowdBasis": "Separate centered longitudinal crowd patches cover either the full deck width or its driver half. Simple transverse lever equilibrium maps the loaded strip centroid to upper-rail line loads. The distributed line loads include consistent nodal moments. Drop is the largest downward roof-plane primary-member displacement sampled at 33 locations per element. Peak shore and seat reactions are positive compression. These are incremental crowd-only results from an initially unloaded frame. Steel, panels, cassettes, gear, plywood, bus roll and local cassette flexure are excluded. Static-equivalent amplification is a sensitivity; synchronized dancing, resonance, impact, damping and fatigue remain unresolved.",
        "published": references, "cases": cases, "crowdCases": crowd_cases
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--design", type=Path, default=STUDY / "design.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp, zipfile.ZipFile(ARCHIVE) as original:
        for source in ("screen04.py", "bearing04.py", "hss-properties.json"):
            original.extract(source, temp)
        sys.path.insert(0, temp)
        import screen04
        import bearing04
        data = study(screen04, bearing04, read(args.design))
    target = STUDY / "stiffness.json"
    if args.check:
        if read(target) != data:
            raise SystemExit("Regenerate stiffness.json via tools/study-modular07.py")
    else:
        target.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")
