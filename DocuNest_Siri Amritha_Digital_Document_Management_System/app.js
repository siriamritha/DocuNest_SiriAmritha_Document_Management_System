
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();

// ==========================================
// CONFIGURATION - PORT 3000 ONLY
// ==========================================

const PORT = 3000;

const uploadDir = path.join(__dirname, 'uploads');

fs.mkdirSync(uploadDir, { recursive: true });

// ==========================================
// MYSQL DATABASE CONNECTION
// ==========================================

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'docunest',
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true
});

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-docunest-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// FILE UPLOAD CONFIGURATION
// ==========================================

const storage = multer.diskStorage({
    destination: uploadDir,

    filename: (req, file, cb) => {
        const uniqueName =
            `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(file.originalname).toLowerCase()}`;

        cb(null, uniqueName);
    }
});

const allowedExtensions =
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|png|jpg|jpeg|webp|zip)$/i;

const upload = multer({
    storage,
    limits: {
        fileSize: 15 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (allowedExtensions.test(path.extname(file.originalname))) {
            cb(null, true);
        } else {
            cb(new Error('File type not supported.'));
        }
    }
});

// ==========================================
// COMMON FUNCTIONS
// ==========================================

const asyncRoute = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const auth = (req, res, next) => {
    if (req.session.user) {
        return next();
    }

    return res.status(401).json({
        error: 'Please sign in to continue.'
    });
};

// Regenerate the session when a user authenticates so each login gets
// a fresh session ID and the authenticated identity is saved before replying.
const establishUserSession = (req, user) => new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
        if (error) return reject(error);
        req.session.user = user;
        req.session.save((saveError) => {
            if (saveError) return reject(saveError);
            resolve();
        });
    });
});

const admin = (req, res, next) => {
    if (req.session.user?.role === 'admin') {
        return next();
    }

    return res.status(403).json({
        error: 'Administrator access required.'
    });
};

// ==========================================
// SESSION API
// ==========================================

app.get('/api/session', (req, res) => {
    res.json({
        user: req.session.user || null
    });
});

// Always read the profile belonging to the authenticated session user.
app.get('/api/profile', auth, asyncRoute(async (req, res) => {
    const [rows] = await pool.query(
        'SELECT user_id, name, email, role FROM users WHERE user_id = ? LIMIT 1',
        [req.session.user.user_id]
    );

    if (!rows.length) {
        return res.status(404).json({ error: 'User profile not found.' });
    }

    const user = rows[0];
    req.session.user = user;
    res.json({ user });
}));

// ==========================================
// USER REGISTRATION
// ==========================================

app.post('/api/register', asyncRoute(async (req, res) => {

    const { name, email, password } = req.body;

    if (
        !name ||
        name.trim().length > 30 ||
        !email ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        !password ||
        password.length < 6
    ) {
        return res.status(400).json({
            error: 'Enter a name (up to 30 characters), valid email and password with at least 6 characters.'
        });
    }

    const [count] = await pool.query(
        'SELECT COUNT(*) AS total FROM users'
    );

    const role = count[0].total === 0 ? 'admin' : 'user';

    const hash = await bcrypt.hash(password, 12);

    try {

        const [result] = await pool.query(
            'INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)',
            [
                name.trim(),
                email.trim().toLowerCase(),
                hash,
                role
            ]
        );

        await establishUserSession(req, {
            user_id: result.insertId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role
        });

        res.status(201).json({
            user: req.session.user
        });

    } catch (error) {

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                error: 'That email is already registered.'
            });
        }

        throw error;
    }
}));

// ==========================================
// USER LOGIN
// ==========================================

app.post('/api/login', asyncRoute(async (req, res) => {

    const { email, password } = req.body;

    const [rows] = await pool.query(
        'SELECT * FROM users WHERE email = ?',
        [String(email || '').trim().toLowerCase()]
    );

    if (
        !rows.length ||
        !(await bcrypt.compare(password || '', rows[0].password))
    ) {
        return res.status(401).json({
            error: 'Email or password is incorrect.'
        });
    }

    const user = rows[0];

    await establishUserSession(req, {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role
    });

    res.json({
        user: req.session.user
    });
}));

