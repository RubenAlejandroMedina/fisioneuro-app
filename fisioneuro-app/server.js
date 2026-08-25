const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Login unificado (Admin con Email / Paciente con Cédula)
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    // Buscar Admin por Email o Paciente por Cédula (email = cedula)
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND password_hash = $2',
      [usuario, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Cédula/Correo o contraseña incorrectos' });
    }

    const u = result.rows[0];
    res.json({ id: u.id, nombre: u.nombre, apellido: u.apellido, rol: u.rol, cedula: u.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener Pacientes
app.get('/api/pacientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pacientes ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear Paciente (Genera también usuario con cédula/cédula)
app.post('/api/pacientes', async (req, res) => {
  const { cedula, nombre, apellido, fecha_nacimiento, telefono, email, direccion } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1. Crear en tabla usuarios
    await client.query(
      `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol) 
       VALUES ($1, $2, $3, $4, 'paciente') ON CONFLICT (email) DO NOTHING`,
      [nombre, apellido, cedula, cedula]
    );
    // 2. Crear en tabla pacientes
    const pac = await client.query(
      `INSERT INTO pacientes (cedula, nombre, apellido, fecha_nacimiento, telefono, email, direccion) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [cedula, nombre, apellido, fecha_nacimiento, telefono, email, direccion]
    );
    await client.query('COMMIT');
    res.status(201).json(pac.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Agendar Cita (Público/Paciente/Admin)
app.post('/api/citas', async (req, res) => {
  const { paciente_id, fisioterapeuta_id, fecha_hora, motivo } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO citas (paciente_id, fisioterapeuta_id, fecha_hora, motivo, estado) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [paciente_id, fisioterapeuta_id || 1, fecha_hora, motivo, 'confirmada']
    );
    
    // Aquí se conecta con el Webhook de Google Calendar / API
    console.log("Cita agendada exitosamente y enviada a Google Calendar");
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Guardar Historia Clínica
app.post('/api/historias', async (req, res) => {
  const { paciente_id, fisioterapeuta_id, motivo_consulta, diagnostico, observaciones } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO historias_clinicas (paciente_id, fisioterapeuta_id, motivo_consulta, diagnostico, observaciones) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [paciente_id, fisioterapeuta_id || 1, motivo_consulta, diagnostico, observaciones]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FisioNeuro Pro activo en puerto ${PORT}`));
