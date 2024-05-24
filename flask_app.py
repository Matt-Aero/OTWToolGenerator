from flask import Flask, request, redirect, flash, render_template, send_from_directory, session, url_for, jsonify, send_file
import os
import tempfile
import zipfile
from CADQuery import Joint, flaredJoint, generateSupports

# Temporary folder for file uploads and generated files
UPLOAD_FOLDER = tempfile.gettempdir()
GENERATED_FOLDER = os.path.join(tempfile.gettempdir(), 'generated_files')
ALLOWED_EXTENSIONS = {'stl'}

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.secret_key = 'supersecretkey__2'

# Helper function to check file extension
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def main():
    return render_template('index.html')

@app.route('/process_joints', methods=['POST'])
def process_joints():
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
        
        # Check if all fields are present
        if not all([joint_type, *location, *normal_vector]):
            flash('Incomplete joint data')
            return redirect(url_for('main'))
        
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
    
    # Reconstruct the flaredJoint objects from the session data
    joints = [flaredJoint(data['location'], data['normal_vector'], data['flare_size']) for data in joint_data]
    
    generated_files = generateSupports(joints, GENERATED_FOLDER)  # Call the function to generate the tooling files
    
    generated_files = [os.path.basename(f) for f in generated_files]  # Get only the filenames
    
    return jsonify({'generated_files': generated_files})

@app.route('/generated/<filename>')
def serve_generated_file(filename):
    return send_from_directory(GENERATED_FOLDER, filename)

@app.route('/download_zip')
def download_zip():
    zip_path = os.path.join(GENERATED_FOLDER, 'generated_files.zip')
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        for root, dirs, files in os.walk(GENERATED_FOLDER):
            for file in files:
                if file.endswith('.stl') and 'generated_files.zip' not in file:
                    zipf.write(os.path.join(root, file), file)
    return send_file(zip_path, as_attachment=True, download_name='generated_files.zip')

if __name__ == '__main__':
    app.run(debug=True)
