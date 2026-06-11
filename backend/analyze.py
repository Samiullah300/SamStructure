import json
import openseespy.opensees as ops
import sys
import os

def main():
    print("Starting SamStruture FEA Engine (OpenSeesPy)...")

    # 1. Load the building data from JSON
    input_file = "building.json"
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found.")
        sys.exit(1)

    with open(input_file, 'r') as f:
        building_data = json.load(f)

    print(f"Loaded building data: {building_data.get('name', 'Unknown')}")

    nodes   = building_data.get('nodes',   [])
    beams   = building_data.get('beams',   [])
    columns = building_data.get('columns', [])

    # 2. Initialize OpenSees Model (3-D, 6 DOF per node)
    ops.wipe()
    ops.model('basic', '-ndm', 3, '-ndf', 6)

    # ------------------------------------------------------------------ #
    # 3a. Build model from JSON data (if nodes are provided)              #
    # ------------------------------------------------------------------ #
    if nodes:
        print(f"  → {len(nodes)} nodes, {len(beams)} beams, {len(columns)} columns found in JSON.")

        # Define nodes
        for n in nodes:
            ops.node(n['id'], float(n['x']), float(n['y']), float(n['z']))
            fix = n.get('fixed', [0, 0, 0, 0, 0, 0])
            if any(fix):
                ops.fix(n['id'], *[int(v) for v in fix])

        # Default elastic section: E=200 GPa, A=0.01 m², I=8.33e-6 m⁴
        E, A, Iz, Iy, G, J = 200_000_000, 0.01, 8.33e-6, 8.33e-6, 77_000_000, 1.66e-5
        ops.geomTransf('Linear', 1, 0, 1, 0)   # local y-axis = global Y

        ele_id = 1
        for b in beams + columns:
            ops.element('ElasticBeamColumn', ele_id,
                        b['iNode'], b['jNode'],
                        A, E, G, J, Iy, Iz, 1)
            ele_id += 1

        # Apply a small gravity load to the first free (non-fixed) node
        free_nodes = [n['id'] for n in nodes if not any(n.get('fixed', []))]
        if free_nodes:
            ops.timeSeries('Linear', 1)
            ops.pattern('Plain', 1, 1)
            ops.load(free_nodes[0], 0.0, -10.0, 0.0, 0.0, 0.0, 0.0)

    # ------------------------------------------------------------------ #
    # 3b. Fallback: minimal valid structure when JSON has no geometry     #
    # ------------------------------------------------------------------ #
    else:
        print("  → No nodes in JSON — using minimal fallback structure.")
        ops.node(1, 0.0, 0.0, 0.0)
        ops.node(2, 0.0, 3.0, 0.0)
        ops.node(3, 5.0, 3.0, 0.0)

        ops.fix(1, 1, 1, 1, 1, 1, 1)

        E, A, Iz, Iy, G, J = 200_000_000, 0.01, 8.33e-6, 8.33e-6, 77_000_000, 1.66e-5
        ops.geomTransf('Linear', 1, 0, 0, 1)
        ops.element('ElasticBeamColumn', 1, 1, 2, A, E, G, J, Iy, Iz, 1)
        ops.element('ElasticBeamColumn', 2, 2, 3, A, E, G, J, Iy, Iz, 1)

        ops.timeSeries('Linear', 1)
        ops.pattern('Plain', 1, 1)
        ops.load(3, 0.0, -10.0, 0.0, 0.0, 0.0, 0.0)

    # 4. Analysis settings
    ops.system('BandGeneral')
    ops.numberer('RCM')
    ops.constraints('Transformation')
    ops.integrator('LoadControl', 1.0)
    ops.algorithm('Linear')
    ops.analysis('Static')

    # 5. Run analysis
    print("Running Static Analysis...")
    status = "success"
    try:
        result = ops.analyze(1)
        if result != 0:
            print("WARNING: Analysis did not converge.")
            status = "warning: did not converge"
    except Exception as e:
        print(f"ERROR during analysis: {e}")
        status = f"error: {str(e)}"

    # 6. Extract displacements for all nodes
    displacements = {}
    try:
        all_node_ids = ops.getNodeTags()
        for nid in all_node_ids:
            d = ops.nodeDisp(nid)
            displacements[str(nid)] = {
                'ux': d[0], 'uy': d[1], 'uz': d[2],
                'rx': d[3], 'ry': d[4], 'rz': d[5]
            }
    except Exception as e:
        print(f"Could not extract displacements: {e}")

    # 7. Save results — always write this file so the workflow doesn't fail
    results = {
        "status": status,
        "building": building_data.get('name', 'Unknown'),
        "displacements": displacements,
        "forces": {}
    }

    output_file = "results.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=4)

    print(f"Analysis complete. Results saved to {output_file}")

if __name__ == "__main__":
    main()
