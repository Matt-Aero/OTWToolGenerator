//import * as THREE from './node_modules/three/build/three.module.js';
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.module.js";
import { STLLoader } from "https://cdn.skypack.dev/three@0.132.2/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "https://cdn.skypack.dev/three@0.132.2/examples/jsm/controls/OrbitControls.js";
import Stats from 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/jsm/libs/stats.module.js';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from "https://cdn.skypack.dev/three@0.132.2/examples/jsm/loaders/FBXLoader.js";

// Constants and Configuration
const upVector = new THREE.Vector3(0, 0, 1);
const matcapTexture = new THREE.TextureLoader().load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/matcaps/matcap-porcelain-white.jpg');
const materialTube = new THREE.MeshMatcapMaterial({
    color: 0xFF8600, // Base color of the material
    matcap: matcapTexture, // Apply the matcap texture
    transparent: false, // Transparency setting
    opacity: 1, // Opacity setting
    flatShading: false // Enable flat shading if needed
});
const materialTool = new THREE.MeshMatcapMaterial({ color: 0xB0B0B0, matcap: matcapTexture });
const transparentLineMaterial = new THREE.LineBasicMaterial({ color: 0xFF8600, transparent: false, opacity: 1, side: THREE.DoubleSide });
const highlightLineMaterial = new THREE.LineBasicMaterial({ color: 0x00c062, transparent: false, opacity: 1, side: THREE.DoubleSide });
const pointMaterial = new THREE.MeshBasicMaterial({ color: 0x00c062 });
const pointMaterial_highlight = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
const gridEdgeLength = 3000; // mm
let gridSpacing = 100; // mm, initial grid spacing
const maxJointsWithoutPermission = 2;

let loadedWeldHead = null; // Store a reference to the loaded weld head model
let angleSliderVal = 0;


let renderer, scene, camera, controls;
let raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let visualInputJointId = null; // Global parameter to track the currently selected joint for visual input
let torusHover = null;
let jointArray = [];
let selectedCircularEdge = null;

// Uncomment Two Lines Below for FPS Data
//const stats = new Stats()
//document.body.appendChild(stats.dom)

///// MAIN BODY ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
document.addEventListener('DOMContentLoaded', () => {
    init();
    animate();
    updateGrid();

    function init() {
        // Scene and Camera Setup
        THREE.Object3D.DefaultUp = upVector;
        scene = new THREE.Scene();
        var ambientLight = new THREE.AmbientLight(0x404040); // Increase intensity to 2
        scene.add(ambientLight);

        const map = document.getElementById('threejsDisplay');
        const mapDimensions = map.getBoundingClientRect();
        camera = new THREE.PerspectiveCamera(55, mapDimensions.width / mapDimensions.height, 1, 100000);
        camera.position.set(500, 500, 500);
        camera.up.copy(upVector);
        camera.lookAt(new THREE.Vector3(0, 0, 0));
        scene.add(camera);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.sortObjects = false;
        renderer.setSize(mapDimensions.width, mapDimensions.height);
        document.getElementById('viewer').appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.update();
        
        let elementsArray = document.querySelectorAll("whatever");
        elementsArray.forEach(function(elem) {
            elem.addEventListener("input", function() {
                // This function does stuff
            });
        });
        animate();
    }

    // LISTENERS
    // Attach the clearScene function to the clear button
    document.getElementById('clearSceneButton').addEventListener('click', clearScene);
    document.getElementById('jointsForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('exportButton').addEventListener('click', () => window.location.href = '/download_zip');
    document.querySelectorAll('input[name="gridSpacing"]').forEach(radio => {
        radio.addEventListener('change', handleGridSpacingChange);
    });
    window.addEventListener( 'pointermove', handleMouseMove );
    window.addEventListener('click', handleMouseClick, false);
    window.addEventListener('resize', onWindowResize, false);
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }


});






///// USER INPUT HANDLING ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// --- Mouse Move & Click Handlers ---
// Called on every pointer move (if edge selection mode is active)
function handleMouseMove(event) {
    const map = document.getElementById('threejsDisplay');
    const mapDimensions = map.getBoundingClientRect();
    pointer.x = ((event.clientX - mapDimensions.left) / mapDimensions.width) * 2 - 1;
    pointer.y = -((event.clientY - mapDimensions.top) / mapDimensions.height) * 2 + 1;
    
    raycaster.setFromCamera(pointer, camera);
    edgeSelection();
}

function handleMouseClick() {
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
        handleJointClick(intersects);
    }
}