// ==========================================
// USER LOGOUT
// ==========================================

app.post('/api/logout', (req, res) => {

    req.session.destroy((error) => {

        if (error) {
            return res.status(500).json({
                error: 'Could not log out.'
            });
        }

        res.json({
            ok: true
        });
    });
});

// ==========================================
// DASHBOARD
// ==========================================

app.get('/api/dashboard', auth, asyncRoute(async (req, res) => {

    const id = req.session.user.user_id;

    const [[documents]] = await pool.query(
        'SELECT COUNT(*) total FROM documents WHERE user_id=? AND status="Active"',
        [id]
    );

    const [[categories]] = await pool.query(
        'SELECT COUNT(*) total FROM categories'
    );

    const [[sharedWithMe]] = await pool.query(
        'SELECT COUNT(*) total FROM document_access WHERE user_id=?',
        [id]
    );

    const [[sharesGiven]] = await pool.query(
        `SELECT COUNT(*) total
         FROM document_access
         WHERE document_id IN (
             SELECT document_id FROM documents WHERE user_id=?
         )`,
        [id]
    );

    res.json({
        documents: documents.total,
        categories: categories.total,
        sharedWithMe: sharedWithMe.total,
        sharesGiven: sharesGiven.total
    });
}));

// ==========================================
// CATEGORIES
// ==========================================

app.get('/api/categories', auth, asyncRoute(async (req, res) => {

    const [rows] = await pool.query(
        'SELECT * FROM categories ORDER BY category_name'
    );

    res.json(rows);
}));

app.post('/api/categories', auth, admin, asyncRoute(async (req, res) => {

    const { category_name, description } = req.body;

    if (!category_name?.trim()) {
        return res.status(400).json({
            error: 'Category name is required.'
        });
    }

    const [result] = await pool.query(
        'INSERT INTO categories(category_name,description) VALUES(?,?)',
        [
            category_name.trim(),
            (description || '').slice(0, 255)
        ]
    );

    res.status(201).json({
        category_id: result.insertId
    });
}));

// ==========================================
// GET DOCUMENTS
// ==========================================

app.get('/api/documents', auth, asyncRoute(async (req, res) => {

    const uid = req.session.user.user_id;

    const q = `%${String(req.query.q || '').trim()}%`;

    const cat = req.query.category || '';

    const [rows] = await pool.query(
        `SELECT DISTINCT
            d.document_id,
            d.user_id,
            d.category_id,
            d.title,
            d.file_name,
            d.upload_date,
            d.status,
            c.category_name,
            u.name AS owner_name

         FROM documents d

         JOIN categories c
            ON c.category_id = d.category_id

         JOIN users u
            ON u.user_id = d.user_id

         LEFT JOIN document_access a
            ON a.document_id = d.document_id
            AND a.user_id = ?

         WHERE d.status = 'Active'
            AND (d.user_id = ? OR a.user_id = ?)
            AND (
                d.title LIKE ?
                OR d.file_name LIKE ?
                OR c.category_name LIKE ?
            )
            AND (? = '' OR d.category_id = ?)

         ORDER BY d.upload_date DESC`,
        [uid, uid, uid, q, q, q, cat, cat]
    );

    res.json(rows);
}));

// ==========================================
// UPLOAD DOCUMENT
// ==========================================

