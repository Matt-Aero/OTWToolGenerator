import os
import cadquery as cq
from cadquery import exporters, importers
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

class flangeJoint(Joint):
    def __init__(self, location, normal_vector, boltCircleDiameter, numBolts, boltHoleSize, clockingOffset):
        super().__init__(location, normal_vector)
        self.boltCircleDiameter = boltCircleDiameter
        self.numBolts = numBolts
        self.boltHoleSize = boltHoleSize
        self.clockingOffset = clockingOffset
        self.type = "flanged"

class midspanJoint(Joint):
    def __init__(self, location, normal_vector, diameter, offset):
        super().__init__(location, normal_vector)
        self.diameter = diameter
        self.type = "midspan"
        self.offset = offset

class holeJoint(Joint):
    def __init__(self, location, normal_vector, diameter):
        super().__init__(location, normal_vector)
        self.diameter = diameter
        self.type = "hole"



def generateSupports(joints, export_dir, tolerance, plateThk):
    # Generates all 3x support pieces for a single joint
    
    ## General Parameters
    radiusRelief = 1.5  # radius of the radii used to relief the waterjet corners
    #filletRelief = 3  # fillet size of the blending for the radius reliefs
    filletRadius = 10 #
    tabTol = 2*tolerance # mm, additional gap added on all sides of the tab+slots
    holeTolerance = 2*tolerance # mm
    z_plate_offset = .3 # how far off the table to offset the tabs. 1mm usually
    in2m = 25.4 # conversion variable for easily converting in->mm
    purgeHoleID = 7 # mm, diameter of the purge hole added to each plate

    ## Dictionary for parameters of each flaresize
    # hole_size - the hole ID that will be cut in the extrusion to fit a bulkhead-fitting for this flare
    # zoffset - the offset to apply between the where the user specifies the tube end location to be, and where we actually want to place the extrusion relative to this

    flare_sizes = {
        "1/4": {"hole_size": 7/16 * 25.4 + holeTolerance, "zoffset": 0},
        "1/2": {"hole_size": 3/4 * 25.4 + holeTolerance, "zoffset": 0},
        "1": {"hole_size": (1+5/16) * 25.4 + holeTolerance, "zoffset": 0}
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
            
        # Defining the size to pad the baseplate by
        if joints[j].type == "flared":
            flareSize = joints[j].flareSize # diameter of the flare
            size = flare_sizes[flareSize]['hole_size']
        elif joints[j].type == "flanged":
            size = joints[j].boltCircleDiameter
        elif joints[j].type == "midspan":
            size = joints[j].diameter
        elif joints[j].type == "hole":
            size = joints[j].diameter
        
        if size>basePlatePadding:
            basePlatePadding = size
    
    x_max = x_max + basePlatePadding + plateThk*2
    x_min = x_min - basePlatePadding - plateThk*2
    y_max = y_max + basePlatePadding + plateThk*2
    y_min = y_min - basePlatePadding - plateThk*2
    
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
        joint_normal_vector = joint_normal_vector / np.linalg.norm(joint_normal_vector) # normalize
        
        # Update the location with an offset to account for the plate thickness
        joint_location = joint_location+joint_normal_vector*plateThk/2

        # Replace zero values in normal_vector with small non-zero
        joint_normal_vector = np.array([0.0001 if component == 0 else component for component in joint_normal_vector])
        
        
        if joints[i].type != "midspan":
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
                numbolts = int(joints[i].numBolts)
                clockingOffset = joints[i].clockingOffset # in deg. Note the first fastener points in +Z (global) for clockingOffset=0
                plateWidth = (boltCircleDiameter+boltHoleSize) * 1.75
                plateHeight = (boltCircleDiameter+boltHoleSize) * 1.5
                facePlate = (
                    jointWorkPlane
                    .rect(plateHeight, plateWidth)
                    .circle(purgeHoleID / 2)
                    .extrude(plateThk/2, both=True)
                )
                # Now create extrusions for the bolt holes
                boltHoles = (
                    jointWorkPlane
                    .transformed(offset=cq.Vector(0, 0, 0), rotate=cq.Vector(0, 0, clockingOffset)) # rotating 90deg so we are sketching on the side
                    .polygon(numbolts, boltCircleDiameter, True, False).vertices()
                    .circle(boltHoleSize / 2) # Draw the flange bolt holes
                    .extrude(plateThk/2+5, both=True)
                    )
                #show_object(boltHoles)
                facePlate= facePlate.cut(boltHoles)
                
            elif joints[i].type == "flared":
                flareSize = joints[i].flareSize # diameter of the flare
                flareHoleSize = flare_sizes[flareSize]['hole_size']
                plateWidth = flareHoleSize * 4
                plateHeight = flareHoleSize * 4
                
                facePlate = (
                    jointWorkPlane
                    .rect(plateHeight, plateWidth)
                    .circle(flareHoleSize / 2)
                    .extrude(plateThk/2, both=True)  # symmetric extrude
                )
            elif joints[i].type == "hole":
                holeSize = joints[i].diameter
                plateWidth = holeSize * 4
                plateHeight = holeSize * 4
                
                facePlate = (
                    jointWorkPlane
                    .rect(plateHeight, plateWidth)
                    .circle(holeSize / 2)
                    .extrude(plateThk/2, both=True)  # symmetric extrude
                )
            
            
            offset = (plateThk/2+plateThk) *  1/math.sqrt(joint_normal_vector[2]**2+0.001) # Plate for cutting side supports to increase weld head clearence
            extrudeDist = plateWidth*10
            if joint_normal_vector[2]<0:
                offset = -offset
                extrudeDist = -extrudeDist
            facePlate_forCut = (
                jointWorkPlane
                .transformed(offset=cq.Vector(0, 0, offset), rotate=cq.Vector(0, 0, 0)) # rotating 90deg so we are sketching on the side
                .rect(plateHeight*10, plateWidth*10)
                .extrude(extrudeDist, both=False)
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
        
            facePlate = facePlate.union(sideTab_ny)
            facePlate = facePlate.union(sideTab_py)
            
            
            # Export facePlate to STL an .step files
            facePlate_path_stl = os.path.join(export_dir, f"joint_{i+1}_facePlate.stl")
            facePlate_path_step = os.path.join(export_dir, f"joint_{i+1}_facePlate.step")
            exporters.export(facePlate, facePlate_path_stl)
            exporters.export(facePlate, facePlate_path_step)
            generated_files.append(facePlate_path_stl)
            generated_files.append(facePlate_path_step)
        
            ## Side Supports
            # Create a New Workplane for the side supports
            sidePlaneGlobalCoords = jointPlane.toWorldCoords((0, -plateWidth / 2)) # get the location of the new workplane in global coords
            sidePlaneXdir = [joint_normal_vector[0], joint_normal_vector[1], 0] # pull the x and y components of the joint normal only... want z to be aligned with global z so we can easily extrude down
            sidePlane = cq.Plane(sidePlaneGlobalCoords, tuple(sidePlaneXdir), tuple([0, 0, 1])) # create the new plane
            sideWorkPlane = cq.Workplane(sidePlane) # Create a workplane using the defined Plane
        
            sideSupportHeightMax = (tabHeight / 2)*math.sqrt(joint_normal_vector[0]**2+joint_normal_vector[1]**2) + 2.25*plateThk # scaling by the magnitude of the x/y components. Makes the plate more efficient
            sideSupportWidthMax = (tabHeight / 2)*math.sqrt(joint_normal_vector[2]**2) + 2.25*plateThk # scaling by the magnitude of the x/y components. Makes the plate more efficient
            
            sideSupport = (
                sideWorkPlane
                .transformed(offset=cq.Vector(0, 0, 0), rotate=cq.Vector(90, 0, 0)) # rotating 90deg so we are sketching on the side
                .moveTo(sideSupportWidthMax, sideSupportHeightMax)
                .lineTo(-sideSupportWidthMax, sideSupportHeightMax)
                .lineTo(-sideSupportWidthMax, -joint_location[2] + plateThk)
                .lineTo(sideSupportWidthMax, -joint_location[2] + plateThk)
                .close()
                .extrude(-plateThk)
            )
            
            drawAxes(sideWorkPlane)

            bottomTabHeight = sideSupportWidthMax # height of the tab on the bottom of the side support
            bottomTabWorkPlane = sideWorkPlane.transformed(offset=cq.Vector(0,plateThk/2,-joint_location[2] + plateThk / 2 + z_plate_offset), rotate=cq.Vector(90, 0, 0))
            bottomTab = ( # creating a separate object here so we can use it for cutting the bottom plate
                bottomTabWorkPlane
                .rect(bottomTabHeight, tabWidth)
                .extrude(-plateThk/2, both=True)
            )
            sideSupport = sideSupport.union(bottomTab)
            sideSupport = sideSupport.cut(facePlate_forCut)
        
            ##################
            # Create Toleranced tab object for cutting from the side support
            #drawAxes(sideWorkPlane)
            # Method: Draw the circles where you want them. Apply rotation to all items in stack using rotateaboutcenter, then cut into side pieces
            sideTab_reliefs = (
                jointWorkPlane
                .rect(tabHeight+tabTol, tabWidth+tabTol, forConstruction=True)
                .vertices()  # Select all vertices of the rectangle
                .circle(radiusRelief)  # Add circles at each vertex
                .extrude(plateWidth)  # Extrude the circles
                .rotate(jointWorkPlane.plane.toWorldCoords((0, 0, 0)), jointWorkPlane.plane.toWorldCoords((1, 0, 0)), 90)
            )
            sideTab_py_tol = (
                jointWorkPlane
                .rect(tabHeight+tabTol, tabWidth+tabTol, forConstruction=False)
                .extrude(plateWidth)  # Extrude the circles
                .rotate(jointWorkPlane.plane.toWorldCoords((0, 0, 0)), jointWorkPlane.plane.toWorldCoords((1, 0, 0)), 90)
            )
            sideTab_py_tol = sideTab_py_tol.union(sideTab_reliefs)#.edges("#Z").fillet(filletRelief)
    
            #drawAxes(jointWorkPlane)     ############################################
            #show_object(sideTab_py_tol)  ######################################################################  DELETE ME BEFORE DEPLOY
            
            sideSupport = sideSupport.cut(sideTab_py_tol).cut(sideTab_py_tol) # Need to subtract out the un-toleranced shape out too, since the shell is a shell! it won't subtract out the center
            
            # Export to STL and .step files
            sideSupport_path_stl = os.path.join(export_dir, f"joint_{i+1}_sideSupport.stl")
            sideSupport_path_step = os.path.join(export_dir, f"joint_{i+1}_sideSupport.step")
            exporters.export(sideSupport, sideSupport_path_stl)
            exporters.export(sideSupport, sideSupport_path_step)
            generated_files.append(sideSupport_path_stl)
            generated_files.append(sideSupport_path_step)
    
            # Mirroring the side support
            sideSupport_GlobalCoords = jointPlane.toWorldCoords((0, plateWidth / 2 + plateThk / 2)) # first get the location of the existing side support in global coordinates
            translation = (2 * (sideSupport_GlobalCoords.x - joint_location[0]), # now, find the delta from the center of the joint
                           2 * (sideSupport_GlobalCoords.y - joint_location[1]),
                           2 * (sideSupport_GlobalCoords.z - joint_location[2]))
            sideSupport_mirror = sideSupport.translate(translation) # translate a copy of the side support by the translation
            
            # Export to STL and .step files
            sideSupport_mirror_path_stl = os.path.join(export_dir, f"joint_{i+1}_sideSupport_mirror.stl")
            sideSupport_mirror_path_step = os.path.join(export_dir, f"joint_{i+1}_sideSupport_mirror.step")
            exporters.export(sideSupport_mirror, sideSupport_mirror_path_stl)
            exporters.export(sideSupport_mirror, sideSupport_mirror_path_step)
            generated_files.append(sideSupport_mirror_path_stl)
            generated_files.append(sideSupport_mirror_path_step)
    
    
            ## Baseplate Cuts
            bottomTab_reliefs = ( # creating a separate object here so we can use it for cutting the bottom plate
                bottomTabWorkPlane
                .transformed(offset=cq.Vector(0, 20, 0), rotate=cq.Vector(90, 0, 0)) # rotating 90deg so we are sketching on the side
                .rect(bottomTabHeight+tabTol, tabWidth+tabTol, forConstruction=True)
                .vertices()
                .circle(radiusRelief)  # Add circles at each vertex
                .extrude(50)  # Extrude the circles
                #.rotate(sideWorkPlane.plane.toWorldCoords((0, 0, 0)), sideWorkPlane.plane.toWorldCoords((1, 0, 0)), 90)
            )
    
            bottomTab_box_tol = (
                bottomTabWorkPlane
                .transformed(offset=cq.Vector(0, 20, 0), rotate=cq.Vector(90, 0, 0)) # rotating 90deg so we are sketching on the side
                .rect(bottomTabHeight+tabTol, tabWidth+tabTol)
                .extrude(50)
                #.rotate(sideWorkPlane.plane.toWorldCoords((0, 0, 0)), sideWorkPlane.plane.toWorldCoords((1, 0, 0)), 90)
            )
    
            basePlate = basePlate.cut(bottomTab_box_tol).cut(bottomTab_reliefs)
            basePlate = basePlate.cut(bottomTab_box_tol.translate(translation)).cut(bottomTab_reliefs.translate(translation))
            
        #### End of flared / flanged joint types
        elif joints[i].type == "midspan":
            # Offset Vector by the offset
            offset = joints[i].offset
            joint_location = joint_location+offset*joint_normal_vector
            
            jointPlane = cq.Plane(tuple(joint_location), (0, 0, 1), (joint_normal_vector[0], joint_normal_vector[1], 0)) 
            midSpanWorkPlane = (
                    cq.Workplane(jointPlane)
                    .transformed(rotate=(0, 0, -90), offset=(0,0,plateThk/2))  # Rotate 90 degrees around the Z-axis
            )
            drawAxes(midSpanWorkPlane)
            
            diameter = joints[i].diameter
            plateWidth = diameter + 2*(0.25*25.4)
            plateHeight = diameter * 2
            tabWidth = plateWidth/2 # how long the tab is
    
            facePlate = (
                midSpanWorkPlane
                .moveTo(plateWidth/2, 0)
                .lineTo(-plateWidth/2, 0)
                .lineTo(-plateWidth/2, -joint_location[2] + plateThk)
                .lineTo(plateWidth/2, -joint_location[2] + plateThk)
                .close()
                .extrude(-plateThk, both=False)
            )
            
            circleCut =(
                midSpanWorkPlane
                .circle(diameter / 2)
                .extrude(plateThk, both=True)  # symmetric extrude
            )
            facePlate = facePlate.cut(circleCut)
            
            
            bottomTabWorkPlane = midSpanWorkPlane.transformed(offset=cq.Vector(0,-joint_location[2] + plateThk / 2 + z_plate_offset, 0))
            #drawAxes(bottomTabWorkPlane)
            
            bottomTab = ( # creating a separate object here so we can use it for cutting the bottom plate
                bottomTabWorkPlane
                .rect(tabWidth, plateThk)
                .extrude(-plateThk)
            )
            facePlate = facePlate.union(bottomTab)
            
            
            ## Baseplate Cuts
            bottomTab_reliefs = ( # creating a separate object here so we can use it for cutting the bottom plate
                bottomTabWorkPlane
                .transformed(offset=cq.Vector(0, 20, -plateThk/2), rotate=cq.Vector(90, 0, 0)) # rotating 90deg so we are sketching on the side
                .rect(tabWidth+tabTol, plateThk+tabTol, forConstruction=True)
                .vertices()
                .circle(radiusRelief)  # Add circles at each vertex
                .extrude(50)  # Extrude the circles
                #.rotate(sideWorkPlane.plane.toWorldCoords((0, 0, 0)), sideWorkPlane.plane.toWorldCoords((1, 0, 0)), 90)
            )
    
            bottomTab_box_tol = (
                bottomTabWorkPlane
                .transformed(offset=cq.Vector(0, 20, -plateThk/2), rotate=cq.Vector(90, 0, 0)) # rotating 90deg so we are sketching on the side
                .rect(tabWidth+tabTol, plateThk+tabTol)
                .extrude(50)
                #.rotate(sideWorkPlane.plane.toWorldCoords((0, 0, 0)), sideWorkPlane.plane.toWorldCoords((1, 0, 0)), 90)
            )
    
            basePlate = basePlate.cut(bottomTab_box_tol).cut(bottomTab_reliefs)
            
            # Export facePlate to STL an .step files
            facePlate_path_stl = os.path.join(export_dir, f"joint_{i+1}_facePlate.stl")
            facePlate_path_step = os.path.join(export_dir, f"joint_{i+1}_facePlate.step")
            exporters.export(facePlate, facePlate_path_stl)
            exporters.export(facePlate, facePlate_path_step)
            generated_files.append(facePlate_path_stl)
            generated_files.append(facePlate_path_step)
            
            
            
        #show_object(sideSupport)######################################################################  DELETE ME BEFORE DEPLOY
        #show_object(sideSupport_mirror)######################################################################  DELETE ME BEFORE DEPLOY
        #show_object(facePlate)######################################################################  DELETE ME BEFORE DEPLOY
    
    #basePlate = basePlate.edges("|Z").fillet(filletRelief) # Apply fillet to baseplate edges   
    #show_object(basePlate)######################################################################  DELETE ME BEFORE DEPLOY
    
    # Export to STL and .step files
    base_plate_path_stl = os.path.join(export_dir, f"base_plate.stl")
    base_plate_path_step = os.path.join(export_dir, f"base_plate.step")
    exporters.export(basePlate, base_plate_path_stl)
    exporters.export(basePlate, base_plate_path_step)
    generated_files.append(base_plate_path_stl)
    generated_files.append(base_plate_path_step)

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