// --- Visual Input Mode Toggle ---
function toggleVisualInputMode(jointId) {
    const newButton = document.getElementById(`selectLocation${jointId}`);
    // Reset previously selected button if different.
    if (visualInputJointId !== null && visualInputJointId !== jointId) {
        const previousButton = document.getElementById(`selectLocation${visualInputJointId}`);
        previousButton.classList.replace('btn-danger', 'btn-success');
        previousButton.textContent = 'Select Edge';
    }

    if (visualInputJointId === jointId) {
        // Unselect the current joint.
        visualInputJointId = null;
        newButton.classList.replace('btn-danger', 'btn-success');
        newButton.textContent = 'Select Edge';
        toggleEdgesVisibility(false); // Hide edges.
    } else {
        visualInputJointId = jointId;
        newButton.classList.replace('btn-success', 'btn-danger');
        newButton.textContent = 'Cancel';
        toggleEdgesVisibility(true); // Show edges.
    }
}

// When edge selection mode is toggled on/off,
// ensure that only circular edges are enabled for raycasting, but keep them hidden until hovered over.
function toggleEdgesVisibility(visible) { 
    // When toggling, we enable raycasting if 'visible' is true,
    // but always keep these edges hidden until hovered.
    scene.traverse(child => {
        if (child.name === "edge" || child.name === "CircularEdges") {
            child.visible = false;  // Always hide by default.
            child.raycast = visible ? THREE.Line.prototype.raycast : () => {};
        }
    });
}



// When an edge is clicked, use its stored data so that its highlight persists.
function handleJointClick(intersects) {
    const intersectedObject = intersects[0].object;
    const objectName = intersectedObject.name;

    if (visualInputJointId !== null) {
        const jointNumber = visualInputJointId;
        const jointIndex = jointArray.findIndex(joint => joint.jointNumber === jointNumber);
        if (jointIndex === -1) return;
        const joint = jointArray[jointIndex];

        // Remove any existing visual objects for this joint.
        [joint.ArrowObj, joint.SphereObj, joint.CircleObj].forEach(obj => {
            if (obj) {
                scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            }
        });
        
        // Process only if a circular edge was clicked.
        if (objectName === "CircularEdges") {
            // Mark this edge as selected so it remains highlighted.
            selectedCircularEdge = intersectedObject;
            const center = intersectedObject.position.clone();

            // Create a permanent sphere at the center.
            const permanentSphere = new THREE.Mesh(
                new THREE.SphereGeometry(2, 32, 32),
                pointMaterial
            );
            permanentSphere.position.copy(center);
            permanentSphere.name = 'centerPoint';
            permanentSphere.userData = { id: jointNumber, isSelected: true };
            scene.add(permanentSphere);

            // Extract axis and radius from userData.
            const { x: axis_x, y: axis_y, z: axis_z } = intersectedObject.userData.axis;
            const radius = intersectedObject.userData.radius;
            const normalVect = new THREE.Vector3(axis_x, axis_y, axis_z).normalize();

            // Create an arrow helper using the normal vector.
            const arrowHelper = new THREE.ArrowHelper(
                normalVect,
                permanentSphere.position,
                80,
                0x00c062,
                25,
                20
            );
            arrowHelper.raycast = () => {};
            scene.add(arrowHelper);

            // Create a torus (circle) using the radius and orient it with the normal.
            const circleGeometry = new THREE.TorusGeometry(radius, radius * 0.03, 64, 64);
            const circle = new THREE.Mesh(circleGeometry, highlightLineMaterial);
            const quaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                normalVect
            );
            circle.applyQuaternion(quaternion);
            circle.position.copy(permanentSphere.position);
            scene.add(circle);

            // Update form fields.
            const xInput = document.getElementById(`xInput${jointNumber}`);
            const yInput = document.getElementById(`yInput${jointNumber}`);
            const zInput = document.getElementById(`zInput${jointNumber}`);
            const nxInput = document.getElementById(`nxInput${jointNumber}`);
            const nyInput = document.getElementById(`nyInput${jointNumber}`);
            const nzInput = document.getElementById(`nzInput${jointNumber}`);
            if (xInput && yInput && zInput && nxInput && nyInput && nzInput) {
                xInput.value = permanentSphere.position.x.toFixed(3);
                yInput.value = permanentSphere.position.y.toFixed(3);
                zInput.value = permanentSphere.position.z.toFixed(3);
                nxInput.value = normalVect.x.toFixed(3);
                nyInput.value = normalVect.y.toFixed(3);
                nzInput.value = normalVect.z.toFixed(3);
            } else {
                console.error('Form input elements not found');
            }

            // Update joint data.
            joint.jointLocation = permanentSphere.position.clone();
            joint.jointVector = normalVect.clone();
            joint.ArrowObj = arrowHelper;
            joint.SphereObj = permanentSphere;
            joint.CircleObj = circle;

            // Reset visual input toggle.
            toggleVisualInputMode(jointNumber);
        }
    }
}







