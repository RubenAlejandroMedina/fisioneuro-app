const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());

// Carpeta de archivos estáticos (asegúrate de que tu carpeta se llame 'public' o 'público' según corresponda)
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Login unificado flexible (Soporta búsqueda por email o cédula guardada en email)
app.post('/api/login', async (req, res) => {
  const identificador = req.body.usuario || req.body.email;
  const password = req.body.password;

  if (!identificador || !password) {
    return res.status(400).json({ error: 'Faltan datos de inicio de sesión' });
  }

  try {
    // Buscamos coincidencia exacta por email/cédula y contraseña
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE (LOWER(email) = LOWER($1) OR email = $1) AND password_hash = $2',
      [identificador.trim(), password.trim()]
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
    
    // Inserta o actualiza el usuario vinculado usando la cédula como email/identificador y contraseña inicial
    await client.query(
      `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol) 
       VALUES ($1, $2, $3, $4, 'paciente') 
       ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre, apellido = EXCLUDED.apellido`,
      [nombre, apellido, cedula, cedula]
    );

    const pac = await client.query(
      `INSERT INTO pacientes (cedula, nombre, apellido, fecha_nacimiento, telefono, email, direccion) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       ON CONFLICT (cedula) DO UPDATE SET telefono = EXCLUDED.telefono, email = EXCLUDED.email, direccion = EXCLUDED.direccion
       RETURNING *`,
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

// Rutas explícitas opcionales para mayor seguridad en la navegación por roles
app.get('/paciente', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'paciente.html'));
});

app.get('/especialista', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'especialista.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FisioNeuro activo en puerto ${PORT}`));
