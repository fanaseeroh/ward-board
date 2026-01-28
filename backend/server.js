require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();                 // ✅ ต้องมี
const db = require("./db");            // ✅ ใช้ db ครั้งเดียว
const layout = require("./beds.config");

app.use(cors());
app.use(express.json());

/* ============================
   TEST DB CONNECTION
============================ */
db.query("SELECT NOW()")
  .then(res => {
    console.log("✅ PostgreSQL connected:", res.rows[0]);
  })
  .catch(err => {
    console.error("❌ Connection error", err);
  });

/* ============================
   1) เตรียม MASTER BED SET
============================ */
const ALL_BEDS = new Set();
layout.zones.forEach(zone => {
  zone.rooms.forEach(bed => ALL_BEDS.add(bed));
});

/* ============================
   2) FETCH DATA FROM DB
============================ */
async function fetchPatientsFromDB() {
  const sql = `
    SELECT  
  ipt.ward,
  CAST(CONCAT(spclty.name,' - ',w.name) AS VARCHAR(250)) AS spclty_ward_name,
  iptadm.bedno,
  roomno.name AS roomname,
  iptadm.roomno,
  CAST(CONCAT(patient.pname,patient.fname,' ',patient.lname) AS VARCHAR(250)) AS patient_name,
  patient.sex,
  CASE 
    WHEN patient.sex = '1' THEN 'ชาย'
    ELSE 'หญิง'
  END AS sex_name,
  ipt.hn,
  ipt.vn,
  ipt.an,
  aa.age_y,
  aa.age_m,
  aa.age_d,
  ptt.name AS pttype_name,
  ipt.admdoctor,
  dt.name AS admdoctor_name,         
  dct1.name AS incharge_doctor_name,
  dct1.name AS owner_doctor_name,
  ipt.regdate,
  ipt.regtime,
  aa.admdate, 
  ia.ipt_admit_type_name,   
  ipt.bw / 1000.0 AS bw, 
  ipt.body_height,
  ipt.lab_status,
  ipt.xray_status
FROM ipt        
LEFT JOIN spclty ON spclty.spclty = ipt.spclty        
LEFT JOIN iptadm ON iptadm.an = ipt.an   
LEFT JOIN bedno bn ON bn.bedno = iptadm.bedno        
LEFT JOIN patient ON patient.hn = ipt.hn       
LEFT JOIN doctor dt ON dt.code = ipt.admdoctor         
LEFT JOIN roomno ON roomno.roomno = iptadm.roomno                         
LEFT JOIN an_stat aa ON aa.an = ipt.an           
LEFT JOIN ward w ON w.ward = ipt.ward                   
LEFT JOIN doctor di ON di.code = ipt.incharge_doctor    
LEFT JOIN ipt_admit_type ia 
       ON ia.ipt_admit_type_id = ipt.ipt_admit_type_id  
LEFT JOIN ipt_pttype ip1 
       ON ip1.an = ipt.an 
      AND ip1.pttype_number = 1   
LEFT JOIN pttype ptt 
       ON ptt.pttype = ip1.pttype    
LEFT JOIN ipt_doctor_list il1 
       ON il1.an = ipt.an 
      AND il1.ipt_doctor_type_id = 1 
      AND il1.active_doctor = 'Y'   
LEFT JOIN doctor dct1 
       ON dct1.code = il1.doctor  
WHERE ipt.ward = '07'
  AND ipt.confirm_discharge = 'N'
ORDER BY ipt.regdate, ipt.regtime;

  `;

  const result = await db.query(sql);
  return result.rows;                  // ✅ ถูกต้อง
}

function normalizeBed(bedCode) {
  if (!bedCode) return null;

  let code = bedCode
    .toString()
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();

  // แปลงเลขไทย → เลขอารบิก
  const thaiNums = { '๐':'0','๑':'1','๒':'2','๓':'3','๔':'4','๕':'5','๖':'6','๗':'7','๘':'8','๙':'9' };
  code = code.replace(/[๐-๙]/g, d => thaiNums[d]);

  /**
   * ✅ เฉพาะ S01 / B01 / P01 ให้ pad
   * ❌ เตียงภาษาไทย เช่น ชบ2 ไม่ pad
   */
  const match = code.match(/^([A-Z]+)(\d+)$/);
  if (match) {
    return match[1] + match[2].padStart(2, '0');
  }

  return code;
}

