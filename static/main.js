import * as THREE from './node_modules/three/build/three.module.js';
import { STLLoader } from "https://cdn.skypack.dev/three@0.132.2/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "https://cdn.skypack.dev/three@0.132.2/examples/jsm/controls/OrbitControls.js";

// Set the default up vector
let upVector = new THREE.Vector3(0, 0, 1);
let renderer, scene, camera, controls, currentMeshes = [];
let uploadedFile = null;

document.addEventListener('DOMContentLoaded', () => {

    init();
    animate();

    const material_tube = new THREE.MeshMatcapMaterial({ color: 0xFF8600 });
    const material_tool = new THREE.MeshMatcapMaterial({ color: 0xB0B0B0 });

    function init() {
        THREE.Object3D.DefaultUp = upVector;

        scene = new THREE.Scene();
        const axesHelper = new THREE.AxesHelper(50);
        scene.add(axesHelper);

        let map = document.getElementById('threejsDisplay');
        let mapDimensions = map.getBoundingClientRect();
        camera = new THREE.PerspectiveCamera(55, mapDimensions.width / mapDimensions.height, 1, 10000);
        camera.position.set(1000, 1000, 1000); // Adjust camera position
        camera.up.copy(upVector); // Set camera up direction
        camera.lookAt(new THREE.Vector3(0, 0, 0)); // Ensure camera looks at the origin
        scene.add(camera);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(mapDimensions.width, mapDimensions.height);

        document.getElementById('viewer').appendChild(renderer.domElement);
        window.addEventListener('resize', onWindowResize, false);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0); // Set controls target
        controls.update();

        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
            fileInput.addEventListener('change', function(event) {
                uploadedFile = event.target.files[0];
                loadFileUpload(uploadedFile);
            });
        }

        document.getElementById('jointsForm').addEventListener('submit', function(event) {
            event.preventDefault();
            const formData = new FormData(this);
            clearScene(); // Clear the scene before loading new files
            if (uploadedFile) {
                loadFileUpload(uploadedFile); // Reload the uploaded file
            }
            loadTooling(formData); // Load the generated tooling
        });

        document.getElementById('exportButton').addEventListener('click', function() {
            window.location.href = '/download_zip';
        });
    }

    function loadFileUpload(file) {
        if (file) {
            const loader = new STLLoader();
            const url = URL.createObjectURL(file);
            loader.load(url, function(geometry) {
                const mesh = new THREE.Mesh(geometry, material_tube);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                currentMeshes.push(mesh);
                scene.add(mesh);
            });
        }
    }

    function loadTooling(formData) {
        fetch('/process_joints', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(error => { throw new Error(error.error); });
            }
            return response.json();
        })
        .then(data => {
            console.log('Generated files:', data.generated_files);
            const files = data.generated_files;
            files.forEach(file => {
                loadSTL(file);
            });
        })
        .catch(error => console.error('Error:', error));
    }

    function loadSTL(file) {
        const loader = new STLLoader();
        loader.load(`/generated/${file}`, function(geometry) {
            const mesh = new THREE.Mesh(geometry, material_tool);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            currentMeshes.push(mesh);
            scene.add(mesh);
        });
    }

    function clearScene() {
        currentMeshes.forEach(mesh => {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        currentMeshes = [];
    }

    function onWindowResize() {
        let map = document.getElementById('threejsDisplay');
        let mapDimensions = map.getBoundingClientRect();
        camera.aspect = mapDimensions.width / mapDimensions.height;
        camera.updateProjectionMatrix();
        renderer.setSize(mapDimensions.width, mapDimensions.height);
        renderer.render(scene, camera);
    }

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    // Add joint function
    let jointCount = 1;

    function addJoint() {
        jointCount++;
        const jointContainer = document.createElement('div');
        jointContainer.className = 'border rounded mb-3 p-2';
        jointContainer.style.borderColor = '#A9A9A9';
        jointContainer.style.position = 'relative';

        jointContainer.innerHTML = `
            <small class="font-weight-bold" style="position: absolute; top: -10px; left: 10px; background: black; padding: 0 5px;">JOINT ${jointCount}</small>
            <div class="form-group mb-2">
                <select class="form-control form-control-sm" name="jointType${jointCount}" style="appearance: none;">
                    <option value="" disabled selected>-Select Joint Type-</option>
                    <option value="1/4">Flared 1/4</option>
                    <option value="1/2">Flared 1/2</option>
                    <option value="1">Flared 1</option>
                </select>
            </div>
            <div class="form-group d-flex align-items-center mb-2">
                <label for="xInput${jointCount}" class="me-2">Location [mm]</label>
                <input type="text" class="form-control form-control-sm me-2" name="xInput${jointCount}" placeholder="X">
                <input type="text" class="form-control form-control-sm me-2" name="yInput${jointCount}" placeholder="Y">
                <input type="text" class="form-control form-control-sm" name="zInput${jointCount}" placeholder="Z">
            </div>
            <div class="form-group d-flex align-items-center">
                <label for="nxInput${jointCount}" class="me-2">Normal Vector</label>
                <input type="text" class="form-control form-control-sm me-2" name="nxInput${jointCount}" placeholder="X">
                <input type="text" class="form-control form-control-sm me-2" name="nyInput${jointCount}" placeholder="Y">
                <input type="text" class="form-control form-control-sm" name="nzInput${jointCount}" placeholder="Z">
            </div>
        `;

        document.getElementById('jointsContainer').appendChild(jointContainer);
    }

    function removeJoint() {
        const jointsContainer = document.getElementById('jointsContainer');
        if (jointsContainer.children.length > 1) {
            jointsContainer.removeChild(jointsContainer.lastChild);
            jointCount--;
        }
    }

    document.querySelector('button#addJointButton').addEventListener('click', addJoint);
    document.querySelector('button#removeJointButton').addEventListener('click', removeJoint);

    // Form validation
    document.querySelector('button#generateToolingButton').addEventListener('click', function(event) {
        const form = document.getElementById('jointsForm');
        const errorContainer = document.getElementById('errorContainer');
        errorContainer.innerHTML = ''; // Clear previous errors

        let isValid = true;
        const inputs = form.querySelectorAll('input, select');

        inputs.forEach(input => {
            if (!input.value) {
                input.classList.add('is-invalid');
                isValid = false;
            } else {
                input.classList.remove('is-invalid');
            }
        });

        if (!isValid) {
            event.preventDefault(); // Prevent form submission
            errorContainer.innerHTML = 'Please fill out all fields';
        }
    });

});