async function addJoint(x = "-", y = "-", z = "-") {
    const userSubscriptionStatus = await getUserSubscriptionStatus();
    if (!userSubscriptionStatus && jointArray.length >= maxJointsWithoutPermission) {
        showGenericModal(
            "Free accounts are limited to 2 joints per job. Upgrade to gain access to unlimited joints and exclusive features!",
            "/pricing",
            "Upgrade Now"
        );
        return;
    }
    const jointNumber = jointArray.length + 1;
    jointArray.push({
        jointNumber: jointNumber,
        jointLocation: new THREE.Vector3(),
        jointVector: new THREE.Vector3(),
        jointType: '',
        ArrowObj: null,
        SphereObj: null,
        CircleObj: null
    });

    const jointContainer = document.createElement('div');
    jointContainer.className = 'border rounded mb-3 p-2';
    jointContainer.style.borderColor = '#A9A9A9';
    jointContainer.style.position = 'relative';
    jointContainer.id = `joint${jointNumber}`;

    jointContainer.innerHTML = `
    <small class="font-weight-bold" style="position: absolute; top: -10px; left: 10px; background: black; padding: 0 5px;">
        JOINT ${jointNumber}
    </small>
    <div class="form-group mb-2 d-flex align-items-center">
        <select class="form-control form-control-sm flex-grow-1" id="jointType${jointNumber}" name="jointType${jointNumber}" style="appearance: none;">
            <option value="" disabled selected>-Joint Type-</option>
            <option value="hole">Simple Hole</option>
            <option value="Flanged">Flanged</option>
            <option value="1/4">1/4 Bulkhead, AS1099</option>
            <option value="1/2">1/2 Bulkhead, AS1099</option>
            <option value="1">1 Bulkhead, AS1099</option>
            <option value="midspan">MidSpan Support</option>
            <option value="weldHead">Weld Head</option>
        </select>
        <button type="button" id="selectLocation${jointNumber}" class="btn btn-success btn-sm" style="width: 19em; margin-left: 0.5em;">
            Select Edge
        </button>
        <button type="button" id="reverseNormal${jointNumber}" class="btn btn-light btn-sm" style="background-color: transparent; color: #00c062; margin-left: 0.5em; box-sizing: border-box;">
            <i class="fa-solid fa-arrows-up-down"></i>
        </button>
    </div>
    <div id="jointDetails${jointNumber}">
        <div class="form-group mb-2 d-flex align-items-center">
            <label for="xInput${jointNumber}" class="me-2" style="width: 30em;">Location</label>
            <input type="text" class="form-control form-control-sm me-2" name="xInput${jointNumber}" id="xInput${jointNumber}" placeholder="X">
            <input type="text" class="form-control form-control-sm me-2" name="yInput${jointNumber}" id="yInput${jointNumber}" placeholder="Y">
            <input type="text" class="form-control form-control-sm me-2" name="zInput${jointNumber}" id="zInput${jointNumber}" placeholder="Z">
            <span class="small" style="width: 25px; padding: 0">[mm]</span>
        </div>
        <div class="form-group d-flex align-items-center">
            <label for="nxInput${jointNumber}" class="me-2" style="width: 30em;">Vector</label>
            <input type="text" class="form-control form-control-sm me-2" name="nxInput${jointNumber}" id="nxInput${jointNumber}" placeholder="X">
            <input type="text" class="form-control form-control-sm me-2" name="nyInput${jointNumber}" id="nyInput${jointNumber}" placeholder="Y">
            <input type="text" class="form-control form-control-sm me-2" name="nzInput${jointNumber}" id="nzInput${jointNumber}" placeholder="Z">
        </div>
        <div class="d-flex justify-content-center align-items-center mt-1">
            <label for="supportWidthSlider${jointNumber}" class="me-2">Stance Multiplier</label>
            <input type="range" class="form-range" id="supportWidthSlider${jointNumber}" name="supportWidthSlider${jointNumber}" min="50" max="150" step="5" value="100">
            <input type="text" class="form-control form-control-sm ms-2 small" id="supportWidthValue${jointNumber}" name="supportWidthValue${jointNumber}" value="100" style="width: 60px;">
            <span class="small ms-2">[%]</span>
        </div>
    </div>
    <div id="additionalInputs${jointNumber}"></div>
    `;



    document.getElementById('jointsContainer').appendChild(jointContainer);
    document.getElementById(`jointType${jointNumber}`).addEventListener('change', function () {
        updateJointType(this, `additionalInputs${jointNumber}`);
    });
    // Add event listeners for the new input fields.
    document.querySelectorAll(`#joint${jointNumber} input, #joint${jointNumber} select`).forEach(input => {
        input.addEventListener('input', syncFormandHighlightedObjects);
    });
    // Add event listener for the toggle button.
    document.getElementById(`selectLocation${jointNumber}`).addEventListener('click', function() {
        toggleVisualInputMode(jointNumber);
    });
    document.getElementById(`reverseNormal${jointNumber}`).addEventListener('click', function () {
        reverseJointNormal(jointNumber);
    });

    // Event listener for the slider to constrain values between 20 and 100.
    const supportSlider = document.getElementById(`supportWidthSlider${jointNumber}`);
    const supportValue = document.getElementById(`supportWidthValue${jointNumber}`);
    supportSlider.addEventListener('input', function() {
        let value = parseInt(this.value);
        if (value < 50) value = 50;
        if (value > 150) value = 150;
        this.value = value;
        supportValue.value = value;
    });
    // Prevent user from entering a value outside the bounds in the text field.
    supportValue.addEventListener('blur', function() {
        let value = parseInt(this.value);
        if (isNaN(value)) value = 100;
        if (value < 20) value = 20;
        if (value > 100) value = 100;
        this.value = value;
        supportSlider.value = value;
    });
    supportValue.addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            let value = parseInt(this.value);
            if (isNaN(value)) value = 100;
            if (value < 20) value = 20;
            if (value > 100) value = 100;
            this.value = value;
            supportSlider.value = value;
        }
    });

    document.getElementById('jointCount').value = jointArray.length;
}








