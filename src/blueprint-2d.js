import * as THREE from 'three';

// متغيرات نحتفظ بها للوصول إلى بيانات المشهد الرئيسي
let getScene, getRoomLength, getRoomWidth, getRoomPolygon, isCabinetFn, smartSaveImageFn;

export function init2DBlueprint(sceneGetter, lengthGetter, widthGetter, polygonGetter, isCabinetChecker, saveImageCallback) {
    // ربط الدوال القادمة من الملف الرئيسي
    getScene = sceneGetter;
    getRoomLength = lengthGetter;
    getRoomWidth = widthGetter;
    getRoomPolygon = polygonGetter;
    isCabinetFn = isCabinetChecker;
    smartSaveImageFn = saveImageCallback;

    // جلب عناصر واجهة المستخدم
    const planToggleCheckbox = document.getElementById('plan2d-toggle-checkbox');
    const plan2dOverlay = document.getElementById('plan-2d-overlay');
    const close2DBtn = document.getElementById('close2DBtn');
    const planCanvas = document.getElementById('plan2d-canvas');
    const save2DImageBtn = document.getElementById('save2DImageBtn');
    const print2DBtn = document.getElementById('print2DBtn');

    const ctx = planCanvas ? planCanvas.getContext('2d') : null;

    // تفعيل وإلغاء المخطط عبر زر الـ Toggle
    if (planToggleCheckbox) {
        planToggleCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                plan2dOverlay.style.display = 'flex';
                generate2DPlan(ctx, planCanvas); // رسم المخطط
            } else {
                plan2dOverlay.style.display = 'none';
            }
        });
    }

    // إغلاق النافذة من زر الإغلاق
    if (close2DBtn) {
        close2DBtn.addEventListener('click', () => {
            plan2dOverlay.style.display = 'none';
            if (planToggleCheckbox) planToggleCheckbox.checked = false; // إطفاء زر الـ Toggle
        });
    }

    // --- وظيفة حفظ الصورة (Save as Image) ---
    if (save2DImageBtn && planCanvas) {
        save2DImageBtn.addEventListener('click', () => {
            const dataURL = planCanvas.toDataURL("image/png");
            const date = new Date();
            const fileName = `مخطط_مطبخ_${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}.png`;
            
            smartSaveImageFn(dataURL, fileName, 'مخطط المطبخ الهندسي');
        });
    }

    // --- وظيفة الطباعة (Print) ---
    if (print2DBtn && planCanvas) {
        print2DBtn.addEventListener('click', () => {
            const dataUrl = planCanvas.toDataURL("image/png");
            const printWin = window.open('', '_blank', 'width=900,height=700');

            printWin.document.open();
            printWin.document.write(`
                <!DOCTYPE html>
                <html lang="ar" dir="rtl">
                <head>
                    <title>طباعة المخطط الهندسي</title>
                    <style>
                        @page { size: landscape; margin: 0mm; }
                        body {
                            margin: 0; padding: 15mm; display: flex;
                            justify-content: center; align-items: center;
                            height: 100vh; box-sizing: border-box;
                            background-color: #fff; overflow: hidden;
                        }
                        img { max-width: 100%; max-height: 100%; object-fit: contain; }
                    </style>
                </head>
                <body>
                    <img src="${dataUrl}" alt="مخطط المطبخ">
                </body>
                </html>
            `);
            printWin.document.close();
            printWin.onload = function() {
                setTimeout(() => {
                    printWin.focus();
                    printWin.print();
                }, 250);
            };
        });
    }
}

function getPointBetween(p1, p2, ratio) {
    return {
        x: p1.x + (p2.x - p1.x) * ratio,
        y: p1.y + (p2.y - p1.y) * ratio
    };
}

