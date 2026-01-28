import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { interval, Subscription } from 'rxjs';
import { PLATFORM_ID,HostListener } from '@angular/core';
import { environment } from '../environments/environment';
import { ChangeDetectorRef } from '@angular/core';
import { NgZone } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';

type BedStatus = 'occupied' | 'empty' | 'cleaning' | 'reserved';

interface Bed {
  bed: string;
  status: BedStatus;
  note?: string;
}

interface Room {
  room: string;
  beds: Bed[];
}

interface Zone {
  id: string;
  title: string;
  color: 'pink' | 'blue' | 'green' | 'orange' | 'purple';
  rooms: Room[];
}

interface BoardData {
  updated_at: string;
  zones: Zone[];
  center: { title: string; subtitle: string };
}


@Component({
  selector: 'app-ward-board',
  standalone: true,
  imports: [CommonModule,DragDropModule,FormsModule ],
  templateUrl: './ward-board.component.html',
  styleUrls: ['./ward-board.component.css']
})
export class WardBoardComponent implements OnInit, OnDestroy {

selectedBed: {
  bedno: string;
  room?: string;
  zone?: string;
} | null = null;

  isCollapsed = false;
  noteText: string = '';
  notePosition = { x: 0, y: 0 };
  thaiDateTime = '';
  showLegend = false;

  clockSub?: Subscription;

  loading = true;
  isFullscreen = false;

  isRefreshing = false;
  selectedPatient: any = null;
  showModal = false;
  refreshSub?: Subscription;
  data: any;
  error: string | null = null;
constructor(
  @Inject(PLATFORM_ID) private platformId: Object,
  private cdr: ChangeDetectorRef
) {}

 ngOnInit(): void {
  if (isPlatformBrowser(this.platformId)) {

    this.loadBoard();

    this.refreshSub = interval(20000).subscribe(() => {
      this.loadBoard();
    });

    // 🔥 FIX: กลับเข้า Angular zone
  
      this.clockSub = interval(1000).subscribe(() => {
        this.updateThaiClock();
        this.cdr.detectChanges();
      });
      
        document.addEventListener('fullscreenchange', () => {
        this.isFullscreen = !!document.fullscreenElement;
        this.cdr.detectChanges();
      });
      // ===== โหลด note จาก localStorage =====
      const savedNote = localStorage.getItem('floatingNote');
      if (savedNote) {
        const parsed = JSON.parse(savedNote);
        this.noteText = parsed.text || '';
        this.notePosition = parsed.position || { x: 0, y: 0 };
      }

  }
}
openLegend() {
  this.showLegend = true;
}

closeLegend() {
  this.showLegend = false;
}
saveNote() {
  localStorage.setItem(
    'floatingNote',
    JSON.stringify({
      text: this.noteText,
      position: this.notePosition
    })
  );
}
toggleNote() {
  this.isCollapsed = !this.isCollapsed;
}
onNoteDragEnd(event: any) {
  this.notePosition = {
    x: event.source.getFreeDragPosition().x,
    y: event.source.getFreeDragPosition().y
  };
  this.saveNote();
}

updateThaiClock() {
  const d = new Date();

  const months = [
    'มค', 'กพ', 'มีค', 'เมย', 'พค', 'มิย',
    'กค', 'สค', 'กย', 'ตค', 'พย', 'ธค'
  ];

  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear() + 543;

  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');

  this.thaiDateTime = `${day} ${month} ${year} ${hh}:${mm}:${ss} น.`;
}

