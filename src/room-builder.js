/* =========================================================================
   ROOM BUILDER MODULE
   هذا الملف مسؤول فقط عن العمليات الهندسية لإنشاء الجدران، الأرضية، والسقف
   ========================================================================= */
import * as THREE from 'three';

// 1. إنشاء مجسم الحائط (بدون إضافته للمشهد)
export function createWallMeshStructure(wallWidth, height, depth, position, rotationY = 0) {
    const geometry = new THREE.BoxGeometry(wallWidth, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const wall = new THREE.Mesh(geometry, material);
    
    wall.position.copy(position);
    wall.position.y = height / 2 - 0.01;
    wall.rotation.y = rotationY;
    wall.castShadow = false;
    wall.receiveShadow = false;
    wall.name = 'wall';
    wall.userData = { 
        kind: 'wall', 
        width: wallWidth, 
        height: height, 
        depth: depth, 
        holes: [], 
        axis: (Math.abs(rotationY % (Math.PI)) < 1e-6) ? 'x' : 'z' 
    };
    
    return wall;
}

// 2. إعادة بناء هندسة الحائط (دالة كاملة)
export function rebuildWallGeometry(wall) {
    const { width, height, depth, holes } = wall.userData;
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -height / 2);
    shape.lineTo(width / 2, -height / 2);
    shape.lineTo(width / 2, height / 2);
    shape.lineTo(-width / 2, height / 2);
    shape.closePath();
    
    holes.forEach(h => {
        const hole = new THREE.Path();
        hole.moveTo(h.centerX - h.width / 2, h.centerY - h.height / 2);
        hole.lineTo(h.centerX + h.width / 2, h.centerY - h.height / 2);
        hole.lineTo(h.centerX + h.width / 2, h.centerY + h.height / 2);
        hole.lineTo(h.centerX - h.width / 2, h.centerY + h.height / 2);
        hole.closePath();
        shape.holes.push(hole);
    });
    
    const extrude = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    const m = new THREE.Matrix4().makeTranslation(0, 0, -depth / 2);
    extrude.applyMatrix4(m);
    wall.geometry.dispose();
    wall.geometry = extrude;
    wall.updateMatrixWorld(true);
}

// 3. إنشاء مجسم الأرضية
export function createFloorMesh(length, width, textureLoader, texturePath, renderer) {
    const floorGeo = new THREE.PlaneGeometry(length, width);
    let floorMat;

    if (textureLoader && texturePath) {
        const parquetTexture = textureLoader.load(texturePath, (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(length * 0.6, width * 0.6);
            if (renderer && renderer.capabilities) {
                texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            }
            texture.encoding = THREE.sRGBEncoding;
        });
        floorMat = new THREE.MeshStandardMaterial({ map: parquetTexture, side: THREE.DoubleSide });
    } else {
        floorMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    }

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    
    return floor;
}

// 4. إنشاء مجسم السقف
export function createCeilingMesh(length, width, wallHeight) {
    const ceilingGeo = new THREE.PlaneGeometry(length, width);
    const ceilingMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,         
        roughness: 1.0,          
        side: THREE.FrontSide    
    });
    
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2; 
    ceiling.position.y = wallHeight;  
    ceiling.castShadow = false;       
    ceiling.receiveShadow = true;
    ceiling.name = 'ceiling';
    
    return ceiling;
}

/* =========================================================================
   5. بناء جدران مخصصة من نقاط مضلع
   polygonPoints: [{x, z}] بالمتر — مضلع مغلق بزوايا 90 درجة
   ========================================================================= */