function drawPlanDimLine(ctx, p1, p2, text, color, offsetPx, normalX, normalY) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    const x1 = p1.x + normalX * offsetPx;
    const y1 = p1.y + normalY * offsetPx;
    const x2 = p2.x + normalX * offsetPx;
    const y2 = p2.y + normalY * offsetPx;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const tick = 6;
    ctx.beginPath(); ctx.moveTo(x1 - normalY * tick, y1 + normalX * tick); ctx.lineTo(x1 + normalY * tick, y1 - normalX * tick); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2 - normalY * tick, y2 + normalX * tick); ctx.lineTo(x2 + normalY * tick, y2 - normalX * tick); ctx.stroke();

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const textPx = midX + normalX * 16;
    const textPy = midY + normalY * 16;

    ctx.font = "bold 15px Cairo, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const metrics = ctx.measureText(text);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(textPx - metrics.width / 2 - 4, textPy - 10, metrics.width + 8, 20, 3);
        ctx.fill();
    } else {
        ctx.fillRect(textPx - metrics.width / 2 - 4, textPy - 10, metrics.width + 8, 20);
    }

    ctx.fillStyle = color;
    ctx.fillText(text, textPx, textPy);

    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
}

function drawWallBreakdown(ctx, wallInfo, ptStart, ptEnd, normalX, normalY) {
    const lengthCm = wallInfo.length;
    if (!lengthCm || lengthCm <= 0) return;

    drawPlanDimLine(ctx, ptStart, ptEnd, `${lengthCm} سم`, "#e74c3c", 30, normalX, normalY);

    const types = [
        { key: 'floor', color: '#2ecc71', offset: 70 },
        { key: 'attached', color: '#f1c40f', offset: 110 },
        { key: 'double', color: '#3498db', offset: 150 }
    ];

    types.forEach(t => {
        const items = [...(wallInfo[t.key] || [])];
        if (items.length === 0) return;

        items.sort((a, b) => a.min - b.min);
        let currentPosCm = 0;

        items.forEach(cab => {
            if (cab.min - currentPosCm > 1) {
                const p1 = getPointBetween(ptStart, ptEnd, currentPosCm / lengthCm);
                const p2 = getPointBetween(ptStart, ptEnd, cab.min / lengthCm);
                drawPlanDimLine(ctx, p1, p2, `باقي: ${Math.round(cab.min - currentPosCm)}`, "#7f8c8d", t.offset, normalX, normalY);
            }

            const p1 = getPointBetween(ptStart, ptEnd, cab.min / lengthCm);
            const p2 = getPointBetween(ptStart, ptEnd, cab.max / lengthCm);
            drawPlanDimLine(ctx, p1, p2, `${Math.round(cab.width)} سم`, t.color, t.offset, normalX, normalY);

            currentPosCm = Math.max(currentPosCm, cab.max);
        });

        if (lengthCm - currentPosCm > 1) {
            const p1 = getPointBetween(ptStart, ptEnd, currentPosCm / lengthCm);
            const p2 = getPointBetween(ptStart, ptEnd, 1);
            drawPlanDimLine(ctx, p1, p2, `باقي: ${Math.round(lengthCm - currentPosCm)}`, "#7f8c8d", t.offset, normalX, normalY);
        }
    });
}

