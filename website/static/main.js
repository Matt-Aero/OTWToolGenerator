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
let currentMeshes = [];
let uploadedFile = null;
let raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let edge_hover = null;  // holds the current edge being hovered over
let centerPoint_hover = null; // holds the center point of the current edge being hovered over
let visualInputJointId = null; // Global parameter to track the currently selected joint for visual input
let jointArray = [];
/*
jointArray.push({
    jointNumber: 1, // Number
    jointLocation: new THREE.Vector3(0, 0, 0), // THREE.Vector3
    jointVector: new THREE.Vector3(1, 0, 0), // THREE.Vector3
    jointType: "Flanged", // String
    ArrowObj: new THREE.ArrowHelper(), // THREE.ArrowHelper
    SphereObj: new THREE.Mesh(), // THREE.Mesh
    EdgeObj: new THREE.Line() // THREE.Line
});
*/

const stats = new Stats()
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
        const light = new THREE.AmbientLight( 0x404040 ); // soft white light
        scene.add( light );

        const map = document.getElementById('threejsDisplay');
        const mapDimensions = map.getBoundingClientRect();
        camera = new THREE.PerspectiveCamera(50, mapDimensions.width / mapDimensions.height, 1, 100000);
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
function handleMouseMove(event) {
    let map = document.getElementById('threejsDisplay');
    let mapDimensions = map.getBoundingClientRect();
    pointer.x = ((event.clientX - mapDimensions.left) / mapDimensions.width) * 2 - 1;
    pointer.y = - ((event.clientY - mapDimensions.top) / mapDimensions.height) * 2 + 1;

    raycaster.setFromCamera( pointer, camera );
    edgeSelection();
}
function handleMouseClick() {
    const intersects = raycaster.intersectObjects(scene.children, true); // get any interesected objects
    if (intersects.length > 0) { // if an object was intersected while clicking occurred
        const intersectedObject = intersects[0].object; // only looking at one intersected object at a time
        handleJointClick(intersects);      // take action if the selected object is a joint
     
    }
}

function toggleVisualInputMode(jointId) {
    const newButton = document.getElementById(`selectLocation${jointId}`);
    // If another button is already selected, reset it to its original state
    if (visualInputJointId !== null && visualInputJointId !== jointId) {
        const previousButton = document.getElementById(`selectLocation${visualInputJointId}`);
        previousButton.classList.remove('btn-danger');
        previousButton.classList.add('btn-success');
        previousButton.textContent = 'Select Location';
    }

    if (visualInputJointId === jointId) { // if the same button is called again, change it back to green / success status
        visualInputJointId = null;
        newButton.classList.remove('btn-danger');
        newButton.classList.add('btn-success');
        newButton.textContent = 'Select Location';
        visualInputJointId = null; // visual button id to null (none selected)
        toggleEdgesVisibility(false); // Hide edges
    } else { // if button is clicked for the first time, change state
        visualInputJointId = jointId;
        newButton.classList.remove('btn-success');
        newButton.classList.add('btn-danger');
        newButton.textContent = 'Cancel';
        toggleEdgesVisibility(true); // Show edges
    }
}

function toggleEdgesVisibility(visible) { 
    // turn on/off if the edges are visible and raycast (helps performance)
    scene.traverse(function (child) {
        if (child.name === "edge") {
            child.visible = visible;
            if (visible) {
                child.raycast = THREE.Line.prototype.raycast;
            } else {
                child.raycast = () => {};
            }
        }
    });
}



