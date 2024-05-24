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

def generateSupports(joints, export_dir):
    # Generates all 3x support pieces for a single joint
    
    ## General Parameters
    tabTol = .5 # tolerancing between tab + slot parts
    holeTolerance = 0.3 # mm
    z_plate_offset = .3 # how far off the table to offset the tabs. 1mm usually
    plateThk = 0.5 * 25.4
    in2m = 25.4 # conversion variable for easily converting in->mm
    purgeHoleID = 7 # mm, diameter of the purge hole added to each plate

    ## Dictionary for parameters of each flaresize
    # hole_size - the hole ID that will be cut in the extrusion to fit a bulkhead-fitting for this flare
    # zoffset - the offset to apply between the where the user specifies the tube end location to be, and where we actually want to place the extrusion relative to this

    flare_sizes = {
        "1/4": {"hole_size": 0.25 * 25.4 + holeTolerance, "zoffset": 0.05},
        "1/2": {"hole_size": 0.5 * 25.4 + holeTolerance, "zoffset": 0.07},
        "1": {"hole_size": 1.0 * 25.4 + holeTolerance, "zoffset": 0.1}
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
    )

    ####### Looping Through Joints
    for i in range(numJoints):
        # create a plane where the joint is
        joint_location = joints[i].location
        joint_normal_vector = joints[i].normal_vector
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
            )
        
        tabWidth = plateThk
        tabHeight = plateHeight / 2 # how long the tab is
        sideTab_ny = (
            jointWorkPlane
            # Draw the side tab slots
            .moveTo(0, plateWidth / 2 + plateThk / 2)
            .rect(tabHeight, tabWidth)
            .extrude(plateThk)
        )
        sideTab_py = (
            jointWorkPlane
            # Draw the side tab slots
            .moveTo(0, -plateWidth / 2 - plateThk / 2)
            .rect(tabHeight, tabWidth)
            .extrude(plateThk)
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
    
        # find angle between joint normal_vector and the global z
        theta = math.atan(joint_normal_vector[2] / joint_normal_vector[1])
        x_box, y_box = coordTransform(theta, plateHeight / 2, plateThk / 2)
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
        bottomTab = ( # creating a separate object here so we can use it for cutting the bottom plate
            sideWorkPlane
            .transformed(offset=cq.Vector(0, 0, 0), rotate=cq.Vector(90, 0, 0)) # rotating 90deg so we are sketching on the side
            .moveTo(0, -joint_location[2] + plateThk / 2 + z_plate_offset)
            .rect(tabHeight, tabWidth)
            .extrude(-plateThk)
        )
        sideSupport = sideSupport.union(bottomTab)
    
        ##################
        # Create Toleranced tab object for cutting from the side support
        tab_toleranced = sideTab_py.shell(tabTol)
        sideSupport = sideSupport.cut(tab_toleranced).cut(sideTab_py) # Need to subtract out the un-toleranced shape out too, since the shell is a shell! it won't subtract out the center
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
    
        # Now take cuts from the baseplate
        bottomTab_toleranced = bottomTab.shell(tabTol)
        basePlate = basePlate.cut(bottomTab_toleranced).cut(bottomTab)
        basePlate = basePlate.cut(bottomTab_toleranced.translate(translation)).cut(sideSupport_mirror) # mirroring to get the other side as well
    
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