function snapBoxToCustomWalls(box, edges) {
    const snapped = {
        minX: box.min.x,
        maxX: box.max.x,
        minZ: box.min.z,
        maxZ: box.max.z
    };

    const wallTolerance = 0.06; // 6 سم لمعالجة نصف سماكة الحائط والفروقات البسيطة
    const minOverlapM = 0.05;

    edges.forEach(edge => {
        if (edge.axis === 'x') {
            const edgeMinX = Math.min(edge.p1.x, edge.p2.x);
            const edgeMaxX = Math.max(edge.p1.x, edge.p2.x);
            const overlapMin = Math.max(edgeMinX, snapped.minX);
            const overlapMax = Math.min(edgeMaxX, snapped.maxX);
            if ((overlapMax - overlapMin) < minOverlapM) return;

            const depth = snapped.maxZ - snapped.minZ;
            if (Math.abs(snapped.minZ - edge.p1.z) <= wallTolerance) {
                snapped.minZ = edge.p1.z;
                snapped.maxZ = edge.p1.z + depth;
            } else if (Math.abs(snapped.maxZ - edge.p1.z) <= wallTolerance) {
                snapped.maxZ = edge.p1.z;
                snapped.minZ = edge.p1.z - depth;
            }
        } else {
            const edgeMinZ = Math.min(edge.p1.z, edge.p2.z);
            const edgeMaxZ = Math.max(edge.p1.z, edge.p2.z);
            const overlapMin = Math.max(edgeMinZ, snapped.minZ);
            const overlapMax = Math.min(edgeMaxZ, snapped.maxZ);
            if ((overlapMax - overlapMin) < minOverlapM) return;

            const width = snapped.maxX - snapped.minX;
            if (Math.abs(snapped.minX - edge.p1.x) <= wallTolerance) {
                snapped.minX = edge.p1.x;
                snapped.maxX = edge.p1.x + width;
            } else if (Math.abs(snapped.maxX - edge.p1.x) <= wallTolerance) {
                snapped.maxX = edge.p1.x;
                snapped.minX = edge.p1.x - width;
            }
        }
    });

    return snapped;
}

function buildCustomWallData(scene, roomPolygon) {
    const signedArea = roomPolygon.reduce((sum, p, i) => {
        const next = roomPolygon[(i + 1) % roomPolygon.length];
        return sum + ((p.x * next.z) - (next.x * p.z));
    }, 0) / 2;
    const isCCW = signedArea > 0;

    const edges = roomPolygon.map((p1, i) => {
        const p2 = roomPolygon[(i + 1) % roomPolygon.length];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const lenM = Math.hypot(dx, dz);
        if (lenM < 0.01) return null;

        const axis = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
        const inwardNormal = isCCW
            ? { x: -dz / lenM, z: dx / lenM }
            : { x: dz / lenM, z: -dx / lenM };

        return {
            p1,
            p2,
            axis,
            inwardNormal,
            length: Math.round(lenM * 100),
            floor: [],
            attached: [],
            double: []
        };
    }).filter(Boolean);

    scene.children.forEach(obj => {
        if (!isCabinetFn(obj)) return;

        const box = new THREE.Box3().setFromObject(obj);
        const snappedBox = snapBoxToCustomWalls(box, edges);
        const minY_cm = box.min.y * 100;
        const maxY_cm = box.max.y * 100;
        const categories = [];

        if (minY_cm <= 87 && maxY_cm >= 5) categories.push('floor');
        if (minY_cm <= 222 && maxY_cm >= 150) categories.push('attached');
        if (minY_cm <= 262 && maxY_cm >= 223) categories.push('double');
        if (categories.length === 0) return;

        const wallTolerance = 0.15;
        const minOverlapM = 0.05;

        edges.forEach(edge => {
            let touchDist;
            let overlapMin;
            let overlapMax;
            let segStart;
            let segEnd;

            if (edge.axis === 'x') {
                touchDist = Math.abs((edge.inwardNormal.z >= 0 ? snappedBox.minZ : snappedBox.maxZ) - edge.p1.z);
                overlapMin = Math.max(Math.min(edge.p1.x, edge.p2.x), snappedBox.minX);
                overlapMax = Math.min(Math.max(edge.p1.x, edge.p2.x), snappedBox.maxX);
                if (touchDist > wallTolerance || (overlapMax - overlapMin) < minOverlapM) return;

                if (edge.p2.x >= edge.p1.x) {
                    segStart = overlapMin;
                    segEnd = overlapMax;
                } else {
                    segStart = overlapMax;
                    segEnd = overlapMin;
                }
            } else {
                touchDist = Math.abs((edge.inwardNormal.x >= 0 ? snappedBox.minX : snappedBox.maxX) - edge.p1.x);
                overlapMin = Math.max(Math.min(edge.p1.z, edge.p2.z), snappedBox.minZ);
                overlapMax = Math.min(Math.max(edge.p1.z, edge.p2.z), snappedBox.maxZ);
                if (touchDist > wallTolerance || (overlapMax - overlapMin) < minOverlapM) return;

                if (edge.p2.z >= edge.p1.z) {
                    segStart = overlapMin;
                    segEnd = overlapMax;
                } else {
                    segStart = overlapMax;
                    segEnd = overlapMin;
                }
            }

            const minPos = Math.abs(segStart - (edge.axis === 'x' ? edge.p1.x : edge.p1.z)) * 100;
            const maxPos = Math.abs(segEnd - (edge.axis === 'x' ? edge.p1.x : edge.p1.z)) * 100;
            const width = Math.round((overlapMax - overlapMin) * 100);
            if (width <= 5) return;

            const pushData = {
                min: Math.min(minPos, maxPos),
                max: Math.max(minPos, maxPos),
                width
            };

            categories.forEach(category => edge[category].push(pushData));
        });
    });

    return edges;
}