app.post(
    '/api/documents',
    auth,
    upload.single('document'),
    asyncRoute(async (req, res) => {

        if (!req.file) {
            return res.status(400).json({
                error: 'Choose a document to upload.'
            });
        }

        const { title, category_id } = req.body;

        if (!title?.trim() || !category_id) {

            fs.unlinkSync(req.file.path);

            return res.status(400).json({
                error: 'Title and category are required.'
            });
        }

        const [categories] = await pool.query(
            'SELECT category_id FROM categories WHERE category_id=?',
            [category_id]
        );

        if (!categories.length) {

            fs.unlinkSync(req.file.path);

            return res.status(400).json({
                error: 'Choose a valid category.'
            });
        }

        try {

            const [result] = await pool.query(
                `INSERT INTO documents
                (user_id,category_id,title,file_name,file_path,status)
                VALUES(?,?,?,?,?,?)`,
                [
                    req.session.user.user_id,
                    category_id,
                    title.trim(),
                    req.file.originalname,
                    req.file.filename,
                    'Active'
                ]
            );

            res.status(201).json({
                document_id: result.insertId
            });

        } catch (error) {

            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            throw error;
        }
    })
);

// ==========================================
// CHECK DOCUMENT ACCESS
// ==========================================

async function canAccess(docId, userId) {

    const [rows] = await pool.query(
        `SELECT d.*, a.permission

         FROM documents d

         LEFT JOIN document_access a
            ON a.document_id = d.document_id
            AND a.user_id = ?

         WHERE d.document_id = ?
            AND d.status = 'Active'
            AND (d.user_id = ? OR a.user_id = ?)`,
        [userId, docId, userId, userId]
    );

    return rows[0] || null;
}

// ==========================================
// DOWNLOAD DOCUMENT
// ==========================================

app.get(
    '/api/documents/:id/download',
    auth,
    asyncRoute(async (req, res) => {

        const document = await canAccess(
            req.params.id,
            req.session.user.user_id
        );

        if (!document) {
            return res.status(404).json({
                error: 'Document not found or access denied.'
            });
        }

        if (
            document.user_id !== req.session.user.user_id &&
            document.permission !== 'download' &&
            document.permission !== 'edit'
        ) {
            return res.status(403).json({
                error: 'You have view-only access.'
            });
        }

        const file = path.join(
            uploadDir,
            path.basename(document.file_path)
        );

        if (!fs.existsSync(file)) {
            return res.status(404).json({
                error: 'Stored file is missing.'
            });
        }

        res.download(file, document.file_name);
    })
);

// ==========================================
// SHARE DOCUMENT
// ==========================================

app.post(
    '/api/documents/:id/share',
    auth,
    asyncRoute(async (req, res) => {

        const document = await canAccess(
            req.params.id,
            req.session.user.user_id
        );

        if (
            !document ||
            document.user_id !== req.session.user.user_id
        ) {
            return res.status(403).json({
                error: 'Only the document owner can share it.'
            });
        }

        const { email, permission } = req.body;

        if (!['view', 'download', 'edit'].includes(permission)) {
            return res.status(400).json({
                error: 'Choose view, download or edit permission.'
            });
        }

        const [users] = await pool.query(
            'SELECT user_id FROM users WHERE email=?',
            [String(email || '').trim().toLowerCase()]
        );

        if (!users.length) {
            return res.status(404).json({
                error: 'No registered user found with that email.'
            });
        }

        if (users[0].user_id === document.user_id) {
            return res.status(400).json({
                error: 'You already own this document.'
            });
        }

        await pool.query(
            `INSERT INTO document_access
            (document_id,user_id,permission)
            VALUES(?,?,?)
            ON DUPLICATE KEY UPDATE
            permission=VALUES(permission),
            granted_date=CURRENT_TIMESTAMP`,
            [
                document.document_id,
                users[0].user_id,
                permission
            ]
        );

        res.json({
            ok: true
        });
    })
);

// ==========================================
// VIEW DOCUMENT ACCESS
// ==========================================

app.get(
    '/api/documents/:id/access',
    auth,
    asyncRoute(async (req, res) => {

        const document = await canAccess(
            req.params.id,
            req.session.user.user_id
        );

        if (
            !document ||
            document.user_id !== req.session.user.user_id
        ) {
            return res.status(403).json({
                error: 'Only the owner can manage access.'
            });
        }

        const [rows] = await pool.query(
            `SELECT
                a.access_id,
                a.permission,
                a.granted_date,
                u.name,
                u.email

             FROM document_access a

             JOIN users u
                ON u.user_id = a.user_id

             WHERE a.document_id = ?

             ORDER BY a.granted_date DESC`,
            [document.document_id]
        );

        res.json(rows);
    })
);