function handleJointClick(intersects) {
    const intersectedObject = intersects[0].object;
    const objectName = intersectedObject.name;

    if (visualInputJointId !== null) {
        const jointNumber = visualInputJointId;
        const jointIndex = jointArray.findIndex(joint => joint.jointNumber === jointNumber);

        if (jointIndex > -1) {
            const joint = jointArray[jointIndex];

            // Remove existing objects if they exist
            if (joint.ArrowObj) {
                scene.remove(joint.ArrowObj);
                if (joint.ArrowObj.geometry) joint.ArrowObj.geometry.dispose();
                if (joint.ArrowObj.material) joint.ArrowObj.material.dispose();
            }
            if (joint.SphereObj) {
                scene.remove(joint.SphereObj);
                if (joint.SphereObj.geometry) joint.SphereObj.geometry.dispose();
                if (joint.SphereObj.material) joint.SphereObj.material.dispose();
            }
            if (joint.CircleObj) {
                scene.remove(joint.CircleObj);
                if (joint.CircleObj.geometry) joint.CircleObj.geometry.dispose();
                if (joint.CircleObj.material) joint.CircleObj.material.dispose();
            }
            if (centerPoint_hover) {
                const permanentSphere = new THREE.Mesh(new THREE.SphereGeometry(2, 32, 32), pointMaterial);
                permanentSphere.position.copy(centerPoint_hover.position);
                permanentSphere.name = 'centerPoint';
                permanentSphere.userData.id = jointNumber;
                permanentSphere.userData.isSelected = true;
                scene.add(permanentSphere);
                const [normalVect, radius] = computeJointNormal(permanentSphere.position, edge_hover[0]);
                const arrowHelper = new THREE.ArrowHelper(normalVect, permanentSphere.position, 80, 0x00c062, 25, 20);
                arrowHelper.raycast = function() {};
                scene.add(arrowHelper);
                const circleGeometry = new THREE.TorusGeometry(radius, radius*.03, 64, 64);
                const circleMaterial = highlightLineMaterial;
                const circle = new THREE.Mesh(circleGeometry, circleMaterial);
                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normalVect);
                circle.applyQuaternion(quaternion);
                circle.position.set(permanentSphere.position.x, permanentSphere.position.y, permanentSphere.position.z);
                scene.add(circle);
                // Update form values using getElementById
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
                // Update jointArray with selected joint data
                joint.jointLocation = permanentSphere.position.clone();
                joint.jointVector = normalVect.clone();
                joint.ArrowObj = arrowHelper;
                joint.SphereObj = permanentSphere;
                joint.CircleObj = circle;

                // Reset the toggle button
                toggleVisualInputMode(jointNumber);
            }
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
        <small class="font-weight-bold" style="position: absolute; top: -10px; left: 10px; background: black; padding: 0 5px;">JOINT ${jointNumber}</small>
        <div class="form-group mb-2 d-flex align-items-center">
            <select class="form-control form-control-sm flex-grow-1" id="jointType${jointNumber}" name="jointType${jointNumber}" style="appearance: none;">
                <option value="" disabled selected>-Select Joint Type-</option>
                <option value="Flanged">Flanged</option>
                <option value="hole">Simple Hole</option>
                <option value="1/4">Flared 1/4</option>
                <option value="1/2">Flared 1/2</option>
                <option value="1">Flared 1</option>
                <option value="midspan">MidSpan Support</option>
                <option value="weldHead">Weld Head</option>
            </select>
            <button type="button" id="selectLocation${jointNumber}" class="btn btn-success btn-sm" style="width: 19em; margin-left: 0.5em;">Select Location</button>
        </div>
        <div class="form-group d-flex align-items-center mb-2">
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
            <button type="button" id="reverseNormal${jointNumber}" class="btn btn-light btn-sm" style="background-color: transparent; color: #00c062; width: 25px;  box-sizing: border-box;"><i class="fa-solid fa-arrows-up-down"></i></button>
        </div>
        <div id="additionalInputs${jointNumber}"></div>
    `;


    document.getElementById('jointsContainer').appendChild(jointContainer);
    document.getElementById(`jointType${jointNumber}`).addEventListener('change', function () {
        updateJointType(this, `additionalInputs${jointNumber}`);
    });
    // Add event listeners for the new input fields
    document.querySelectorAll(`#joint${jointNumber} input, #joint${jointNumber} select`).forEach(input => {
        input.addEventListener('input', syncFormandHighlightedObjects);
    });

    // Add event listener for the new toggle button
    document.getElementById(`selectLocation${jointNumber}`).addEventListener('click', function() {
        toggleVisualInputMode(jointNumber);
    });

    document.getElementById(`reverseNormal${jointNumber}`).addEventListener('click', function () {
        reverseJointNormal(jointNumber);
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

        // // Remove existing sphere object if it exists
        // if (joint.SphereObj) {
        //     scene.remove(joint.SphereObj);
        // }
        // // Create a new sphere object
        // joint.SphereObj = new THREE.Mesh(new THREE.SphereGeometry(2, 32, 32), new THREE.MeshBasicMaterial({ color: 0x00c062 }));
        // joint.SphereObj.position.copy(jointLocation);
        // scene.add(joint.SphereObj);

        // // Remove existing arrow object if it exists
        // if (joint.ArrowObj) {
        //     scene.remove(joint.ArrowObj);
        // }
        // // Create a new arrow object
        // joint.ArrowObj = new THREE.ArrowHelper(jointVector, jointLocation, 50, 0x00c062, 10, 5);
        // scene.add(joint.ArrowObj);

        // // Remove existing arrow object if it exists
        // if (joint.CircleObj) {
        //     scene.remove(joint.ArrowObj);
        // }

        // const radius = 10;
        // const circleGeometry = new THREE.TorusGeometry(radius, radius*.035, 64, 64);
        // const circle = new THREE.Mesh(circleGeometry, highlightLineMaterial);
        // const quaternion = new THREE.Quaternion();
        // quaternion.setFromUnitVectors(joint.jointVector.normalize(), jointVector.normalize());
        // circle.applyQuaternion(quaternion);
        // circle.position.set(jointLocation);
        // scene.add(circle);


    });
}





