function projectCustomBoxToWall(box, edges, padding, minX, minZ, scale) {
    const snappedBox = snapBoxToCustomWalls(box, edges);
    const drawMinX = snappedBox.minX;
    const drawMaxX = snappedBox.maxX;
    const drawMinZ = snappedBox.minZ;
    const drawMaxZ = snappedBox.maxZ;

    return {
        x: padding + ((drawMinX - minX) * 100 * scale),
        y: padding + ((drawMinZ - minZ) * 100 * scale),
        w: (drawMaxX - drawMinX) * 100 * scale,
        h: (drawMaxZ - drawMinZ) * 100 * scale
    };
}

function drawPlanLegend(ctx, planCanvas) {
    const legendItems = [
        { label: "قياس الحوائط", color: "#e74c3c" },
        { label: "كابينات أرضية", color: "#2ecc71" },
        { label: "كابينات معلقة", color: "#f1c40f" },
        { label: "دبل ملحق", color: "#3498db" },
        { label: "الفراغ (باقي)", color: "#7f8c8d" }
    ];

    const legendY = planCanvas.height - 40;
    const boxSize = 18;
    const itemSpacing = 160;
    const totalLegendWidth = (legendItems.length * itemSpacing);
    let currentX = (planCanvas.width + totalLegendWidth) / 2 - (itemSpacing / 2);

    ctx.save();
    ctx.font = "bold 15px Cairo, Arial";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#f8f9fa";
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect((planCanvas.width - totalLegendWidth) / 2 - 30, legendY - 25, totalLegendWidth + 20, 50, 8);
        ctx.fill();
    } else {
        ctx.fillRect((planCanvas.width - totalLegendWidth) / 2 - 30, legendY - 25, totalLegendWidth + 20, 50);
    }

    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    ctx.stroke();

    legendItems.forEach(item => {
        ctx.fillStyle = "#34495e";
        ctx.textAlign = "right";
        ctx.fillText(item.label, currentX - boxSize - 8, legendY);

        ctx.fillStyle = item.color;
        ctx.fillRect(currentX - boxSize, legendY - (boxSize / 2), boxSize, boxSize);
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.strokeRect(currentX - boxSize, legendY - (boxSize / 2), boxSize, boxSize);

        currentX -= itemSpacing;
    });
    ctx.restore();
}