// ==========================================
// REVOKE DOCUMENT ACCESS
// ==========================================

app.delete(
    '/api/access/:id',
    auth,
    asyncRoute(async (req, res) => {

        const [rows] = await pool.query(
            `SELECT a.access_id, d.user_id

             FROM document_access a

             JOIN documents d
                ON d.document_id = a.document_id

             WHERE a.access_id = ?`,
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({
                error: 'Access entry not found.'
            });
        }

        if (rows[0].user_id !== req.session.user.user_id) {
            return res.status(403).json({
                error: 'Only the owner can revoke access.'
            });
        }

        await pool.query(
            'DELETE FROM document_access WHERE access_id=?',
            [req.params.id]
        );

        res.json({
            ok: true
        });
    })
);

// ==========================================
// DELETE DOCUMENT
// ==========================================

app.delete(
    '/api/documents/:id',
    auth,
    asyncRoute(async (req, res) => {

        const userId = req.session.user.user_id;

        const [rows] = await pool.query(
            `SELECT *
             FROM documents
             WHERE document_id = ?
             AND user_id = ?`,
            [req.params.id, userId]
        );

        if (!rows.length) {
            return res.status(404).json({
                error: 'Document not found or you are not the owner.'
            });
        }

        const document = rows[0];

        // Remove sharing records first
        await pool.query(
            'DELETE FROM document_access WHERE document_id=?',
            [document.document_id]
        );

        // Remove document record
        await pool.query(
            'DELETE FROM documents WHERE document_id=? AND user_id=?',
            [document.document_id, userId]
        );

        // Remove physical file from uploads folder
        const file = path.join(
            uploadDir,
            path.basename(document.file_path)
        );

        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }

        res.json({
            ok: true,
            message: 'Document deleted successfully.'
        });
    })
);

// ==========================================
// USERS - ADMIN
// ==========================================

app.get('/api/users', auth, admin, asyncRoute(async (req, res) => {

    const [rows] = await pool.query(
        'SELECT user_id,name,email,role FROM users ORDER BY name'
    );

    res.json(rows);
}));

// ==========================================
// ERROR HANDLING
// ==========================================

app.use((err, req, res, next) => {

    console.error('Application error:', err);

    if (err instanceof multer.MulterError) {

        return res.status(400).json({
            error: err.code === 'LIMIT_FILE_SIZE'
                ? 'File must be 15 MB or smaller.'
                : err.message
        });
    }

    res.status(500).json({
        error: err.message || 'Something went wrong.'
    });
});

// ==========================================
// FRONTEND ROUTE
// ==========================================

app.get('*', (req, res) => {

    res.sendFile(
        path.join(__dirname, 'public', 'index.html')
    );
});

// ==========================================
// START SERVER - PORT 3000 ONLY
// ==========================================

async function startServer() {

    try {

        // Check MySQL connection
        await pool.query('SELECT 1');

        console.log('DocuNest connected to MySQL.');

        // Start server on port 3000
        const server = app.listen(PORT, () => {

            console.log(
                `Siri Amritha's DocuNest running at http://localhost:${PORT}`
            );

        });

        // Never switch to another port
        server.on('error', (err) => {

            if (err.code === 'EADDRINUSE') {

                console.error(
                    'ERROR: Port 3000 is already in use.'
                );

                console.error(
                    'Stop the application using port 3000 and restart DocuNest.'
                );

            } else {

                console.error(
                    'Server error:',
                    err.message
                );

            }

            process.exit(1);

        });

    } catch (error) {

        console.error(
            'MySQL connection failed:',
            error.message
        );

        console.error(
            'Check your .env database settings and import schema.sql in MySQL Workbench.'
        );

        process.exit(1);

    }
}

startServer();