function computeJointNormal(centerPoint, edge){
    // We know the center point and the outer ring of segments that makes up the edge. We can find the normal vector
    // centerPoint: xyz of the joint center
    // edge: an edge (line object) from the list of segments that make up the edge. This edge should be on the same plane as the center!
    
    // Extract Start and End Coordinates of Edge
    const positions = edge.geometry.attributes.position.array;
    const startPoint = new THREE.Vector3(positions[0], positions[1], positions[2]);
    const endPoint = new THREE.Vector3(positions[3], positions[4], positions[5]);
    // Calculate the vector v from startPoint to endPoint
    const v = new THREE.Vector3();
    v.subVectors(endPoint, startPoint);
    // Calculate the midpoint of the edge
    const midPoint = new THREE.Vector3();
    midPoint.addVectors(startPoint, endPoint).multiplyScalar(0.5);
    // Calculate the vector d from the center to the midpoint
    const d = new THREE.Vector3();
    d.subVectors(midPoint, centerPoint);
    // Compute the normal vector by taking the cross product of d and v
    const n = new THREE.Vector3();
    n.crossVectors(d, v);
    n.normalize(); // Normalize the normal vector
    const radius = d.length();
    return [n, radius]; // Return the computed normal vector
}


function edgeSelection() {
    const edges = scene.children.filter(child => child.name === "edge"); // filtering to get all edge elements from scene
    const intersects = raycaster.intersectObjects(edges, true);  // get all the edges that the mouse intersects with
    if (intersects.length > 0) {  // Does the mouse intersect with an edge
        const edge_now = intersects[0].object; // only taking the first edge in the list
        const circleEdgeGroup = groupCircularEdges(edge_now, edges); //looking for edges that form a loop. Returns false if not a circular loop

        if (circleEdgeGroup) {   // starting loop only if a circle edge group was identified
            // Reset color of all previouslyly highlighted edges 
            if (edge_hover){ 
                edge_hover.forEach(edge => edge.material = transparentLineMaterial);
                edge_hover = null;
            }
            // Highlight New Edges
            edge_hover = circleEdgeGroup;  // update the current selected edge group to be the highlighted group. Not this updates the reference, it does not copy objects
            edge_hover.forEach(edge => edge.material = highlightLineMaterial); // highlight the group
            
            // Get the Bounding Sphere and Location of the Joint.
            let combinedPositions = [];
            circleEdgeGroup.forEach(edge => {
                const positions = edge.geometry.attributes.position.array;
                combinedPositions = combinedPositions.concat(Array.from(positions));
            });
            const combinedGeometry = new THREE.BufferGeometry();
            combinedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(combinedPositions, 3));
            combinedGeometry.computeBoundingSphere();
            const center = combinedGeometry.boundingSphere.center;
            const pointGeometry = new THREE.SphereGeometry(1, 32, 32);
            
            // Draw a Sphere at Center of Bounding Sphere
            if (centerPoint_hover){ // remove existing center point hover if exists
                scene.remove(centerPoint_hover);
            }
            centerPoint_hover = new THREE.Mesh(pointGeometry, pointMaterial_highlight);
            centerPoint_hover.position.copy(center); 
            scene.add(centerPoint_hover);
        }  
    } else { // remove highlighted edge and center point if they exist
        if (edge_hover){
            edge_hover.forEach(edge => edge.material = transparentLineMaterial);
            edge_hover = null;
        }
        if (centerPoint_hover){
            scene.remove(centerPoint_hover);
            centerPoint_hover = null;
        }
    }
}