function drawCabinetsOnPlan(ctx, scene, mapBoxToPlan) {
    const cabinetsToDraw = [];
    const typesColors = {
        floor: { border: '#27ae60', fill: 'rgba(46, 204, 113, 0.4)' },
        attached: { border: '#f39c12', fill: 'rgba(241, 196, 15, 0.4)' },
        double: { border: '#2980b9', fill: 'rgba(52, 152, 219, 0.4)' }
    };

    scene.children.forEach(obj => {
        if (!isCabinetFn(obj)) return;

        const box = new THREE.Box3().setFromObject(obj);
        const minY_cm = box.min.y * 100;
        const maxY_cm = box.max.y * 100;

        const occupiesFloor = (minY_cm <= 87 && maxY_cm >= 5);
        const occupiesAttached = (minY_cm <= 222 && maxY_cm >= 150);
        const occupiesDouble = (minY_cm <= 262 && maxY_cm >= 223);

        if (!occupiesFloor && !occupiesAttached && !occupiesDouble) return;

        const mapped = mapBoxToPlan(box);
        if (!mapped) return;

        if (occupiesFloor) cabinetsToDraw.push({ type: 'floor', ...mapped });
        if (occupiesAttached) cabinetsToDraw.push({ type: 'attached', ...mapped });
        if (occupiesDouble) cabinetsToDraw.push({ type: 'double', ...mapped });
    });

    const order = { floor: 1, attached: 2, double: 3 };
    cabinetsToDraw.sort((a, b) => order[a.type] - order[b.type]);

    cabinetsToDraw.forEach(cab => {
        const colors = typesColors[cab.type];
        ctx.save();
        ctx.fillStyle = colors.fill;
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 2;

        ctx.fillRect(cab.x, cab.y, cab.w, cab.h);
        ctx.strokeRect(cab.x, cab.y, cab.w, cab.h);

        if (cab.type === 'attached' || cab.type === 'double') {
            ctx.beginPath();
            ctx.moveTo(cab.x, cab.y);
            ctx.lineTo(cab.x + cab.w, cab.y + cab.h);
            ctx.moveTo(cab.x + cab.w, cab.y);
            ctx.lineTo(cab.x, cab.y + cab.h);
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.stroke();
        }
        ctx.restore();
    });
}

