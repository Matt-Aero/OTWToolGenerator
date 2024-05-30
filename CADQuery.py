import os
import cadquery as cq
from cadquery import exporters
import numpy as np
import math

class Joint:
    def __init__(self, location, normal_vector):
        self.location = np.array(location)
        self.normal_vector = np.array(normal_vector)

class flaredJoint(Joint):
    def __init__(self, location, normal_vector, flareSize):
        super().__init__(location, normal_vector)
        self.flareSize = flareSize
        self.type = "flared"

def generateSupports(joints, export_dir, tolerance, plateThk):
    # Generates all 3x support pieces for a single joint
    
    ## General Parameters
    radiusRelief = 1.5  # radius of the radii used to relief the waterjet corners
    #filletRelief = 3  # fillet size of the blending for the radius reliefs
    filletRadius = 10 #
    tabTol = 2*tolerance # mm, additional gap added on all sides of the tab+slots
    holeTolerance = tabTol # mm
    z_plate_offset = .3 # how far off the table to offset the tabs. 1mm usually
    plateThk = plateThk
    in2m = 25.4 # conversion variable for easily converting in->mm
    purgeHoleID = 7 # mm, diameter of the purge hole added to each plate

    ## Dictionary for parameters of each flaresize
    # hole_size - the hole ID that will be cut in the extrusion to fit a bulkhead-fitting for this flare
    # zoffset - the offset to apply between the where the user specifies the tube end location to be, and where we actually want to place the extrusion relative to this

    flare_sizes = {
        "1/4": {"hole_size": 0.25 * 25.4 + holeTolerance, "zoffset": 0},
        "1/2": {"hole_size": 0.5 * 25.4 + holeTolerance, "zoffset": 0},
        "1": {"hole_size": 1.0 * 25.4 + holeTolerance, "zoffset": 0}
    }

    os.makedirs(export_dir, exist_ok=True)  # Create directory if it doesn't exist

    numJoints = len(joints)
    generated_files = []

    ## Draw Base Plate
    basePlatePadding = 3 * in2m # add some padding to baseplate
    x_min = joints[0].location[0] # initializing variables
    x_max = joints[0].location[0]
    y_min = joints[0].location[1]
    y_max = joints[0].location[1]

    for j in range(numJoints):
        joint_location_x = joints[j].location[0]
        joint_location_y = joints[j].location[1]
        if joint_location_x > x_max:
            x_max = joint_location_x
        elif joint_location_x < x_min:
            x_min = joint_location_x
        if joint_location_y > y_max:
            y_max = joint_location_y
        elif joint_location_y < y_min:
            y_min = joint_location_y
    
    x_max = x_max + basePlatePadding
    x_min = x_min - basePlatePadding
    y_max = y_max + basePlatePadding
    y_min = y_min - basePlatePadding
    
    basePlate = (
        cq.Workplane("XY")
        .moveTo(x_max, y_max)
        .lineTo(x_max, y_min)
        .lineTo(x_min, y_min)
        .lineTo(x_min, y_max)
        .close()  # Close the loop back to the starting point
        .extrude(plateThk)
        .edges("|Z").fillet(filletRadius) # only fillet the edges parallel to Z
    )

    ####### Looping Through Joints
    for i in range(numJoints):
        # create a plane where the joint is
        joint_location = joints[i].location
        joint_normal_vector = joints[i].normal_vector
        
        # Update the location with an offset to account for the plate thickness
        joint_normal_vector_norm = joint_normal_vector / np.linalg.norm(joint_normal_vector)
        joint_location = joint_location+joint_normal_vector_norm*plateThk/2

        # Replace zero values in normal_vector with small non-zero
        joint_normal_vector = np.array([0.0001 if component == 0 else component for component in joint_normal_vector])
        print(joint_normal_vector)

        jointPlane = cq.Plane(tuple(joint_location), tuple([0, 0, 1]), tuple(joint_normal_vector))
        jointWorkPlane = cq.Workplane(jointPlane) # Create a workplane using the defined Plane
    
        # Add Offset To joint Locations as needed
        if joints[i].type == "flared":
            flareSize = joints[i].flareSize # diameter of the flare
            offset = flare_sizes[flareSize]["zoffset"]
        
        ## Draw the flat tooling body on the workplane
        # Take different action based on a flared versus flanged connection
        if joints[i].type == "flanged":
            boltHoleSize = joints[i].boltHoleSize
            boltCircleDiameter = joints[i].boltCircleDiameter
            numbolts = joints[i].numBolts
            plateWidth = boltCircleDiameter * 1.6
            plateHeight = boltCircleDiameter * 1.35
            jointPlate = (
                jointWorkPlane
                .rect(plateHeight, plateWidth)
                .circle(purgeHoleID / 2)
                .polygon(numbolts, boltCircleDiameter, True, False).vertices().circle(boltHoleSize / 2) # Draw the flange bolt holes
            )
        elif joints[i].type == "flared":
            flareSize = joints[i].flareSize # diameter of the flare
            flareHoleSize = flare_sizes[flareSize]['hole_size']
            flareZOffset = flare_sizes[flareSize]['zoffset']
            plateWidth = flareHoleSize * 3.5
            plateHeight = flareHoleSize * 3.5
        
            jointPlate = (
                jointWorkPlane
                .rect(plateHeight, plateWidth)
                .circle(flareHoleSize / 2)
                .extrude(plateThk/2, both=True)  # symmetric extrude
            )
            
        
        tabWidth = plateThk
        tabHeight = plateHeight / 2 # how long the tab is
        sideTab_ny = (
            jointWorkPlane
            # Draw the side tab slots
            .moveTo(0, plateWidth / 2 + plateThk / 2)
            .rect(tabHeight, tabWidth)
            .extrude(plateThk/2, both=True)
        )
        sideTab_py = (
            jointWorkPlane
            # Draw the side tab slots
            .moveTo(0, -plateWidth / 2 - plateThk / 2)
            .rect(tabHeight, tabWidth)
            .extrude(plateThk/2, both=True)
        )
    
        jointPlate = jointPlate.union(sideTab_ny)
        jointPlate = jointPlate.union(sideTab_py)
        # Export jointPlate to STL file
        joint_plate_path = os.path.join(export_dir, f"joint_plate_{i+1}.stl")
        exporters.export(jointPlate, joint_plate_path)
        generated_files.append(joint_plate_path)
    
        ## Side Supports
        # Create a New Workplane for the side supports
        sidePlaneGlobalCoords = jointPlane.toWorldCoords((0, -plateWidth / 2)) # get the location of the new workplane in global coords
        sidePlaneXdir = [joint_normal_vector[0], joint_normal_vector[1], 0] # pull the x and y components of the joint normal only... want z to be aligned with global z so we can easily extrude down
        sidePlane = cq.Plane(sidePlaneGlobalCoords, tuple(sidePlaneXdir), tuple([0, 0, 1])) # create the new plane
        sideWorkPlane = cq.Workplane(sidePlane) # Create a workplane using the defined Plane
    
        tabHeightMax = tabHeight / 2 + plateThk
        sideSupport = (
            sideWorkPlane
            .transformed(offset=cq.Vector(0, 0, 0), rotate=cq.Vector(90, 0, 0)) # rotating 90deg so we are sketching on the side
            .moveTo(tabHeightMax, tabHeightMax)
            .lineTo(-tabHeightMax, tabHeightMax)
            .lineTo(-tabHeightMax, -joint_location[2] + plateThk)
            .lineTo(tabHeightMax, -joint_location[2] + plateThk)
            .close()
            .extrude(-plateThk)
        )

        bottomTabWorkPlane = sideWorkPlane.transformed(offset=cq.Vector(0,plateThk/2,-joint_location[2] + plateThk / 2 + z_plate_offset), rotate=cq.Vector(90, 0, 0))
        bottomTab = ( # creating a separate object here so we can use it for cutting the bottom plate
            bottomTabWorkPlane
            .rect(tabHeight, tabWidth)
            .extrude(-plateThk/2, both=True)
        )
        sideSupport = sideSupport.union(bottomTab)
    
        ##################
        # Create Toleranced tab object for cutting from the side support
        drawAxes(jointWorkPlane)
        # Method: Draw the circles where you want them. Apply rotation to all items in stack using rotateaboutcenter, then cut into side pieces
        sideTab_reliefs = (
            jointWorkPlane
            .rect(tabHeight+tabTol, tabWidth+tabTol, forConstruction=True)
            .vertices()  # Select all vertices of the rectangle
            .circle(radiusRelief)  # Add circles at each vertex
            .extrude(100)  # Extrude the circles
            .rotate(jointWorkPlane.plane.toWorldCoords((0, 0, 0)), jointWorkPlane.plane.toWorldCoords((1, 0, 0)), 90)
        )
        sideTab_py_tol = (
            jointWorkPlane
            .rect(tabHeight+tabTol, tabWidth+tabTol, forConstruction=False)
            .extrude(100)  # Extrude the circles
            .rotate(jointWorkPlane.plane.toWorldCoords((0, 0, 0)), jointWorkPlane.plane.toWorldCoords((1, 0, 0)), 90)
        )
        sideTab_py_tol = sideTab_py_tol.union(sideTab_reliefs)#.edges("#Z").fillet(filletRelief)

        #drawAxes(jointWorkPlane)     ############################################
        #show_object(sideTab_py_tol)  ######################################################################  DELETE ME BEFORE DEPLOY
        
        sideSupport = sideSupport.cut(sideTab_py_tol).cut(sideTab_py_tol) # Need to subtract out the un-toleranced shape out too, since the shell is a shell! it won't subtract out the center
        
        # Export sideSupport to STL file
        side_support_path = os.path.join(export_dir, f"side_support_{i+1}.stl")
        exporters.export(sideSupport, side_support_path)
        generated_files.append(side_support_path)
        # Mirroring the side support
        sideSupport_GlobalCoords = jointPlane.toWorldCoords((0, plateWidth / 2 + plateThk / 2)) # first get the location of the existing side support in global coordinates
        translation = (2 * (sideSupport_GlobalCoords.x - joint_location[0]), # now, find the delta from the center of the joint
                       2 * (sideSupport_GlobalCoords.y - joint_location[1]),
                       2 * (sideSupport_GlobalCoords.z - joint_location[2]))
        sideSupport_mirror = sideSupport.translate(translation) # translate a copy of the side support by the translation
        # Export sideSupport_mirror to STL file
        side_support_mirror_path = os.path.join(export_dir, f"side_support_mirror_{i+1}.stl")
        exporters.export(sideSupport_mirror, side_support_mirror_path)
        generated_files.append(side_support_mirror_path)
        
    
    
    
    
        ## Baseplate Cuts
        bottomTab_reliefs = ( # creating a separate object here so we can use it for cutting the bottom plate
            bottomTabWorkPlane
            .transformed(offset=cq.Vector(0, 20, 0), rotate=cq.Vector(90, 0, 0)) # rotating 90deg so we are sketching on the side
            .rect(tabHeight+tabTol, tabWidth+tabTol, forConstruction=True)
            .vertices()
            .circle(radiusRelief)  # Add circles at each vertex
            .extrude(50)  # Extrude the circles
            #.rotate(sideWorkPlane.plane.toWorldCoords((0, 0, 0)), sideWorkPlane.plane.toWorldCoords((1, 0, 0)), 90)
        )

        bottomTab_box_tol = (
            bottomTabWorkPlane
            .transformed(offset=cq.Vector(0, 20, 0), rotate=cq.Vector(90, 0, 0)) # rotating 90deg so we are sketching on the side
            .rect(tabHeight+tabTol, tabWidth+tabTol)
            .extrude(50)
            #.rotate(sideWorkPlane.plane.toWorldCoords((0, 0, 0)), sideWorkPlane.plane.toWorldCoords((1, 0, 0)), 90)
        )

        basePlate = basePlate.cut(bottomTab_box_tol).cut(bottomTab_reliefs)
        basePlate = basePlate.cut(bottomTab_box_tol.translate(translation)).cut(bottomTab_reliefs.translate(translation))
        
        #show_object(sideSupport)######################################################################  DELETE ME BEFORE DEPLOY
        #show_object(sideSupport_mirror)######################################################################  DELETE ME BEFORE DEPLOY
        #show_object(jointPlate)######################################################################  DELETE ME BEFORE DEPLOY
    
    #basePlate = basePlate.edges("|Z").fillet(filletRelief) # Apply fillet to baseplate edges   
    #show_object(basePlate)######################################################################  DELETE ME BEFORE DEPLOY
    # Export basePlate to STL file
    base_plate_path = os.path.join(export_dir, "base_plate.stl")
    exporters.export(basePlate, base_plate_path)
    generated_files.append(base_plate_path)
    
    print("All parts have been generated and exported.")
    return generated_files

def coordTransform(theta, x, y): # transforming 2d coordinates from into another coordinate system at some angle rotation
    xNew = x * math.cos(theta) + y * math.sin(theta)
    yNew = y * math.cos(theta) - x * math.sin(theta)
    return xNew, yNew


# Function to draw axis
def drawAxes(workPlane):   
    # Draw axes
    wp = workPlane
    axis_length = 20
    axisThk = 5
    x_axis = wp.lineTo(axis_length, 0).close().extrude(axisThk)
    y_axis = wp.moveTo(0, 0).lineTo(0, axis_length).close().extrude(axisThk)
    z_axis = wp.moveTo(0, 0).circle(axisThk*.2).extrude(axis_length)
    #show_object(x_axis, name="X-axis", options={"color": "red"})
    #show_object(y_axis, name="Y-axis", options={"color": "green"})
    #show_object(z_axis, name="Z-axis", options={"color": "blue"})
