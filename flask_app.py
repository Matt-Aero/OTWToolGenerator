from flask import Flask, request, redirect, flash, render_template, send_from_directory, session, url_for, jsonify, send_file
import os
import tempfile
import zipfile
import shutil
from CADQuery import Joint, flaredJoint, generateSupports

app = Flask(__name__)
app.secret_key = '5d536a3d438345fe076b77d8ff8e09405817b7cc462dcb466b592b75c2978ce7'
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()
app.config['GENERATED_FOLDER'] = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'stl'}

def allowed_file(filename):  # Helper function to check file extension
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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

@app.route('/process_joints', methods=['POST'])
def process_joints():
    user_folder = session.get('user_folder')
    deleteFiles() # Delete any previously stored files
    joint_data = []
    joint_count = len(request.form) // 7  # Each joint has 7 inputs: 1 jointType, 3 location, 3 vector
    for i in range(1, joint_count + 1):
        joint_type = request.form.get(f'jointType{i}')
        location = [
            request.form.get(f'xInput{i}'),
            request.form.get(f'yInput{i}'),
            request.form.get(f'zInput{i}')
        ]
        normal_vector = [
            request.form.get(f'nxInput{i}'),
            request.form.get(f'nyInput{i}'),
            request.form.get(f'nzInput{i}')
        ]
        if not all([joint_type, *location, *normal_vector]):  # Check if all fields are present
            flash('Incomplete joint data')
            return jsonify({'Incomplete joint data'})
        location = [float(loc) for loc in location]
        normal_vector = [float(vec) for vec in normal_vector]
        flare_size = joint_type  # No need to change anything here since form options are fixed
        joint_data.append({
            'location': location,
            'normal_vector': normal_vector,
            'flare_size': flare_size
        })
    session['joint_data'] = joint_data  # Store serializable data in the session
    joint_data = session.get('joint_data', [])
    joints = [flaredJoint(data['location'], data['normal_vector'], data['flare_size']) for data in joint_data]  # Reconstruct the flaredJoint objects from the session data
    tolerance = float(request.form.get("toleranceValue"))  # Get the tolerance value from the form
    plateThk = float(request.form.get("thicknessValue"))  # Get the thickness value from the form
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
