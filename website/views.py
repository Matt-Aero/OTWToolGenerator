from flask import (
    Flask, request, redirect, flash, render_template,
    send_from_directory, session, url_for, jsonify,
    send_file, Blueprint
)
import os
import tempfile
import zipfile
import cadquery as cq
from cadquery import exporters, importers
from CADQuery_flask import (
    Joint, flaredJoint, flangeJoint,
    midspanJoint, holeJoint, generateSupports
)
from flask import current_app as app
from .payment import updateSubscriptionStatus
import numpy as np
from OCP.BRepAdaptor import BRepAdaptor_Curve

views = Blueprint('views', __name__)

ALLOWED_EXTENSIONS = {'step'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@views.route('/upload', methods=['GET', 'POST'])
def upload_file():
    """Uploads a STEP file, converts to STL, returns a secure URL to download STL and the circular edge data."""
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file part')
            return redirect(request.url)

        f = request.files['file']
        if f.filename == '':
            flash('No selected file')
            return redirect(request.url)

        if f and allowed_file(f.filename):
            filename = f.filename
            step_path = os.path.join(tempfile.gettempdir(), filename)
            f.save(step_path)

            try:
                # Call your function to find circular edges and convert the NumPy array to a list
                circular_edges = find_circular_edges_in_step(step_path)
                circular_edges_list = circular_edges.tolist()

                # Convert STEP -> STL
                result = cq.importers.importStep(step_path)
                stl_filename = os.path.splitext(filename)[0] + ".stl"
                stl_path = os.path.join(tempfile.gettempdir(), stl_filename)
                cq.exporters.export(result, stl_path)
                os.remove(step_path)  # Remove original STEP file

                stl_download_url = url_for('views.download_stl', filename=stl_filename)
                return jsonify({
                    "message": "File uploaded/converted successfully",
                    "stl_path": stl_download_url,
                    "edges": circular_edges_list
                }), 200
            except Exception as e:
                return jsonify({"error": str(e)}), 500

    return jsonify({"error": "Invalid request"}), 400

def find_circular_edges_in_step(filepath):
    # Finds Circular Edges in the Uploaded STEP File, and Returns them as a vector.
    # Import the STEP file and display the model
    model = cq.importers.importStep(filepath)
    centers_and_vectors = []
    # Iterate through all edges in the model
    for i, edge in enumerate(model.val().Edges()):
        curve = BRepAdaptor_Curve(edge.wrapped)
        if curve.GetType() == 1:  # Check if the edge is circular
            circle = curve.Circle()   # Get the circle geometry
            center = circle.Location()  # Center of the circle (gp_Pnt)
            axis = circle.Axis()        # The axis of the circle (gp_Ax1)
            direction = axis.Direction()# The direction of the axis (gp_Dir)
            radius = circle.Radius()    # Get the circle's radius
            # Save center coordinates, axis direction, and the radius
            centers_and_vectors.append([
                center.X(), center.Y(), center.Z(),
                direction.X(), direction.Y(), direction.Z(),
                radius
            ])
    return np.array(centers_and_vectors)




@views.route('/download-stl/<filename>', methods=['GET'])
def download_stl(filename):
    """Serves the STL file from the system temp directory."""
    temp_dir = tempfile.gettempdir()
    try:
        return send_from_directory(
            directory=temp_dir,
            path=filename,
            mimetype='application/sla'
        )
    except FileNotFoundError:
        return jsonify({"error": "File not found"}), 404

@views.route('/account_status')
def account_status():
    if 'user_id' not in session:
        return redirect(url_for('views.main'))
    updateSubscriptionStatus()
    return render_template('accountStatus.html')

def delete_files():
    user_folder = session.get('user_folder')
    if user_folder:
        for root, dirs, files in os.walk(user_folder):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    if os.path.isfile(file_path):
                        os.unlink(file_path)
                except Exception as e:
                    print(f"Error deleting file {file_path}: {e}")

@views.route('/help')
def help():
    return render_template('help.html')

@views.route('/')
def main():
    """Main landing page."""
    if 'user_folder' not in session:
        session['user_folder'] = tempfile.mkdtemp()
    delete_files()  # Clean out old files
    return render_template('index.html')

@views.route("/terms-of-service")
def terms_of_service():
    return render_template("terms-of-service.html")

@views.route("/privacy")
def privacy():
    return render_template("privacy.html")

@views.route('/design')
def design():
    """Page that shows the Three.js viewer and input forms."""
    if 'user' not in session:
        return redirect(url_for('auth.login'))
    updateSubscriptionStatus()
    return render_template('design.html')

@views.route('/download')
def download():
    """Simple page to confirm user can download."""
    if 'user' not in session:
        return redirect(url_for('auth.login'))
    updateSubscriptionStatus()
    return render_template('download.html')

@views.route('/process_joints', methods=['POST'])
def process_joints():
    """Handles joint form data, generates 3D tooling, returns generated filenames."""
    user_folder = session.get('user_folder')
    delete_files()

    joint_count = int(request.form.get('jointCount', 0))
    joint_data = []

    def sanitize_input(val):
        if val:
            return val.replace('−', '-')
        return val

    # Collect user input
    for i in range(1, joint_count + 1):
        jtype = request.form.get(f'jointType{i}')
        x = sanitize_input(request.form.get(f'xInput{i}'))
        y = sanitize_input(request.form.get(f'yInput{i}'))
        z = sanitize_input(request.form.get(f'zInput{i}'))
        nx = sanitize_input(request.form.get(f'nxInput{i}'))
        ny = sanitize_input(request.form.get(f'nyInput{i}'))
        nz = sanitize_input(request.form.get(f'nzInput{i}'))
        supportWidth = float(sanitize_input(request.form.get(f'supportWidthSlider{i}')))


        if not (jtype and x and y and z and nx and ny and nz):
            return jsonify({'error': 'Incomplete joint data'}), 400

        loc = [float(x), float(y), float(z)]
        norm = [float(nx), float(ny), float(nz)]

        # Additional fields by type
        if jtype == 'Flanged':
            bc_dia = sanitize_input(request.form.get(f'boltCircleDiameter{i}'))
            bh_dia = sanitize_input(request.form.get(f'boltHoleDiameter{i}'))
            num_bolts = sanitize_input(request.form.get(f'numberOfBolts{i}'))
            clock_off = sanitize_input(request.form.get(f'clockingOffset{i}'))
            if not all([bc_dia, bh_dia, num_bolts, clock_off]):
                return jsonify({'error': 'Incomplete flanged joint data'}), 400
            joint_data.append({
                'location': loc,
                'normal_vector': norm,
                'supportWidth': supportWidth, # This is a multiplier for the width of the side supports of each joint
                'joint_type': jtype,
                'bolt_circle_diameter': float(bc_dia),
                'bolt_hole_diameter': float(bh_dia),
                'num_bolts': int(num_bolts),
                'clocking_offset': float(clock_off)
            })
        elif jtype == 'midspan':
            diameter = sanitize_input(request.form.get(f'diameter{i}'))
            offset = sanitize_input(request.form.get(f'offset{i}'))
            if not (diameter and offset):
                return jsonify({'error': 'Incomplete midspan joint data'}), 400
            joint_data.append({
                'location': loc,
                'normal_vector': norm,
                'supportWidth': supportWidth, # This is a multiplier for the width of the side supports of each joint
                'joint_type': jtype,
                'diameter': float(diameter),
                'offset': float(offset)
            })
        elif jtype == 'hole':
            diameter = sanitize_input(request.form.get(f'diameter{i}'))
            if not diameter:
                return jsonify({'error': 'Incomplete hole joint data'}), 400
            joint_data.append({
                'location': loc,
                'normal_vector': norm,
                'supportWidth': supportWidth, # This is a multiplier for the width of the side supports of each joint
                'joint_type': jtype,
                'diameter': float(diameter),
            })
        elif jtype == 'weldHead':
            # Weld head just for visualization; do nothing
            continue
        else:
            # e.g. "1/4", "1/2", "1"
            joint_data.append({
                'location': loc,
                'normal_vector': norm,
                'supportWidth': supportWidth, # This is a multiplier for the width of the side supports of each joint
                'joint_type': jtype
            })

    tolerance = float(sanitize_input(request.form.get("toleranceValue", "0")) or 0)
    plate_thk = float(sanitize_input(request.form.get("thicknessValue", "3")) or 3)

    # Build geometry
    joints = []
    for jd in joint_data:
        t = jd['joint_type']
        if t == 'Flanged':
            joints.append(flangeJoint(
                jd['location'], jd['normal_vector'], jd['supportWidth'],
                jd['bolt_circle_diameter'], jd['num_bolts'],
                jd['bolt_hole_diameter'], jd['clocking_offset']
            ))
        elif t == 'midspan':
            joints.append(midspanJoint(
                jd['location'], jd['normal_vector'], jd['supportWidth'],
                jd['diameter'], jd['offset']
            ))
        elif t == 'hole':
            joints.append(holeJoint(
                jd['location'], jd['normal_vector'], jd['supportWidth'],
                jd['diameter']
            ))
        else:
            # flared
            joints.append(flaredJoint(
                jd['location'], jd['normal_vector'], jd['supportWidth'],
                jd['joint_type']
            ))

    generated = generateSupports(joints, user_folder, tolerance, plate_thk)
    filenames = [os.path.basename(f) for f in generated]
    return jsonify({'generated_files': filenames})

@views.route('/generated/<filename>')
def serve_generated_file(filename):
    """Serves generated output files from user_folder."""
    user_folder = session.get('user_folder')
    return send_from_directory(user_folder, filename)

@views.route('/download_zip')
def download_zip():
    """Zips up all .step files in the user_folder."""
    user_folder = session.get('user_folder')
    zip_path = os.path.join(user_folder, 'generated_files.zip')
    with zipfile.ZipFile(zip_path, 'w') as zf:
        for root, dirs, files in os.walk(user_folder):
            for file in files:
                if file.endswith('.step') and 'generated_files.zip' not in file:
                    zf.write(os.path.join(root, file), file)
    return send_file(zip_path, as_attachment=True, download_name='generated_files.zip')
