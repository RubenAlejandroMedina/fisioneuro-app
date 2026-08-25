const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Reemplaza esta URL con la tuya de Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// APIs para Pacientes
app.get('/api/pacientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pacientes ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pacientes', async (req, res) => {
  const { cedula, nombre, apellido, fecha_nacimiento, telefono, email, direccion } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO pacientes (cedula, nombre, apellido, fecha_nacimiento, telefono, email, direccion) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [cedula, nombre, apellido, fecha_nacimiento, telefono, email, direccion]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor iniciado en puerto ${PORT}`));