function reverseJointNormal(jointNumber) {
    // Find the joint in the jointArray
    const jointIndex = jointArray.findIndex(joint => joint.jointNumber === jointNumber);
    
    if (jointIndex > -1) {
        const joint = jointArray[jointIndex];

        // Reverse the joint normal vector
        joint.jointVector.negate();

        // Update the form values
        document.getElementById(`nxInput${jointNumber}`).value = joint.jointVector.x.toFixed(3);
        document.getElementById(`nyInput${jointNumber}`).value = joint.jointVector.y.toFixed(3);
        document.getElementById(`nzInput${jointNumber}`).value = joint.jointVector.z.toFixed(3);

        // Update the Arrow object
        if (joint.ArrowObj) {
            joint.ArrowObj.setDirection(joint.jointVector);
        }
    }
}

// Syncing the joint form and the jointarry / displayed
function syncFormandHighlightedObjects() {
    jointArray.forEach(joint => {
        // Pull values from the form
        const jointNumber = joint.jointNumber;
        const jointType = document.getElementById(`jointType${jointNumber}`).value;
        const jointLocation = new THREE.Vector3(
            parseFloat(document.getElementById(`xInput${jointNumber}`).value),
            parseFloat(document.getElementById(`yInput${jointNumber}`).value),
            parseFloat(document.getElementById(`zInput${jointNumber}`).value)
        );
        const jointVector = new THREE.Vector3(
            parseFloat(document.getElementById(`nxInput${jointNumber}`).value),
            parseFloat(document.getElementById(`nyInput${jointNumber}`).value),
            parseFloat(document.getElementById(`nzInput${jointNumber}`).value)
        ).normalize();

        // Update the joint in jointArray
        joint.jointType = jointType;
        joint.jointLocation.copy(jointLocation);
        joint.jointVector.copy(jointVector);
    });
}














///// THREEJS HELPERS ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function handleGridSpacingChange(event) {
    gridSpacing = parseInt(event.target.value);
    updateGrid();
}

function updateGrid() {
    const existingGrid = scene.getObjectByName('gridHelper');
    if (existingGrid) {
        scene.remove(existingGrid);
    }
    const numDivisions = gridEdgeLength / gridSpacing;
    const grid = new THREE.GridHelper(gridEdgeLength, numDivisions);
    grid.rotation.x = Math.PI / 2;
    grid.name = 'gridHelper';
    scene.add(grid);
    // drawing arrows too
    scene.add(new THREE.AxesHelper(60));
    scene.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 60, 0xFF0000, 10, 5));
    scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 60, 0x008000, 10, 5));
    scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 60, 0x0000FF, 10, 5));
}


function clearScene() {
    while (scene.children.length > 0) {
        const child = scene.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(material => material.dispose());
            } else {
                child.material.dispose();
            }
        }
        scene.remove(child);
    }

    // redraw the grid and axis
    updateGrid();

    // re-add the light
    const light = new THREE.AmbientLight( 0x404040 ); // soft white light
    scene.add( light );

    // Clear the file input value
    document.getElementById('fileUpload').value = '';
}


