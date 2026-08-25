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

// Login unificado flexible
app.post('/api/login', async (req, res) => {
  // Acepta 'usuario' o 'email' indistintamente
  const identificador = req.body.usuario || req.body.email;
  const password = req.body.password;

  if (!identificador || !password) {
    return res.status(400).json({ error: 'Faltan datos de inicio de sesión' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE LOWER(email) = LOWER($1) AND password_hash = $2',
      [identificador, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Cédula/Correo o contraseña incorrectos' });
    }

    const u = result.rows[0];
    res.json({
      id: u.id,
      nombre: u.nombre,
      apellido: u.apellido,
      rol: u.rol,
      cedula: u.email
    });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: err.message });
  }
});

// Directorio de Pacientes
app.get('/api/pacientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pacientes ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear Paciente (y su usuario correspondiente)
app.post('/api/pacientes', async (req, res) => {
  const { cedula, nombre, apellido, fecha_nacimiento, telefono, email, direccion } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(
      `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol) 
       VALUES ($1, $2, $3, $4, 'paciente') ON CONFLICT (email) DO NOTHING`,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FisioNeuro activo en puerto ${PORT}`));