function drawCustomRoomPlan(ctx, planCanvas, scene, roomPolygon) {
    const scale = 2;
    const padding = 250;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

    roomPolygon.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
    });

    const wPx = Math.max(1, Math.round((maxX - minX) * 100 * scale));
    const hPx = Math.max(1, Math.round((maxZ - minZ) * 100 * scale));
    planCanvas.width = wPx + (padding * 2);
    planCanvas.height = hPx + (padding * 2) + 80;
    ctx.clearRect(0, 0, planCanvas.width, planCanvas.height);

    const toCanvas = (x, z) => ({
        x: padding + ((x - minX) * 100 * scale),
        y: padding + ((z - minZ) * 100 * scale)
    });

    const polygonPx = roomPolygon.map(p => toCanvas(p.x, p.z));

    ctx.beginPath();
    ctx.moveTo(polygonPx[0].x, polygonPx[0].y);
    for (let i = 1; i < polygonPx.length; i++) {
        ctx.lineTo(polygonPx[i].x, polygonPx[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = "#ecf0f1";
    ctx.strokeStyle = "#34495e";
    ctx.lineWidth = 6;
    ctx.fill();
    ctx.stroke();

    const edgesData = buildCustomWallData(scene, roomPolygon);
    drawCabinetsOnPlan(ctx, scene, (box) => projectCustomBoxToWall(box, edgesData, padding, minX, minZ, scale));
    const centroid = polygonPx.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    centroid.x /= polygonPx.length;
    centroid.y /= polygonPx.length;

    for (let i = 0; i < polygonPx.length; i++) {
        const wp1 = roomPolygon[i];
        const wp2 = roomPolygon[(i + 1) % roomPolygon.length];
        const cp1 = polygonPx[i];
        const cp2 = polygonPx[(i + 1) % polygonPx.length];
        const dx = cp2.x - cp1.x;
        const dy = cp2.y - cp1.y;
        const len = Math.hypot(dx, dy) || 1;

        const normalA = { x: -dy / len, y: dx / len };
        const normalB = { x: dy / len, y: -dx / len };
        const mid = { x: (cp1.x + cp2.x) / 2, y: (cp1.y + cp2.y) / 2 };
        const distA = Math.hypot((mid.x + normalA.x * 40) - centroid.x, (mid.y + normalA.y * 40) - centroid.y);
        const distB = Math.hypot((mid.x + normalB.x * 40) - centroid.x, (mid.y + normalB.y * 40) - centroid.y);
        const normal = distA > distB ? normalA : normalB;

        drawWallBreakdown(ctx, edgesData[i], cp1, cp2, normal.x, normal.y);
    }

    drawPlanLegend(ctx, planCanvas);
}

function generate2DPlan(ctx, planCanvas) {
    if (!ctx) return;

    // جلب القياسات من المشهد الرئيسي
    const currentRoomLength = getRoomLength();
    const currentRoomWidth = getRoomWidth();
    const scene = getScene();
    const roomPolygon = getRoomPolygon ? getRoomPolygon() : null;

    if (Array.isArray(roomPolygon) && roomPolygon.length >= 3) {
        drawCustomRoomPlan(ctx, planCanvas, scene, roomPolygon);
        return;
    }

    // مقياس الرسم (كل 1 سم = 2 بكسل)
    const scale = 2; 
    const padding = 250; // مساحة فارغة للخطوط الخارجية

    // حساب حجم الكانفاس
    const wPx = currentRoomLength * scale;
    const hPx = currentRoomWidth * scale;
    planCanvas.width = wPx + (padding * 2);
    planCanvas.height = hPx + (padding * 2) + 80;

    ctx.clearRect(0, 0, planCanvas.width, planCanvas.height);
    
    // رسم الجدران
    const startX = padding;
    const startY = padding;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#34495e";
    ctx.strokeRect(startX, startY, wPx, hPx);
    ctx.fillStyle = "#ecf0f1";
    ctx.fillRect(startX, startY, wPx, hPx);

    const L = currentRoomLength;
    const W = currentRoomWidth;

    const wallsData = {
        top: { length: L, floor: [], attached: [], double: [] },
        bottom: { length: L, floor: [], attached: [], double: [] },
        left: { length: W, floor: [], attached: [], double: [] },
        right: { length: W, floor: [], attached: [], double: [] }
    };

    const cabinetsToDraw = [];
    const L_m = L / 100;
    const W_m = W / 100;

    scene.children.forEach(obj => {
        if (isCabinetFn(obj)) { // استخدمنا دالة التحقق الممررة
            const box = new THREE.Box3().setFromObject(obj);
            const minY_cm = box.min.y * 100;
            const maxY_cm = box.max.y * 100;

            const occupiesFloor = (minY_cm <= 87 && maxY_cm >= 5);
            const occupiesAttached = (minY_cm <= 222 && maxY_cm >= 150);
            const occupiesDouble = (minY_cm <= 262 && maxY_cm >= 223);

            if (!occupiesFloor && !occupiesAttached && !occupiesDouble) return;

            let distTop = Math.abs(box.min.z - (-W_m/2));
            let distBottom = Math.abs(box.max.z - (W_m/2));
            let distLeft = Math.abs(box.min.x - (-L_m/2));
            let distRight = Math.abs(box.max.x - (L_m/2));

            let minDist = Math.min(distTop, distBottom, distLeft, distRight);
            let primaryWall = '';
            if (minDist === distTop) primaryWall = 'top';
            else if (minDist === distBottom) primaryWall = 'bottom';
            else if (minDist === distLeft) primaryWall = 'left';
            else primaryWall = 'right';

            let wallsToAssign = [primaryWall];
            const cornerTolerance = 0.15;
            if (primaryWall === 'top' || primaryWall === 'bottom') {
                if (distLeft <= cornerTolerance) wallsToAssign.push('left');
                if (distRight <= cornerTolerance) wallsToAssign.push('right');
            } else {
                if (distTop <= cornerTolerance) wallsToAssign.push('top');
                if (distBottom <= cornerTolerance) wallsToAssign.push('bottom');
            }

            wallsToAssign.forEach(wallKey => {
                let cabW = 0, minPos = 0, maxPos = 0;

                if (wallKey === 'top' || wallKey === 'bottom') {
                    cabW = (box.max.x - box.min.x) * 100;
                    minPos = (box.min.x + L_m/2) * 100;
                    maxPos = (box.max.x + L_m/2) * 100;
                } else {
                    cabW = (box.max.z - box.min.z) * 100;
                    minPos = (box.min.z + W_m/2) * 100;
                    maxPos = (box.max.z + W_m/2) * 100;
                }

                if (cabW > 5) { 
                    const pushData = { min: minPos, max: maxPos, width: Math.round(cabW) };
                    if (occupiesFloor) wallsData[wallKey].floor.push(pushData);
                    if (occupiesAttached) wallsData[wallKey].attached.push(pushData);
                    if (occupiesDouble) wallsData[wallKey].double.push(pushData);
                }
            });

            const cabW_px = (box.max.x - box.min.x) * 100 * scale;
            const cabD_px = (box.max.z - box.min.z) * 100 * scale;
            const x_px = startX + (box.min.x + (L_m / 2)) * 100 * scale;
            const y_px = startY + (box.min.z + (W_m / 2)) * 100 * scale;

            if (occupiesFloor) cabinetsToDraw.push({ type: 'floor', x: x_px, y: y_px, w: cabW_px, h: cabD_px });
            if (occupiesAttached) cabinetsToDraw.push({ type: 'attached', x: x_px, y: y_px, w: cabW_px, h: cabD_px });
            if (occupiesDouble) cabinetsToDraw.push({ type: 'double', x: x_px, y: y_px, w: cabW_px, h: cabD_px });
        }
    });

    const typesColors = {
        'floor': { border: '#27ae60', fill: 'rgba(46, 204, 113, 0.4)' },
        'attached': { border: '#f39c12', fill: 'rgba(241, 196, 15, 0.4)' },
        'double': { border: '#2980b9', fill: 'rgba(52, 152, 219, 0.4)' }
    };

    const order = { 'floor': 1, 'attached': 2, 'double': 3 };
    cabinetsToDraw.sort((a, b) => order[a.type] - order[b.type]);

    cabinetsToDraw.forEach(cab => {
        const colors = typesColors[cab.type];
        ctx.save();
        ctx.fillStyle = colors.fill;
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 2;
        
        ctx.fillRect(cab.x, cab.y, cab.w, cab.h);
        ctx.strokeRect(cab.x, cab.y, cab.w, cab.h);
        
        if (cab.type === 'attached' || cab.type === 'double') {
            ctx.beginPath();
            ctx.moveTo(cab.x, cab.y);
            ctx.lineTo(cab.x + cab.w, cab.y + cab.h);
            ctx.moveTo(cab.x + cab.w, cab.y);
            ctx.lineTo(cab.x, cab.y + cab.h);
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.stroke();
        }
        ctx.restore();
    });

    function getPointBetween(p1, p2, ratio) {
        return {
            x: p1.x + (p2.x - p1.x) * ratio,
            y: p1.y + (p2.y - p1.y) * ratio
        };
    }

    function drawDimLine(p1, p2, text, color, offsetPx, normalX, normalY) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        const x1 = p1.x + normalX * offsetPx;
        const y1 = p1.y + normalY * offsetPx;
        const x2 = p2.x + normalX * offsetPx;
        const y2 = p2.y + normalY * offsetPx;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const tick = 6;
        ctx.beginPath(); ctx.moveTo(x1 - normalY * tick, y1 + normalX * tick); ctx.lineTo(x1 + normalY * tick, y1 - normalX * tick); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2 - normalY * tick, y2 + normalX * tick); ctx.lineTo(x2 + normalY * tick, y2 - normalX * tick); ctx.stroke();

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const textPx = midX + normalX * 16;
        const textPy = midY + normalY * 16;

        ctx.font = "bold 15px Cairo, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const metrics = ctx.measureText(text);
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        if(ctx.roundRect) {
            ctx.beginPath(); ctx.roundRect(textPx - metrics.width/2 - 4, textPy - 10, metrics.width + 8, 20, 3); ctx.fill();
        } else {
            ctx.fillRect(textPx - metrics.width/2 - 4, textPy - 10, metrics.width + 8, 20);
        }

        ctx.fillStyle = color;
        ctx.fillText(text, textPx, textPy);

        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(x2, y2); ctx.stroke();

        ctx.restore();
    }

    function processWall(wallKey, ptStart, ptEnd, normalX, normalY) {
        const wallInfo = wallsData[wallKey];
        const lengthCm = wallInfo.length;

        drawDimLine(ptStart, ptEnd, `${lengthCm} سم`, "#e74c3c", 30, normalX, normalY);

        const types = [
            { key: 'floor', color: '#2ecc71', offset: 70 },
            { key: 'attached', color: '#f1c40f', offset: 110 },
            { key: 'double', color: '#3498db', offset: 150 }
        ];

        types.forEach(t => {
            let items = wallInfo[t.key];
            if (items.length === 0) return;

            items.sort((a, b) => a.min - b.min);
            let currentPosCm = 0;

            items.forEach(cab => {
                if (cab.min - currentPosCm > 1) {
                    let p1 = getPointBetween(ptStart, ptEnd, currentPosCm / lengthCm);
                    let p2 = getPointBetween(ptStart, ptEnd, cab.min / lengthCm);
                    drawDimLine(p1, p2, `باقي: ${Math.round(cab.min - currentPosCm)}`, "#7f8c8d", t.offset, normalX, normalY);
                }

                let p1 = getPointBetween(ptStart, ptEnd, cab.min / lengthCm);
                let p2 = getPointBetween(ptStart, ptEnd, cab.max / lengthCm);
                drawDimLine(p1, p2, `${Math.round(cab.width)} سم`, t.color, t.offset, normalX, normalY);

                currentPosCm = Math.max(currentPosCm, cab.max);
            });

            if (lengthCm - currentPosCm > 1) {
                let p1 = getPointBetween(ptStart, ptEnd, currentPosCm / lengthCm);
                let p2 = getPointBetween(ptStart, ptEnd, 1);
                drawDimLine(p1, p2, `باقي: ${Math.round(lengthCm - currentPosCm)}`, "#7f8c8d", t.offset, normalX, normalY);
            }
        });
    }

    processWall('top', {x: startX, y: startY}, {x: startX + wPx, y: startY}, 0, -1);
    processWall('bottom', {x: startX, y: startY + hPx}, {x: startX + wPx, y: startY + hPx}, 0, 1);
    processWall('left', {x: startX, y: startY}, {x: startX, y: startY + hPx}, -1, 0);
    processWall('right', {x: startX + wPx, y: startY}, {x: startX + wPx, y: startY + hPx}, 1, 0);

    const legendItems = [
        { label: "قياس الحوائط", color: "#e74c3c" },
        { label: "كابينات أرضية", color: "#2ecc71" },
        { label: "كابينات معلقة", color: "#f1c40f" },
        { label: "دبل ملحق", color: "#3498db" },
        { label: "الفراغ (باقي)", color: "#7f8c8d" }
    ];

    const legendY = planCanvas.height - 40;
    const boxSize = 18; 
    const itemSpacing = 160; 

    const totalLegendWidth = (legendItems.length * itemSpacing);
    let currentX = (planCanvas.width + totalLegendWidth) / 2 - (itemSpacing / 2); 

    ctx.save();
    ctx.font = "bold 15px Cairo, Arial";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#f8f9fa";
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect((planCanvas.width - totalLegendWidth) / 2 - 30, legendY - 25, totalLegendWidth + 20, 50, 8);
        ctx.fill();
    } else {
        ctx.fillRect((planCanvas.width - totalLegendWidth) / 2 - 30, legendY - 25, totalLegendWidth + 20, 50);
    }
    
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    ctx.stroke();

    legendItems.forEach(item => {
        ctx.fillStyle = "#34495e";
        ctx.textAlign = "right";
        ctx.fillText(item.label, currentX - boxSize - 8, legendY);

        ctx.fillStyle = item.color;
        ctx.fillRect(currentX - boxSize, legendY - (boxSize / 2), boxSize, boxSize);
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.strokeRect(currentX - boxSize, legendY - (boxSize / 2), boxSize, boxSize);

        currentX -= itemSpacing;
    });
    ctx.restore();
}