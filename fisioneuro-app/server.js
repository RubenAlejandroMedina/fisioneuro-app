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

// Login unificado con soporte para nombres de columnas en español e inglés
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    // Busca por 'email' o 'correo electrónico' y compara contraseña
    const result = await pool.query(
      `SELECT * FROM usuarios 
       WHERE (LOWER(email) = LOWER($1) OR LOWER("correo electrónico") = LOWER($1))`,
      [usuario]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Cédula/Correo no encontrado' });
    }

    const u = result.rows[0];
    const passBD = u.password_hash || u["contraseña_hash"] || u.password;

    if (passBD !== password) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    res.json({
      id: u.id,
      nombre: u.nombre,
      apellido: u.apellido,
      rol: u.rol,
      cedula: u.email || u["correo electrónico"]
    });
  } catch (err) {
    console.error("Error en login:", err);
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

// Crear Paciente
app.post('/api/pacientes', async (req, res) => {
  const { cedula, nombre, apellido, fecha_nacimiento, telefono, email, direccion } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Crear en usuarios adaptándose a la estructura
    await client.query(
      `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol) 
       VALUES ($1, $2, $3, $4, 'paciente') 
       ON CONFLICT DO NOTHING`,
      [nombre, apellido, cedula, cedula]
    );

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

// Agendar Cita
app.post('/api/citas', async (req, res) => {
  const { paciente_id, fisioterapeuta_id, fecha_hora, motivo } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO citas (paciente_id, fisioterapeuta_id, fecha_hora, motivo, estado) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [paciente_id, fisioterapeuta_id || 1, fecha_hora, motivo, 'confirmada']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historia Clínica
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