function onWindowResize() {
    const map = document.getElementById('threejsDisplay');
    const mapDimensions = map.getBoundingClientRect();
    camera.aspect = mapDimensions.width / mapDimensions.height;
    camera.updateProjectionMatrix();
    renderer.setSize(mapDimensions.width, mapDimensions.height);
    renderer.render(scene, camera);
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    //stats.update();
}



// Called on pointer move when edge selection mode is active.
function edgeSelection() {
    if (!visualInputJointId) return;

    const circularEdges = scene.children.filter(child => child.name === "CircularEdges");
    const intersects = raycaster.intersectObjects(circularEdges, true);

    // Reset all circular edges: hide and set default (transparent) material.
    circularEdges.forEach(edge => {
        if (edge !== selectedCircularEdge) {
            edge.material = transparentLineMaterial;
            edge.visible = false;
        }
    });

    if (intersects.length > 0) {
        const hoveredEdge = intersects[0].object;
        if (selectedCircularEdge && selectedCircularEdge !== hoveredEdge) {
            selectedCircularEdge = null;
        }
        hoveredEdge.visible = true;
        hoveredEdge.material = highlightLineMaterial;
    } else if (selectedCircularEdge) {
        selectedCircularEdge.visible = true;
        selectedCircularEdge.material = highlightLineMaterial;
    }
}







///// FILE UPLOADS/PROCESSING ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function handleFileUpload(event) {
    document.getElementById('loadingMessage').style.display = 'block';
    const uploadedFile = event.target.files[0];
    const formData = new FormData();
    formData.append('file', uploadedFile);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            console.log("STL Path: ", data.stl_path);
            
            // Add lighting
            const ambientLight = new THREE.AmbientLight(0x404040);
            scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(5, 5, 5).normalize();
            scene.add(directionalLight);

            // Load the STL file
            if (data.stl_path) {
                loadSTL(data.stl_path, materialTube, true, { type: 'fileUpload' }, () => {
                    console.log("File loaded.");
                    document.getElementById('loadingMessage').style.display = 'none';
                });
            } else {
                document.getElementById('loadingMessage').style.display = 'none';
            }
            
            // Process and display circular edge centers as white points
            if (data.edges && data.edges.length > 0) {
                processCircularEdges(data.edges);
            }
        }
        document.getElementById('loadingMessage').style.display = 'none';
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while uploading the file.');
        document.getElementById('loadingMessage').style.display = 'none';
    });
}

function processCircularEdges(edges) {
    // This function receives an array of edge data in the format:
    // [center_x, center_y, center_z, axis_x, axis_y, axis_z, radius]
    
    edges.forEach(edgeData => {
        const [x, y, z, axis_x, axis_y, axis_z, radius] = edgeData;
        
        // Create a torus using the radius; tube radius is 5% of the main radius.
        const tubeRadius = 2;
        const torusGeometry = new THREE.TorusGeometry(radius, tubeRadius, 16, 100);
        const torusMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const torus = new THREE.Mesh(torusGeometry, torusMaterial);
        
        // Set the name for selection purposes.
        torus.name = "CircularEdges";
        
        // Store the circular edge data for later use.
        torus.userData = {
            center: { x: x, y: y, z: z },
            axis: { x: axis_x, y: axis_y, z: axis_z },
            radius: radius
        };

        // Orient the torus so its normal aligns with the provided axis.
        const defaultNormal = new THREE.Vector3(0, 0, 1);
        const targetNormal = new THREE.Vector3(axis_x, axis_y, axis_z).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultNormal, targetNormal);
        torus.quaternion.copy(quaternion);
        
        // Position the torus at the center.
        torus.position.set(x, y, z);
        
        // Ensure the torus is hidden initially.
        torus.visible = false;
        
        scene.add(torus);
    });
}











function handleFormSubmit(event) {
    event.preventDefault();
    const formData = new FormData(this);
    
    // collect ooling objects to delete
    const toolingObjects = [];
    scene.traverse(function (child) {
        if (child.userData.type === 'tooling') {
            toolingObjects.push(child);
        }
    });
    
    // delete the objects
    toolingObjects.forEach(function (object) {
        scene.remove(object);
    });
    // load new tooling
    loadTooling(formData)
}

// Function To Generate Tooling
function loadTooling(formData) {
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
            const stlFiles = data.generated_files.filter(file => file.endsWith('.stl'));
            let loadedFiles = 0;
            stlFiles.forEach(file => {
                loadSTL(`/generated/${file}`, materialTool, false, { type: 'tooling' }, () => {
                    loadedFiles++;
                    if (loadedFiles === stlFiles.length) {
                        document.getElementById('loadingMessage').style.display = 'none';
                    }
                });
            });
        })
        .catch(error => {
            console.error('Error:', error);
            document.getElementById('loadingMessage').style.display = 'none';
        });
}

