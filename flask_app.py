from flask import Flask, request, redirect, flash, render_template, send_from_directory, session, url_for, jsonify, send_file
import os
import tempfile
import zipfile
import shutil
from CADQuery import Joint, flaredJoint, flangeJoint, generateSupports

app = Flask(__name__)
app.secret_key = '5d536a3d438345fe076b77d8ff8e09405817b7cc462dcb466b592b75c2978ce7'
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()
app.config['GENERATED_FOLDER'] = tempfile.gettempdir()
app.config['MAX_CONTENT_LENGTH'] = 5 * 1000 * 1000 # max file size of 2mb
ALLOWED_EXTENSIONS = {'stl'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload', methods=['GET', 'POST'])
def upload_file():
    if request.method == 'POST':
        # check if the post request has the file part
        if 'file' not in request.files:
            flash('No file part')
            return redirect(request.url)
        file = request.files['file']
        # If the user does not select a file, the browser submits an
        # empty file without a filename.
        if file.filename == '':
            flash('No selected file')
            return redirect(request.url)
        if file and allowed_file(file.filename):
            filename = file.filename
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            return jsonify({"message": "File uploaded successfully"}), 200
    return

def deleteFiles():
    user_folder = session.get('user_folder')
    for root, dirs, files in os.walk(user_folder):
        for file in files:
            file_path = os.path.join(root, file)
            try:
                if os.path.isfile(file_path):
                    os.unlink(file_path)  # Delete the file
            except Exception as e:
                print(f"Error deleting file {file_path}: {e}")

@app.route('/help')
def help():
    return render_template('help.html')

@app.route('/')
def main():
    # Create temp. Dir for user files
    if 'user_folder' not in session:
        session['user_folder'] = tempfile.mkdtemp()
    deleteFiles() # Delete any previously stored files
    return render_template('index.html')

@app.route('/design')
def design():
    return render_template('design.html')

@app.route('/process_joints', methods=['POST'])
def process_joints():
    user_folder = session.get('user_folder')
    deleteFiles()  # Delete any previously stored files
    joint_data = []
    joint_count = int(request.form.get('jointCount')) # Adjust joint_count calculation, excluding tolerance and thickness inputs
    print("JOINT COUNT ***************************")
    print(joint_count)
    def sanitize_input(value):
        if value:
            return value.replace('−', '-')
        return value

    for i in range(1, joint_count + 1):
        joint_type = request.form.get(f'jointType{i}')
        location = [
            sanitize_input(request.form.get(f'xInput{i}')),
            sanitize_input(request.form.get(f'yInput{i}')),
            sanitize_input(request.form.get(f'zInput{i}'))
        ]
        normal_vector = [
            sanitize_input(request.form.get(f'nxInput{i}')),
            sanitize_input(request.form.get(f'nyInput{i}')),
            sanitize_input(request.form.get(f'nzInput{i}'))
        ]

        if joint_type == 'Flanged':
            bolt_circle_diameter = sanitize_input(request.form.get(f'boltCircleDiameter{i}'))
            bolt_hole_diameter = sanitize_input(request.form.get(f'boltHoleDiameter{i}'))
            num_bolts = sanitize_input(request.form.get(f'numberOfBolts{i}'))
            clocking_offset = sanitize_input(request.form.get(f'clockingOffset{i}'))
            if not all([bolt_circle_diameter, bolt_hole_diameter, num_bolts, clocking_offset]):
                flash('Incomplete flanged joint data')
                return jsonify({'error': 'Incomplete flanged joint data'})
            joint_data.append({
                'location': [float(loc) for loc in location],
                'normal_vector': [float(vec) for vec in normal_vector],
                'joint_type': joint_type,
                'bolt_circle_diameter': float(bolt_circle_diameter),
                'bolt_hole_diameter': float(bolt_hole_diameter),
                'num_bolts': int(num_bolts),  # Ensure num_bolts is an integer
                'clocking_offset': float(clocking_offset)
            })
        else:
            if not all([joint_type, *location, *normal_vector]):
                flash('Incomplete joint data')
                return jsonify({'error': 'Incomplete joint data'})
            joint_data.append({
                'location': [float(loc) for loc in location],
                'normal_vector': [float(vec) for vec in normal_vector],
                'joint_type': joint_type
            })

    session['joint_data'] = joint_data  # Store serializable data in the session
    joint_data = session.get('joint_data', [])

    # Reconstruct the joint objects from the session data
    joints = []
    for data in joint_data:
        if data['joint_type'] == 'Flanged':
            joints.append(flangeJoint(
                data['location'], data['normal_vector'], data['bolt_circle_diameter'],
                data['num_bolts'], data['bolt_hole_diameter'], data['clocking_offset']
            ))
        else:
            joints.append(flaredJoint(data['location'], data['normal_vector'], data['joint_type']))

    tolerance = float(sanitize_input(request.form.get("toleranceValue")))  # Get the tolerance value from the form
    plateThk = float(sanitize_input(request.form.get("thicknessValue")))  # Get the thickness value from the form
    generated_files = generateSupports(joints, user_folder, tolerance, plateThk)  # Call the function to generate the tooling files
    generated_files = [os.path.basename(f) for f in generated_files]  # Get only the filenames
    return jsonify({'generated_files': generated_files})



@app.route('/generated/<filename>')
def serve_generated_file(filename):
    user_folder = session.get('user_folder')
    return send_from_directory(user_folder, filename)

@app.route('/download_zip')
def download_zip():
    user_folder = session.get('user_folder')
    zip_path = os.path.join(user_folder, 'generated_files.zip')
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        for root, dirs, files in os.walk(user_folder):
            for file in files:
                if file.endswith('.step') and 'generated_files.zip' not in file:
                    zipf.write(os.path.join(root, file), file)
    return send_file(zip_path, as_attachment=True, download_name='generated_files.zip')

if __name__ == '__main__':
    app.run(debug=False)