///// THREEJS HELPERS ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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

// Find and Return Groups of Edges that form a Circle
// For an input edge, loop through all other edges and form a group of adjacent edges
function groupCircularEdges(hoveredEdge, edges) {
    let edgeGroup = [hoveredEdge];
    let currentEdge = hoveredEdge;
    let remainingEdges = edges.slice();
    for (let i = 0; i < remainingEdges.length; i++) {
        let edgeCandidate = remainingEdges[i];
        if (areEdgesColinear(currentEdge, edgeCandidate) && areVerticesCoincident(currentEdge, edgeCandidate)) {
            edgeGroup.push(edgeCandidate);
            currentEdge = edgeCandidate;
            remainingEdges.splice(i, 1);
            i = 0;
        }
    }
    const firstLastCoincident = areVerticesCoincident(edgeGroup[0], edgeGroup[edgeGroup.length - 1]);  // Are the first and last edges coincident (must be true for a circle)
    const loopLength = edgeGroup.length; // get the length of the loop
    const minLength = 4; // edges threshold
    // if firstLastCoincident==true, return edgegroup. Otherwise return the false
    if (firstLastCoincident && loopLength>=minLength){
        return edgeGroup;
    } else {
        return false;
    }
}

function areEdgesColinear(edge1, edge2, angleTol = 30) {
    const direction1 = new THREE.Vector3().subVectors(
        new THREE.Vector3(edge1.geometry.attributes.position.getX(1), edge1.geometry.attributes.position.getY(1), edge1.geometry.attributes.position.getZ(1)),
        new THREE.Vector3(edge1.geometry.attributes.position.getX(0), edge1.geometry.attributes.position.getY(0), edge1.geometry.attributes.position.getZ(0))
    ).normalize();
    const direction2 = new THREE.Vector3().subVectors(
        new THREE.Vector3(edge2.geometry.attributes.position.getX(1), edge2.geometry.attributes.position.getY(1), edge2.geometry.attributes.position.getZ(1)),
        new THREE.Vector3(edge2.geometry.attributes.position.getX(0), edge2.geometry.attributes.position.getY(0), edge2.geometry.attributes.position.getZ(0))
    ).normalize();
    const dotProduct = direction1.dot(direction2);
    const angle = Math.acos(dotProduct) * (180 / Math.PI);
    return angle <= angleTol;
}

function areVerticesCoincident(edge1, edge2, tolerance = 0.0001) { // checks if two line segments share a vertex
    const pos1 = edge1.geometry.attributes.position;
    const pos2 = edge2.geometry.attributes.position;
    const edge1Start = new THREE.Vector3(pos1.getX(0), pos1.getY(0), pos1.getZ(0));
    const edge1End = new THREE.Vector3(pos1.getX(1), pos1.getY(1), pos1.getZ(1));
    const edge2Start = new THREE.Vector3(pos2.getX(0), pos2.getY(0), pos2.getZ(0));
    const edge2End = new THREE.Vector3(pos2.getX(1), pos2.getY(1), pos2.getZ(1));
    const toleranceSquared = tolerance * tolerance;
    return edge1Start.distanceToSquared(edge2Start) <= toleranceSquared ||
        edge1Start.distanceToSquared(edge2End) <= toleranceSquared ||
        edge1End.distanceToSquared(edge2Start) <= toleranceSquared ||
        edge1End.distanceToSquared(edge2End) <= toleranceSquared;
}