function loadSTL(url, material, edgesVisible, metadata = {}, onLoadCallback) {
    const loader = new STLLoader();
    loader.load(url, geometry => {
        const mesh = new THREE.Mesh(geometry, material);
        // Attach metadata to the mesh
        mesh.userData = { ...metadata };
        scene.add(mesh);
        mesh.raycast = function() {}; // Prevent these objects from occluding selections
        // Hide all edges (non-circular and circular) when finished.
        toggleEdgesVisibility(false);
        
        if (onLoadCallback) onLoadCallback();
    });
}















///// HTML FORM HANDLING ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function removeJoint() {
    const jointsContainer = document.getElementById('jointsContainer');
    if (jointsContainer.children.length > 0) {
        // Remove the last joint from the jointArray
        const lastJoint = jointArray.pop();
        // Remove the associated Three.js objects from the scene
        if (lastJoint.ArrowObj) {
            scene.remove(lastJoint.ArrowObj);
            if (lastJoint.ArrowObj.geometry) lastJoint.ArrowObj.geometry.dispose();
            if (lastJoint.ArrowObj.material) lastJoint.ArrowObj.material.dispose();
        }
        if (lastJoint.SphereObj) {
            scene.remove(lastJoint.SphereObj);
            if (lastJoint.SphereObj.geometry) lastJoint.SphereObj.geometry.dispose();
            if (lastJoint.SphereObj.material) lastJoint.SphereObj.material.dispose();
        }
        if (lastJoint.CircleObj) {
            scene.remove(lastJoint.CircleObj);
            if (lastJoint.CircleObj.geometry) lastJoint.CircleObj.geometry.dispose();
            if (lastJoint.CircleObj.material) lastJoint.CircleObj.material.dispose();
        }
        jointsContainer.removeChild(jointsContainer.lastChild);
        // Update the jointCount value to reflect the new length of jointArray
        document.getElementById('jointCount').value = jointArray.length;
    }
}



async function getUserSubscriptionStatus() {
    const response = await fetch('/api/get_subscription_status');
    const data = await response.json();
    return data.subscription_status;
}

document.querySelector('button#addJointButton').addEventListener('click', addJoint);
document.querySelector('button#removeJointButton').addEventListener('click', removeJoint);

document.getElementById('toleranceSlider').addEventListener('input', function () {
    const value = parseFloat(this.value).toFixed(2);
    document.getElementById('toleranceValue').value = value;
});

document.getElementById('toleranceValue').addEventListener('blur', updateToleranceValue);
document.getElementById('toleranceValue').addEventListener('keyup', function (event) {
    if (event.key === 'Enter') {
        updateToleranceValue();
    }
});

function updateToleranceValue() {
    let valMax = 1;
    let valMin = 0;
    const value = parseFloat(document.getElementById('toleranceValue').value);
    if (value >= valMin && value <= valMax) {
        document.getElementById('toleranceSlider').value = value.toFixed(2);
    } else if (value > valMax) {
        document.getElementById('toleranceValue').value = (valMax).toFixed(2);
        document.getElementById('toleranceSlider').value = (valMax).toFixed(2);
    } else if (value < valMin) {
        document.getElementById('toleranceValue').value = (valMin).toFixed(2);
        document.getElementById('toleranceSlider').value = (valMin).toFixed(2);
    }
}

document.getElementById('thicknessSlider').addEventListener('input', function () {
    const value = parseFloat(this.value).toFixed(2);
    document.getElementById('thicknessValue').value = value;
});

document.getElementById('thicknessValue').addEventListener('blur', updateThicknessValue);
document.getElementById('thicknessValue').addEventListener('keyup', function (event) {
    if (event.key === 'Enter') {
        updateThicknessValue();
    }
});

function updateThicknessValue() {
    let valMax = 25.4;
    let valMin = 3;
    const value = parseFloat(document.getElementById('thicknessValue').value);
    if (value >= valMin && value <= valMax) {
        document.getElementById('thicknessSlider').value = value.toFixed(2);
    } else if (value > valMax) {
        document.getElementById('thicknessValue').value = (valMax).toFixed(2);
        document.getElementById('thicknessSlider').value = (valMax).toFixed(2);
    } else if (value < valMin) {
        document.getElementById('thicknessValue').value = (valMin).toFixed(2);
        document.getElementById('thicknessSlider').value = (valMin).toFixed(2);
    }
}