function isValidBed(bedCode) {
  const bed = normalizeBed(bedCode);
  return bed && ALL_BEDS.has(bed);
}

/* ============================
   3) PROCESS PATIENTS
============================ */
function processPatients(patients) {
  const occupiedMap = new Map();
  const waiting = [];

  patients.forEach(p => {
    const bed = normalizeBed(p.bedno);


    if (isValidBed(bed)) {
      if (occupiedMap.has(bed)) {
        waiting.push({ ...p, bed_code: bed, reason: "DUPLICATE_BED" });
      } else {
        occupiedMap.set(bed, { ...p, bedno: bed });
      }
    } else {
      waiting.push({
        ...p,
        bed_code: bed,
        reason: bed ? "INVALID_BED_CODE" : "NO_BED"
      });
    }
  });

  return { occupiedMap, waiting };
}

/* ============================
   4) BUILD BOARD
============================ */
function buildBoard(layout, occupiedMap, waiting) {
  return {
    updated_at: new Date().toISOString(),
    zones: layout.zones.map(zone => ({
      id: zone.id,
      title: zone.title,
      rooms: zone.rooms.map(bed => ({
        room: bed,
        beds: [{
          bed,
          status: occupiedMap.has(bed) ? "occupied" : "empty",
          patient: occupiedMap.get(bed) || null
        }]
      }))
    })),
    center: {
      title: "NURSE STATION",
      subtitle: "รอรับ",
      waiting
    }
  };
}

/* ============================
   5) API
============================ */
app.get("/api/board", async (req, res) => {
  try {
    const patients = await fetchPatientsFromDB();
    const { occupiedMap, waiting } = processPatients(patients);
    const board = buildBoard(layout, occupiedMap, waiting);

    res.json({ ok: true, data: board });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      message: "ไม่สามารถดึงข้อมูลผู้ป่วยได้"
    });
  }
});

app.get("/api/beds", (req, res) => {
  res.json({ ok: true, beds: Array.from(ALL_BEDS) });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "UP" });
});

/* ============================
   6) START SERVER
============================ */
const PORT = Number(process.env.PORT || 3001);
const HOST = '0.0.0.0';   // ⭐ สำคัญ

app.listen(PORT, HOST, () => {
  console.log(`✅ Backend running on http://192.168.4.217:${PORT}`);
});

/* ============================
   7) API ดึงข้อมูลผู้ป่วยรายเตียง
============================ */
app.get('/api/bed-detail/:bedno', async (req, res) => {
  const { bedno } = req.params;

  try {
    const sql = `
      SELECT  
        iptadm.bedno,
        ipt.an,
        ipt.hn,
        CONCAT(patient.pname,patient.fname,' ',patient.lname) AS patient_name,
        aa.age_y,
        aa.age_m,
        aa.age_d,
        ipt.regdate AS regdate,
        aa.admdate,
        
        ptt.name AS pttype_name,
        dt.name AS admdoctor_name
      FROM ipt        
      LEFT JOIN iptadm ON iptadm.an = ipt.an   
      LEFT JOIN patient ON patient.hn = ipt.hn       
      LEFT JOIN an_stat aa ON aa.an = ipt.an
      LEFT JOIN ipt_pttype ip1 ON ip1.an = ipt.an AND ip1.pttype_number = 1
      LEFT JOIN pttype ptt ON ptt.pttype = ip1.pttype
      LEFT JOIN doctor dt ON dt.code = ipt.admdoctor
      WHERE TRIM(UPPER(iptadm.bedno)) = TRIM(UPPER($1))


        AND ipt.confirm_discharge = 'N'
      LIMIT 1
    `;

    const result = await db.query(sql, [bedno]);

    if (result.rows.length === 0) {
      return res.json({ ok: false, message: 'ไม่พบผู้ป่วยในเตียงนี้' });
    }

    res.json({ ok: true, data: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