  async loadBoard() {
    try {
      const res = await fetch(`${environment.apiUrl}/api/board`);

      const json = await res.json();
      if (!json.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      this.data = json.data;
      this.data.zones.forEach((zone: any) => {
      zone.rooms.forEach((room: any) => {
        room.beds.forEach((bed: any) => {
          if (bed.patient && bed.patient.age_y !== undefined) {
            bed.ageType = this.getAgeType(bed.patient);
            bed.sexType = this.getSexType(bed.patient);
          } else {
            bed.ageType = null;
          }
        });
      });
    });
      this.error = '';
    } catch (e: any) {
      this.error = e?.message || 'เกิดข้อผิดพลาด';
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
    this.clockSub?.unsubscribe();
  }

  zoneBorder(z: Zone) {
    const map: any = {
      pink: 'border-pink-300 bg-pink-50',
      blue: 'border-sky-300 bg-sky-50',
      green: 'border-emerald-300 bg-emerald-50',
      orange: 'border-orange-300 bg-orange-50',
      purple: 'border-violet-300 bg-violet-50',
    };
    return map[z.color] || 'border-slate-200 bg-white';
  }

  bedClass(status: BedStatus) {
    if (status === 'occupied') return 'bg-lime-400';
    if (status === 'cleaning') return 'bg-yellow-300';
    if (status === 'reserved') return 'bg-sky-200';
    return 'bg-white';
  }

  bedBadge(status: BedStatus) {
    if (status === 'occupied') return 'มีผู้ป่วย';
    if (status === 'cleaning') return 'ทำความสะอาด';
    if (status === 'reserved') return 'จอง';
    return 'ว่าง';
  }

  trackByRoom = (_: number, r: Room) => r.room;

  getAgeType(patient: any): 'child' | 'adult' | 'elder' | null {
  if (!patient || patient.age_y === null || patient.age_y === undefined) {
    return null;
  }

  const age = Number(patient.age_y);

  if (age < 12) {
    return 'child';
  } else if (age >= 12 && age <= 59) {
    return 'adult';
  } else {
    return 'elder';
  }
}
getSexType(patient: any): 'male' | 'female' {
  if (!patient) return 'male';

  // รองรับทั้งเลขและข้อความ
  if (patient.sex === '1' || patient.sex_name === 'ชาย') {
    return 'male';
  }
  return 'female';
}
getLabStatus(bed: any): 'W' | 'C' | 'N' | 'Y' | 'OTHER' | null {
  // ❌ ไม่มีผู้ป่วย = ไม่ต้องแสดง
  if (!bed?.patient) return null;

  const status = bed.patient.lab_status;

  // ❌ ไม่มีรายการ Lab
  if (!status) return null;

  const s = status.toString().toUpperCase();

  // I = มีคำสั่ง แต่ยังไม่ถึงขั้นแสดง
  if (s === 'I') return null;

  if (['W', 'C', 'N', 'Y'].includes(s)) return s as any;

  return 'OTHER';
}

getXrayStatus(bed: any): 'W' | 'C' | 'N' | 'Y' | 'OTHER' | null {
  if (!bed?.patient) return null;

  const status = bed.patient.xray_status;
  if (!status) return null;

  const s = status.toString().toUpperCase();
  if (s === 'I') return null;

  if (['W', 'C', 'N', 'Y'].includes(s)) return s as any;

  return 'OTHER';
}

  get waitingList() {
    return this.data?.center?.waiting || [];
  }
  
  findZone(id: string) {
    return this.data?.zones.find((z: any) => z.id === id);
    // return this.data?.zones.find(z => z.id === id);
  }
getLabText(status: string | null): string {
  if (!status) return 'ไม่มีรายการ';

  switch (status.toUpperCase()) {
    case 'W': return 'รายงานผลแล้ว';
    case 'C': return 'รอผล';
    case 'N': return 'รอยืนยัน';
    case 'Y': return 'ผลปกติ';
    case 'I': return 'มีคำสั่งตรวจ';
    default:  return 'สถานะอื่น';
  }
}

getXrayText(status: string | null): string {
  if (!status) return 'ไม่มีรายการ';

  switch (status.toUpperCase()) {
    case 'W': return 'รายงานผลแล้ว';
    case 'C': return 'รอผล';
    case 'N': return 'รอยืนยัน';
    case 'Y': return 'ผลปกติ';
    case 'I': return 'มีคำสั่งตรวจ';
    default:  return 'สถานะอื่น';
  }
}

refreshBoard() {
  this.isRefreshing = true;
  this.error = null;

  this.loadBoard().finally(() => {
    this.isRefreshing = false;
  });
}

  async openBedDetail(bedno: string) {
    try {
      const res = await fetch(`${environment.apiUrl}/api/bed-detail/${bedno}`);

      const json = await res.json();

      if (json.ok) {
        this.selectedPatient = json.data;
        this.showModal = true;
      } else {
        alert('ไม่พบข้อมูลผู้ป่วย');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาด');
    }
  }


  closeModal() {
    this.showModal = false;
    this.selectedPatient = null;
  }
get patientSummary() {
  if (!this.data) {
    return {
      total: 0,
      male: 0,
      female: 0
    };
  }

  let total = 0;
  let male = 0;
  let female = 0;

  // ===============================
  // 1) นับผู้ป่วยที่อยู่ในเตียง
  // ===============================
  this.data.zones?.forEach((zone: any) => {
    zone.rooms?.forEach((room: any) => {
      room.beds?.forEach((bed: any) => {
        if (!bed.patient) return;

        total++;

        if (bed.patient.sex === '1' || bed.patient.sex_name === 'ชาย') {
          male++;
        } else if (bed.patient.sex === '2' || bed.patient.sex_name === 'หญิง') {
          female++;
        }
      });
    });
  });

  // ===============================
  // 2) นับผู้ป่วยรอรับเตียง
  // ===============================
  this.data.center?.waiting?.forEach((p: any) => {
    total++;

    if (p.sex === '1' || p.sex_name === 'ชาย') {
      male++;
    } else if (p.sex === '2' || p.sex_name === 'หญิง') {
      female++;
    }
  });

  return { total, male, female };
}


openWaitingDetail(p: any) {
  this.selectedPatient = {
    an: p.an ?? '-',
    hn: p.hn,
    patient_name: p.patient_name ?? '-',
    age_y: p.age_y ?? null,
    age_m: p.age_m ?? null,
    age_d: p.age_d ?? null,

    regdate: p.regdate ?? null,   // ✅ วันที่ Admit
    admdate: p.admdate ?? null,   // ✅ จำนวนวันนอน

    pttype_name: p.pttype_name ?? '-',
    admdoctor_name: p.admdoctor_name ?? '-'
  };

  this.showModal = true;
}
toggleFullscreen() {
  const elem = document.documentElement;

  if (!document.fullscreenElement) {
    elem.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

onBedClick(bed: any) {

  // 🔹 เก็บข้อมูลเตียง (สำหรับ popup)
  this.selectedBed = {
    bedno: bed.bed,
    room: bed.room || bed.roomno || '',
    zone: bed.zone || ''
  };

  // 🔹 ถ้ามีผู้ป่วย → แสดงรายละเอียด
  if (bed.patient) {
    this.selectedPatient = bed.patient;
  } else {
    this.selectedPatient = null;
  }

  this.showModal = true;
}
@HostListener('window:keydown', ['$event'])
handleEsc(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }
}

}
