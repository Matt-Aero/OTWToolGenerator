import * as THREE from './node_modules/three/build/three.module.js';
import { STLLoader } from "https://cdn.skypack.dev/three@0.132.2/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "https://cdn.skypack.dev/three@0.132.2/examples/jsm/controls/OrbitControls.js";

// Set the default up vector
let upVector = new THREE.Vector3(0, 0, 1);
let renderer, scene, camera, controls, currentMeshes = [];
let uploadedFile = null;
var gridEdgeLength = 3000; // mm
var gridSpacing = 100; // mm, initial grid spacing
const material_tube = new THREE.MeshMatcapMaterial({ color: 0xFF8600 });
const material_tool = new THREE.MeshMatcapMaterial({ color: 0xB0B0B0 });

var materialIndex = 0; // Counter to keep track of the material index

document.addEventListener('DOMContentLoaded', () => {
    init();
    animate();
    function init() {
        THREE.Object3D.DefaultUp = upVector;

        scene = new THREE.Scene();
        const axesHelper = new THREE.AxesHelper(50);
        scene.add(axesHelper);

        //var arrowPos = new THREE.Vector3( 0,0,0 );
        scene.add( new THREE.ArrowHelper( new THREE.Vector3( 1,0,0 ), new THREE.Vector3( 0, 0, 0 ), 60, 0xFF0000, 10, 5 ) );
        scene.add( new THREE.ArrowHelper( new THREE.Vector3( 0,1,0 ), new THREE.Vector3( 0, 0, 0 ), 60, 0x008000, 10, 5 ) );
        scene.add( new THREE.ArrowHelper( new THREE.Vector3( 0,0,1 ), new THREE.Vector3( 0, 0, 0 ), 60, 0x0000FF, 10, 5 ) );


        let map = document.getElementById('threejsDisplay');
        let mapDimensions = map.getBoundingClientRect();
        camera = new THREE.PerspectiveCamera(50, mapDimensions.width / mapDimensions.height, 1, 100000);
        //camera = new THREE.OrthographicCamera( -mapDimensions.width, mapDimensions.width, mapDimensions.height, -mapDimensions.height, .1, 100000 );
        camera.position.set(500, 500, 500); // Adjust camera position
        camera.up.copy(upVector); // Set camera up direction
        camera.lookAt(new THREE.Vector3(0, 0, 0)); // Ensure camera looks at the origin
        scene.add(camera);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(mapDimensions.width, mapDimensions.height);
        document.getElementById('viewer').appendChild(renderer.domElement);
        
        // drawing grid on ground plane
        updateGrid();

        // listening for the window to be resized
        window.addEventListener('resize', onWindowResize, false);

        // controls for moving around the objects
        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0); // Set controls target
        controls.update();

        // listening for file upload
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
            fileInput.addEventListener('change', function(event) {
                uploadedFile = event.target.files[0];

                // Create a FormData object and append the selected file
                const formData = new FormData();
                formData.append('file', uploadedFile);

                // Perform the file upload via Fetch API
                fetch('/upload', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        alert(data.error);
                    } else {
                        loadFileUpload(uploadedFile);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert('An error occurred while uploading the file.');
                });
            });
        }


        // listening for user to press the generate tooling button
        document.getElementById('jointsForm').addEventListener('submit', function(event) {
            event.preventDefault();
            const formData = new FormData(this);
            clearScene(); // Clear the scene before loading new files
            if (uploadedFile) {
                loadFileUpload(uploadedFile); // Reload the uploaded file
            }
            loadTooling(formData); // Load the generated tooling
        });

        // listening for the export button
        document.getElementById('exportButton').addEventListener('click', function() {
            window.location.href = '/download_zip';
        });

        // listening for user to change grid spacing
        document.querySelectorAll('input[name="gridSpacing"]').forEach(radio => {
            radio.addEventListener('change', function(event) {
                gridSpacing = parseInt(event.target.value);
                updateGrid();
            });
        });
        

    }

    // updating the grid spacing based on user input
    function updateGrid() {
        // Remove the existing grid
        const existingGrid = scene.getObjectByName('gridHelper');
        if (existingGrid) {
            scene.remove(existingGrid);
        }
    
        // Add a new grid with the updated spacing
        const numDivisions = gridEdgeLength / gridSpacing;
        const grid = new THREE.GridHelper(gridEdgeLength, numDivisions);
        grid.rotation.x = Math.PI / 2;
        grid.name = 'gridHelper'; // Set a name to easily find and remove the grid
        scene.add(grid);
    }
    
    function loadFileUpload(file) {
        if (file) {
            clearScene(); // Clear the scene before loading new files
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
        // Show the loading message
        document.getElementById('loadingMessage').style.display = 'block';
    
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
            // Filter the files to include only .stl files
            const stlFiles = data.generated_files.filter(file => file.endsWith('.stl'));
            let loadedFiles = 0;
    
            stlFiles.forEach(file => {
                loadSTL(file, () => {
                    loadedFiles++;
                    if (loadedFiles === stlFiles.length) {
                        // Hide the loading message when all files are loaded
                        document.getElementById('loadingMessage').style.display = 'none';
                    }
                });
            });
        })
        .catch(error => {
            console.error('Error:', error);
            // Hide the loading message in case of an error
            document.getElementById('loadingMessage').style.display = 'none';
        });
    }
    
    
    function loadSTL(file, onLoadCallback) {
        const loader = new STLLoader();
        loader.load(`/generated/${file}`, function(geometry) {
            const mesh = new THREE.Mesh(geometry, material_tool);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            currentMeshes.push(mesh);
            scene.add(mesh);
            if (onLoadCallback) onLoadCallback();
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
                <select class="form-control form-control-sm" id="jointType${jointCount}" name="jointType${jointCount}" style="appearance: none;">
                    <option value="" disabled selected>-Select Joint Type-</option>
                    <option value="1/4">Flared 1/4</option>
                    <option value="1/2">Flared 1/2</option>
                    <option value="1">Flared 1</option>
                    <option value="Flanged">Flanged</option>
                </select>
            </div>
            <div class="form-group d-flex align-items-center mb-2">
                <label for="xInput${jointCount}" class="me-2" style="width: 30em;">Location</label>
                <input type="text" class="form-control form-control-sm me-2" name="xInput${jointCount}" placeholder="X">
                <input type="text" class="form-control form-control-sm me-2" name="yInput${jointCount}" placeholder="Y">
                <input type="text" class="form-control form-control-sm" name="zInput${jointCount}" placeholder="Z">
                <span class="small ms-2" style="width: 15em;">[mm]</span>
            </div>
            <div class="form-group d-flex align-items-center">
                <label for="nxInput${jointCount}" class="me-2" style="width: 30em;">Vector</label>
                <input type="text" class="form-control form-control-sm me-2" name="nxInput${jointCount}" placeholder="X">
                <input type="text" class="form-control form-control-sm me-2" name="nyInput${jointCount}" placeholder="Y">
                <input type="text" class="form-control form-control-sm" name="nzInput${jointCount}" placeholder="Z">
                <span class="small ms-2" style="width: 15em;">[-]</span>
            </div>
            <div id="additionalInputs${jointCount}"></div>
        `;
    
        document.getElementById('jointsContainer').appendChild(jointContainer);
    
        // Add event listener for the newly added joint
        document.getElementById(`jointType${jointCount}`).addEventListener('change', function() {
            updateJointType(this, `additionalInputs${jointCount}`);
        });
        document.getElementById('jointCount').value = jointCount; // UPDATE THE HIDDEN "JOINT COUNT" FIELD IN HTML SO THAT FLASK CAN PULL IT TOO
    }

    function removeJoint() {
        const jointsContainer = document.getElementById('jointsContainer');
        if (jointsContainer.children.length > 1) {
            jointsContainer.removeChild(jointsContainer.lastChild);
            jointCount--;
        }
        document.getElementById('jointCount').value = jointCount; // UPDATE THE HIDDEN "JOINT COUNT" FIELD IN HTML SO THAT FLASK CAN PULL IT TOO
    }

    document.querySelector('button#addJointButton').addEventListener('click', addJoint);
    document.querySelector('button#removeJointButton').addEventListener('click', removeJoint);

    // JavaScript to sync slider and text input for the tolerance input slider
    document.getElementById('toleranceSlider').addEventListener('input', function() {
        var value = parseFloat(this.value).toFixed(2);
        document.getElementById('toleranceValue').value = value;
    });

    document.getElementById('toleranceValue').addEventListener('blur', function() {
        updateToleranceValue();
    });

    document.getElementById('toleranceValue').addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            updateToleranceValue();
        }
    });

    function updateToleranceValue() {
        let val_max = 1;
        let val_min = 0;
        var value = parseFloat(document.getElementById('toleranceValue').value);
        if (value >= val_min && value <= val_max) {
            document.getElementById('toleranceSlider').value = value.toFixed(2);
        } else if (value > val_max) {
            document.getElementById('toleranceValue').value = (val_max).toFixed(2);
            document.getElementById('toleranceSlider').value = (val_max).toFixed(2);
        } else if (value < val_min) {
            document.getElementById('toleranceValue').value = (val_min).toFixed(2);
            document.getElementById('toleranceSlider').value = (val_min).toFixed(2);
        }
    }

    // JavaScript to sync slider and text input for the thickness input slider
    document.getElementById('thicknessSlider').addEventListener('input', function() {
        var value = parseFloat(this.value).toFixed(2);
        document.getElementById('thicknessValue').value = value;
    });

    document.getElementById('thicknessValue').addEventListener('blur', function() {
        updateThicknessValue();
    });

    document.getElementById('thicknessValue').addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            updateThicknessValue();
        }
    });

    function updateThicknessValue() {
        let val_max = 25.4;
        let val_min = 1;
        var value = parseFloat(document.getElementById('thicknessValue').value);
        if (value >= val_min && value <= val_max) {
            document.getElementById('thicknessSlider').value = value.toFixed(2);
        } else if (value > val_max) {
            document.getElementById('thicknessValue').value = (val_max).toFixed(2);
            document.getElementById('thicknessSlider').value = (val_max).toFixed(2);
        } else if (value < val_min) {
            document.getElementById('thicknessValue').value = (val_min).toFixed(2);
            document.getElementById('thicknessSlider').value = (val_min).toFixed(2);
        }
    }


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

    // listening for if the user selects a flanged joint
    document.getElementById('jointType1').addEventListener('change', function() {
        updateJointType(this, 'additionalInputs1');
    });
    function updateJointType(selectElement, additionalInputsId) {
        const additionalInputs = document.getElementById(additionalInputsId);
        additionalInputs.innerHTML = '';

        if (selectElement.value === 'Flanged') {
            const inputHtml = `
                <div class="form-group d-flex align-items-center mb-2 mt-2">
                    <label for="boltCircleDiameter${jointCount}" class="me-2" style="width: 40em;">Bolt Circle Diameter</label>
                    <input type="text" class="form-control form-control-sm" name="boltCircleDiameter${jointCount}" placeholder="-">
                    <span class="small ms-2" style="width: 15em;">[mm]</span>
                </div>
                <div class="form-group d-flex align-items-center mb-2">
                    <label for="boltHoleDiameter${jointCount}" class="me-2" style="width: 40em;">Bolt Hole Diameter</label>
                    <input type="text" class="form-control form-control-sm" name="boltHoleDiameter${jointCount}" placeholder="-">
                    <span class="small ms-2" style="width: 15em;">[mm]</span>
                </div>
                <div class="form-group d-flex align-items-center mb-2">
                    <label for="numberOfBolts${jointCount}" class="me-2" style="width: 40em;"># Bolts</label>
                    <input type="text" class="form-control form-control-sm" name="numberOfBolts${jointCount}" placeholder="-">
                    <span class="small ms-2" style="width: 15em;">[-]</span>
                </div>
                <div class="form-group d-flex align-items-center">
                    <label for="clockingOffset${jointCount}" class="me-2" style="width: 40em;">Clocking Offset (deg)</label>
                    <input type="text" class="form-control form-control-sm" name="clockingOffset${jointCount}" placeholder="-">
                    <span class="small ms-2" style="width: 15em;">[deg]</span>
                </div>
            `;
            additionalInputs.innerHTML = inputHtml;
        }
    }

});