///// FILE UPLOADS/PROCESSING ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function handleFileUpload(event) {
    document.getElementById('loadingMessage').style.display = 'block';
    uploadedFile = event.target.files[0];
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
                document.getElementById('loadingMessage').style.display = 'none';
            } else {
                loadFileUpload(uploadedFile);
            }
        })
        .catch(error => {
            document.getElementById('loadingMessage').style.display = 'none';
            console.error('Error:', error);
            alert('An error occurred while uploading the file. Check File size / type- only .stl files under 50mb are allowed.');
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

function loadFileUpload(file) {
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5).normalize();
    scene.add(directionalLight);
    if (file) {
        const loader = new STLLoader();
        const url = URL.createObjectURL(file);
        loadSTL(url, materialTube, true, { type: 'fileUpload' }, () => {
            console.log("File loaded.");
            // Hide the loading message only after the file has been loaded
            document.getElementById('loadingMessage').style.display = 'none';
        });
    } else {
        // Hide the loading message if no file is selected
        document.getElementById('loadingMessage').style.display = 'none';
    }
}


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
        mesh.raycast = function() {}; // don't want these objects to occlude or prevent us from selecting the green joint dots
        
        // Drawing individual edges for us to classify later
        if (edgesVisible) {
            const thresholdAngle = 15; // An edge is only rendered if the angle (in degrees) between the face normals of the adjoining faces exceeds this value. default = 1 degree.
            const edges = new THREE.EdgesGeometry(geometry, thresholdAngle);

            const positions = edges.attributes.position.array;
            var edgeCount = 0; // Counting number of edges
            for (let i = 0; i < positions.length; i += 6) {
                const edgeGeometry = new THREE.BufferGeometry();
                const vertices = new Float32Array([
                    positions[i], positions[i + 1], positions[i + 2],
                    positions[i + 3], positions[i + 4], positions[i + 5]
                ]);
                edgeGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                const edgeLine = new THREE.Line(edgeGeometry, transparentLineMaterial.clone());
                edgeLine.name = "edge";
                // Attach metadata to the edgeLine
                edgeLine.userData = { ...metadata };
                edgeCount++;
                edgeLine.raycast = () => {};
                scene.add(edgeLine);
            }
            console.log(edgeCount); // useful performance parameter
        }
        toggleEdgesVisibility(false); // turn off all edges for now
        

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


function updateJointType(selectElement, additionalInputsId) {
    const additionalInputs = document.getElementById(additionalInputsId);
    additionalInputs.innerHTML = '';

    if (selectElement.value === 'Flanged') {
        additionalInputs.innerHTML = `
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
        additionalInputs.innerHTML = `
            <div class="form-group d-flex align-items-center mb-2 mt-2">
                <label for="diameter${jointArray.length}" class="me-2" style="width: 20em;">Diameter</label>
                <input type="text" class="form-control form-control-sm" name="diameter${jointArray.length}" placeholder="-">
                <span class="small ms-2"">[mm]</span>
            </div>
            <div class="form-group d-flex align-items-center mb-2 mt-2">
                <label for="offset${jointArray.length}" class="me-2" style="width: 20em;">Offset</label>
                <input type="text" class="form-control form-control-sm" name="offset${jointArray.length}" placeholder="-">
                <span class="small ms-2"">[mm]</span>
            </div>
        `;
    } else if (selectElement.value === 'hole') {
        additionalInputs.innerHTML = `
            <div class="form-group d-flex align-items-center mb-2 mt-2">
                <label for="diameter${jointArray.length}" class="me-2" style="width: 20em;">Diameter</label>
                <input type="text" class="form-control form-control-sm" name="diameter${jointArray.length}" placeholder="-">
                <span class="small ms-2"">[mm]</span>
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
        document.getElementById('angleSlider').selectedIndex = 0;
        document.getElementById('weldHeadImage').style.display = 'none';
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
    if (imgSrc) {
        weldHeadImage.src = imgSrc;
        weldHeadImage.style.display = 'block';
    } else {
        weldHeadImage.style.display = 'none';
    }
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
    updateWeldHeadLocation();
});




// Event listener for degree slider
document.getElementById('angleSlider').addEventListener('input', function() {
    angleSliderVal = parseFloat(this.value);
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
    loader.load(`static/weldheads/${modelName}.fbx`, function(object) {
        // Store the reference to the loaded weld head model
        loadedWeldHead = object;

        scene.add(object);
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
        // Alternate quaternion rotation
        // rotate to the joint vector
        //const quaternion = new THREE.Quaternion()
        //const objUpAxis = new THREE.Vector3( 0, 0, 1 );
        //quaternion.setFromUnitVectors(objUpAxis, jointVector.normalize())
        //loadedWeldHead.applyQuaternion(quaternion);
        
    }

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