document.querySelector('button#generateToolingButton').addEventListener('click', function (event) {
    const form = document.getElementById('jointsForm');
    const errorContainer = document.getElementById('errorContainer');
    const addJointButton = document.querySelector('button#addJointButton'); // Assuming there's an add joint button with this ID
    errorContainer.innerHTML = '';
    let isValid = true;
    const inputs = form.querySelectorAll('input, select');
    // Check if there are no joints created
    if (jointArray.length < 1) {
        isValid = false;
        errorContainer.innerHTML = 'Please add at least 1 joint';
    }
    inputs.forEach(input => {
        if (!input.value) {
            input.classList.add('is-invalid');
            isValid = false;
        } else {
            input.classList.remove('is-invalid');
        }
    });
    if (!isValid) {
        event.preventDefault();
        if (errorContainer.innerHTML === '') {
            errorContainer.innerHTML = 'Please fill out all fields';
        }
    }
});


function updateJointType(selectElement, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (selectElement.value === 'Flanged') {
        container.innerHTML = `
            <div class="form-group d-flex align-items-center mb-2 mt-2">
                <label for="boltCircleDiameter${jointArray.length}" class="me-2" style="width: 40em;">Bolt Circle Diameter</label>
                <input type="text" class="form-control form-control-sm" name="boltCircleDiameter${jointArray.length}" placeholder="-">
                <span class="small ms-2" style="width: 15em;">[mm]</span>
            </div>
            <div class="form-group d-flex align-items-center mb-2">
                <label for="boltHoleDiameter${jointArray.length}" class="me-2" style="width: 40em;">Bolt Hole Diameter</label>
                <input type="text" class="form-control form-control-sm" name="boltHoleDiameter${jointArray.length}" placeholder="-">
                <span class="small ms-2" style="width: 15em;">[mm]</span>
            </div>
            <div class="form-group d-flex align-items-center mb-2">
                <label for="numberOfBolts${jointArray.length}" class="me-2" style="width: 40em;"># Bolts</label>
                <input type="text" class="form-control form-control-sm" name="numberOfBolts${jointArray.length}" placeholder="-">
                <span class="small ms-2" style="width: 15em;">[-]</span>
            </div>
            <div class="form-group d-flex align-items-center">
                <label for="clockingOffset${jointArray.length}" class="me-2" style="width: 40em;">Clocking Offset (deg)</label>
                <input type="text" class="form-control form-control-sm" name="clockingOffset${jointArray.length}" placeholder="-">
                <span class="small ms-2" style="width: 15em;">[deg]</span>
            </div>
        `;
    } else if (selectElement.value === 'midspan') {
        container.innerHTML = `
            <div class="form-group d-flex align-items-center mb-2 mt-2">
                <label for="diameter${jointArray.length}" class="me-2" style="width: 20em;">Diameter</label>
                <input type="text" class="form-control form-control-sm" name="diameter${jointArray.length}" placeholder="-">
                <span class="small ms-2">[mm]</span>
            </div>
            <div class="form-group d-flex align-items-center mb-2 mt-2">
                <label for="offset${jointArray.length}" class="me-2" style="width: 20em;">Offset</label>
                <input type="text" class="form-control form-control-sm" name="offset${jointArray.length}" placeholder="-">
                <span class="small ms-2">[mm]</span>
            </div>
        `;
    } else if (selectElement.value === 'hole') {
        container.innerHTML = `
            <div class="form-group d-flex align-items-center mb-2 mt-2">
                <label for="diameter${jointArray.length}" class="me-2" style="width: 20em;">Diameter</label>
                <input type="text" class="form-control form-control-sm" name="diameter${jointArray.length}" placeholder="-">
                <span class="small ms-2">[mm]</span>
            </div>
        `;
    }
}



// Weld Interference Checks
document.getElementById('interferenceCheckSwitch').addEventListener('change', function() {
    const interferenceOptions = document.getElementById('interferenceOptions');
    if (this.checked) {
        interferenceOptions.style.display = 'block';
    } else {
        interferenceOptions.style.display = 'none';
        removeWeldHeadModels();
        document.getElementById('weldHeadModel').selectedIndex = 0;
        document.getElementById('jointNumber').selectedIndex = 0;
        document.getElementById('angleSlider').value = 0;
        document.getElementById('weldHeadImage').style.display = 'none';
        document.getElementById('weldheadlink').style.display = 'none';
    }
});