export function buildCustomWalls(polygonPoints, roomHeight, wallDepth = 0.1) {
    const wallMeshes = [];
    const n = polygonPoints.length;
    const signedArea = polygonPoints.reduce((sum, p, i) => {
        const next = polygonPoints[(i + 1) % n];
        return sum + ((p.x * next.z) - (next.x * p.z));
    }, 0) / 2;
    const isCCW = signedArea > 0;

    for (let i = 0; i < n; i++) {
        const p1 = polygonPoints[i];
        const p2 = polygonPoints[(i + 1) % n];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const segLen = Math.hypot(dx, dz);
        if (segLen < 0.01) continue;

        const outwardNormal = isCCW
            ? { x: dz / segLen, z: -dx / segLen }
            : { x: -dz / segLen, z: dx / segLen };

        const axis = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
        const rotationY = axis === 'x' ? 0 : Math.PI / 2;

        // القياس الذي يرسمه المستخدم هو القياس الداخلي الصافي.
        // لذلك نُبقي طول الحائط مساوياً لطول الضلع نفسه، ونُخرج السماكة للخارج فقط.
        const position = new THREE.Vector3(
            (p1.x + p2.x) / 2 + outwardNormal.x * (wallDepth / 2),
            0,
            (p1.z + p2.z) / 2 + outwardNormal.z * (wallDepth / 2)
        );

        const wall = createWallMeshStructure(segLen, roomHeight, wallDepth, position, rotationY);
        // نحفظ الاتجاه الصحيح للاستخدام في نظام الالتصاق والتصادم
        wall.userData.axis = axis;
        wall.userData.customWall = true;
        wall.userData.inwardNormal = { x: -outwardNormal.x, z: -outwardNormal.z };
        wallMeshes.push(wall);
    }

    return wallMeshes;
}

/* =========================================================================
   6. إنشاء أرضية مخصصة من نقاط مضلع مع UV صحيح
   ========================================================================= */
export function createCustomFloorMesh(polygonPoints, textureLoader, texturePath, renderer) {
    // ShapeGeometry في المستوى XY — سنقلب بعدين لمستوى XZ
    // نعكس z لأن rotateX(-PI/2) تحوّل Y إلى -Z
    const shape = new THREE.Shape();
    shape.moveTo(polygonPoints[0].x, -polygonPoints[0].z);
    for (let i = 1; i < polygonPoints.length; i++) {
        shape.lineTo(polygonPoints[i].x, -polygonPoints[i].z);
    }
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    // تدوير للمستوى الأفقي XZ
    geometry.rotateX(-Math.PI / 2);

    // حساب UV بناءً على الموضع العالمي (X و Z) لمنع التمطط
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const sizeX = Math.max(bb.max.x - bb.min.x, 0.001);
    const sizeZ = Math.max(bb.max.z - bb.min.z, 0.001);

    const posAttr = geometry.attributes.position;
    const uvAttr = geometry.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
        uvAttr.setXY(
            i,
            (posAttr.getX(i) - bb.min.x) / sizeX,
            (posAttr.getZ(i) - bb.min.z) / sizeZ
        );
    }
    uvAttr.needsUpdate = true;

    let floorMat;
    if (textureLoader && texturePath) {
        const floorTex = textureLoader.load(texturePath, (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(sizeX * 1.5, sizeZ * 1.5);
            if (renderer && renderer.capabilities) {
                texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            }
            texture.encoding = THREE.sRGBEncoding;
        });
        floorMat = new THREE.MeshStandardMaterial({ map: floorTex, side: THREE.DoubleSide });
    } else {
        floorMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    }

    const floor = new THREE.Mesh(geometry, floorMat);
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    floor.userData.isCustomFloor = true;
    floor.userData.bounds = { sizeX, sizeZ };

    return floor;
}

/* =========================================================================
   7. إنشاء سقف مخصص من نقاط مضلع
   ========================================================================= */
export function createCustomCeilingMesh(polygonPoints, wallHeight) {
    // للسقف نستخدم rotateX(+PI/2) حتى تكون الوجوه مرئية من الأسفل (نحو -Y)
    const shape = new THREE.Shape();
    shape.moveTo(polygonPoints[0].x, polygonPoints[0].z);
    for (let i = 1; i < polygonPoints.length; i++) {
        shape.lineTo(polygonPoints[i].x, polygonPoints[i].z);
    }
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);

    // UV من الموضع العالمي
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const sizeX = Math.max(bb.max.x - bb.min.x, 0.001);
    const sizeZ = Math.max(bb.max.z - bb.min.z, 0.001);
    const posAttr = geometry.attributes.position;
    const uvAttr = geometry.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
        uvAttr.setXY(
            i,
            (posAttr.getX(i) - bb.min.x) / sizeX,
            (posAttr.getZ(i) - bb.min.z) / sizeZ
        );
    }
    uvAttr.needsUpdate = true;

    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1.0,
        side: THREE.FrontSide
    });

    const ceiling = new THREE.Mesh(geometry, mat);
    ceiling.position.y = wallHeight;
    ceiling.receiveShadow = true;
    ceiling.name = 'ceiling';

    return ceiling;
}