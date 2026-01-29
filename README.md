Clone หรือ Download
git clone https://github.com/fanaseeroh/ward-board
-------------------------
ตั้งค่า Backend
cd backend
cp .env.example .env
# แก้ค่าใน .env
# ===== Server =====
PORT=

# ===== MySQLSQL =====
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
charset=utf8mb4

# ===============================
# PostgreSQL 15 Database Config
# ===============================

DB_CLIENT=pg
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=

# ใช้กรณีต่อผ่าน SSL (เช่น Server จริง / Cloud)
DB_SSL=false

npm install
npm start
-----------------------
ตั้งค่า Frontend
cd frontend
npm install
ng serve