document.getElementById('weldHeadModel').addEventListener('change', function() {
    const selectedOption = this.options[this.selectedIndex];
    
    //REMOVE PREVIOUS WELD HEAD
    removeWeldHeadModels();

    // Load the weld head
    let modelName = selectedOption.getAttribute('value').substring(7).trim(); // Remove the first 7 characters and trim spaces
    console.log(`Model Name: ${modelName}`); // Log the model number to verify
    loadWeldHeadModel(modelName);

    // Display the corresponding image
    const imgSrc = selectedOption.getAttribute('data-img');
    const weldHeadImage = document.getElementById('weldHeadImage');
    document.getElementById('jointNumber').selectedIndex = 0; // resetting joint number to none
    if (imgSrc) {
        weldHeadImage.src = imgSrc;
        weldHeadImage.style.display = 'block';
    } else {
        weldHeadImage.style.display = 'none';
    }

    // display the link to the weld head
    // Display the link to the weld head
    const productLink = selectedOption.getAttribute('data-link');
    const weldHeadLink = document.getElementById('weldheadlink');
    if (productLink) {
        weldHeadLink.href = productLink;
        weldHeadLink.style.display = 'inline'; // Make sure the link is visible
    } else {
        weldHeadLink.style.display = 'none'; // Hide the link if no URL is provided
    }

    //reset the angle slider
    document.getElementById('angleSlider').value = 0;


});

// Event listener for joint number selection
document.getElementById('jointNumber').addEventListener('focus', function() {
    const jointNumberSelect = document.getElementById('jointNumber');
    // Clear existing options
    jointNumberSelect.innerHTML = '<option value="" disabled selected>-Select Joint-</option>';
    // Populate new options based on jointArray length
    jointArray.forEach((joint, index) => {
        const option = document.createElement('option');
        option.value = joint.jointNumber;
        option.text = `${joint.jointNumber}`;
        jointNumberSelect.appendChild(option);
    });
});

// reposition the weld head when the joint number is changed
document.getElementById('jointNumber').addEventListener('change', function() {
    scene.add(loadedWeldHead);
    updateWeldHeadLocation();
});




// Event listener for degree slider
document.getElementById('angleSlider').addEventListener('input', function() {
    angleSliderVal = document.getElementById('angleSlider').value;
    const angleInRadians = THREE.MathUtils.degToRad(angleSliderVal);

    if (loadedWeldHead) {
        // First reset the rotation to align with the joint vector
        const jointNumber = document.getElementById('jointNumber').value;
        const jointIndex = jointArray.findIndex(joint => joint.jointNumber == jointNumber);
        const joint = jointArray[jointIndex];
        const jointVector = joint.jointVector.clone().normalize();

        // Align the object's up axis (assumed to be Z-axis) to the joint vector
        const quaternion = new THREE.Quaternion();
        const objUpAxis = new THREE.Vector3(0, 0, 1); // Assuming the object's up axis is the Z-axis
        quaternion.setFromUnitVectors(objUpAxis, jointVector);
        loadedWeldHead.quaternion.copy(quaternion);

        // Apply the absolute rotation around the local Z-axis
        const additionalRotation = new THREE.Quaternion();
        additionalRotation.setFromAxisAngle(objUpAxis, angleInRadians);
        loadedWeldHead.quaternion.multiply(additionalRotation);
    }
});

// Function to load and display the weld head model
function loadWeldHeadModel(modelName, jointLocation) {
    removeWeldHeadModels();
    const loader = new FBXLoader();
    loader.load(`static/weldHeads/${modelName}.fbx`, function(object) {
        // Store the reference to the loaded weld head model
        loadedWeldHead = object;
        // note we do not show the weld head yet, until the user selects a joint
    }, undefined, function(error) {
        console.error('An error occurred while loading the FBX model:', error);
    });
}

// Function to remove all weld head models
function removeWeldHeadModels() {
    if (loadedWeldHead) {
        scene.remove(loadedWeldHead);
    }
}

function updateWeldHeadLocation(){
    const jointNumber = document.getElementById('jointNumber').value;
    const jointIndex = jointArray.findIndex(joint => joint.jointNumber == jointNumber);
    const joint = jointArray[jointIndex];
    const jointLocation = joint.jointLocation;
    const jointVector = joint.jointVector;

    if (loadedWeldHead && jointLocation) {
        // Move the loaded weld head to the joint location and apply rotation
        loadedWeldHead.position.copy(jointLocation);
        loadedWeldHead.lookAt(jointLocation.clone().add(jointVector));
    }

}

function updateWeldHeadRotation(){


}






// Overscreen popup
function showGenericModal(message, pageUrl, linkTitle) {
    const modalBody = document.getElementById('genericModalBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <p>${message}</p>
            <p style="text-align: center;">
                <a href="${pageUrl}" style="color: white; text-decoration: none; border-radius: 1em; padding: 5px 10px; display: inline-block; background-color: #00c062;" onmouseover="this.style.filter='brightness(85%)'" onmouseout="this.style.filter='brightness(100%)'">${linkTitle}</a>
            </p>`;
        $('#genericModal').modal('show');
    } else {
        console.error("Modal elements not found");
    }
}

