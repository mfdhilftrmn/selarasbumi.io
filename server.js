require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const midtransClient = require('midtrans-client');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- KONEKSI GOOGLE SHEETS ---
const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const getDoc = async () => {
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    return doc;
};

// --- RUTE PUBLIK (BISA DIAKSES SIAPA SAJA) ---

// Login
app.post('/api/login', async (req, res) => {
    const { nik, pin } = req.body;
    try {
        const doc = await getDoc();
        const sheetUser = doc.sheetsByTitle['USERS'] || doc.sheetsByTitle['USER']; 
        if (!sheetUser) return res.status(500).json({ error: "Database User tidak ditemukan" });
        
        const rows = await sheetUser.getRows();
        const user = rows.find(row => String(row.get('NIK')) === String(nik) && String(row.get('PIN')) === String(pin));

        if (user) {
            const sheetLog = doc.sheetsByTitle['LOGS'];
            if (sheetLog) {
                await sheetLog.addRow({
                    'WAKTU': new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
                    'NAMA': user.get('NAMA'),
                    'NIK': "'"+nik 
                });
            }
            res.cookie('admin_session', 'TRUE', { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
            res.json({ success: true, nama: user.get('NAMA') });
        } else {
            res.status(401).json({ error: "NIK atau PIN Salah" });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('admin_session');
    res.json({ success: true });
});

// Produk (Untuk Halaman Depan)
app.get('/api/products', async (req, res) => {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['MENU'];
        const rows = await sheet.getRows();
        res.json(rows.map(row => ({
            id: row.get('ID'), name: row.get('NAMA'), price: parseInt(row.get('HARGA')),
            image: row.get('GAMBAR'), description: row.get('DESKRIPSI'), category: row.get('KATEGORI'),
            stok: row.get('STOK') || 'ready'
        })));
    } catch (err) { res.status(500).send(err.message); }
});

// Config (Untuk cek status toko buka/tutup)
app.get('/api/config', async (req, res) => {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['CONFIG'];
        const rows = await sheet.getRows();
        const config = {};
        rows.forEach(row => { config[row.get('KEY')] = row.get('VALUE'); });
        res.json(config);
    } catch (err) { res.status(500).send(err.message); }
});

// Transaksi
let snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

const pendingOrders = {};

app.post('/create-transaction', async (req, res) => {
    try {
        const { items, customer, total } = req.body;
        const orderId = `SELA-${new Date().getTime()}`;
        req.body.orderId = orderId; 
        pendingOrders[orderId] = req.body;
        let parameter = {
            "transaction_details": { "order_id": orderId, "gross_amount": total },
            "customer_details": { "first_name": customer.name, "phone": customer.phone },
            "item_details": items.map(item => ({ id: item.id.toString(), price: item.price, quantity: item.qty, name: item.name.substring(0, 50) }))
        };
        const transaction = await snap.createTransaction(parameter);
        res.status(200).json({ token: transaction.token });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/midtrans-notification', async (req, res) => {
    const { order_id, transaction_status } = req.body;
    if (transaction_status === 'settlement' || transaction_status === 'capture') { 
        const orderData = pendingOrders[order_id];
        if (orderData) { 
            await saveOrderToSheets(orderData); 
            delete pendingOrders[order_id]; 
        }
    }
    res.status(200).send('OK');
});

// --- MIDDLEWARE PROTEKSI ---
const requireAuth = (req, res, next) => {
    if (req.cookies.admin_session === 'TRUE') {
        return next();
    }
    if (req.path === '/admin.html') return res.redirect('/login.html');
    return res.status(401).json({ error: "Belum Login" });
};

// --- RUTE ADMIN (WAJIB LOGIN) ---
app.use('/admin.html', requireAuth);
app.use('/api/admin', requireAuth);

// Statistik & Saldo
app.get('/api/admin/stats', async (req, res) => {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['SALES'];
        if (!sheet) return res.json([]);
        const rows = await sheet.getRows();
        res.json(rows.map(row => ({
            tanggal: row.get('TANGGAL'), produk: row.get('PRODUK'), kategori: row.get('KATEGORI'),
            jumlah: parseInt(row.get('JUMLAH')) || 0, total: parseInt(row.get('TOTAL_HARGA')) || 0
        })));
    } catch (err) { res.status(500).send(err.message); }
});

// Log Login
app.get('/api/admin/logs', async (req, res) => {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['LOGS'];
        if (!sheet) return res.json([]);
        const rows = await sheet.getRows();
        res.json(rows.map(row => ({
            waktu: row.get('WAKTU'), nama: row.get('NAMA'), nik: row.get('NIK')
        })).reverse().slice(0, 20));
    } catch (err) { res.status(500).send(err.message); }
});

// Kelola Menu
app.post('/api/admin/add-product', async (req, res) => {
    const { name, price, image, description, category } = req.body;
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['MENU'];
        await sheet.addRow({ ID: Date.now().toString(), NAMA: name, HARGA: price, GAMBAR: image, DESKRIPSI: description, KATEGORI: category, STOK: 'ready' });
        res.json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/admin/update-stock', async (req, res) => {
    const { productId, status } = req.body;
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['MENU'];
        const rows = await sheet.getRows();
        const target = rows.find(r => String(r.get('ID')) === String(productId));
        if (target) { target.set('STOK', status); await target.save(); res.json({ success: true }); }
        else { res.status(404).send("Produk tidak ada"); }
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/admin/delete-product', async (req, res) => {
    const { id } = req.body;
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['MENU'];
        const rows = await sheet.getRows();
        const row = rows.find(r => String(r.get('ID')) === String(id));
        if (row) { await row.delete(); res.json({ success: true }); }
        else { res.status(404).send("Produk tidak ditemukan"); }
    } catch (err) { res.status(500).send(err.message); }
});

// --- FITUR RESET DATA (PROTECTED) ---
app.post('/api/admin/reset-stats', async (req, res) => {
    const { nik, pin } = req.body;
    try {
        const doc = await getDoc();
        
        // 1. Verifikasi Keamanan (Cek NIK & PIN lagi)
        const sheetUser = doc.sheetsByTitle['USERS'] || doc.sheetsByTitle['USER'];
        const users = await sheetUser.getRows();
        const validAdmin = users.find(u => String(u.get('NIK')) === String(nik) && String(u.get('PIN')) === String(pin));

        if (!validAdmin) {
            return res.status(401).json({ error: "Otorisasi Gagal: NIK atau PIN Salah!" });
        }

        // 2. Hapus Data di Sheet SALES
        const sheetSales = doc.sheetsByTitle['SALES'];
        if (sheetSales) {
            const rows = await sheetSales.getRows();
            // Menghapus semua baris satu per satu
            for (const row of rows) {
                await row.delete();
            }
        }

        // 3. Catat di LOGS siapa yang melakukan reset
        const sheetLog = doc.sheetsByTitle['LOGS'];
        if (sheetLog) {
            await sheetLog.addRow({
                'WAKTU': new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
                'NAMA': validAdmin.get('NAMA'),
                'NIK': "RESET ALL SALES DATA"
            });
        }

        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// Kelola Pesanan
app.get('/api/admin/orders', async (req, res) => {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        res.json(rows.filter(row => row.get('STATUS') === 'PROSES').map(row => ({
            id: row.get('ID'), nama: row.get('NAMA'), menu: row.get('MENU'), jumlah: row.get('JUMLAH')
        })));
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/admin/complete', async (req, res) => {
    const { orderId } = req.body;
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        const target = rows.find(r => String(r.get('ID')) === String(orderId));
        if (target) { target.set('STATUS', 'SELESAI'); await target.save(); res.json({ success: true }); }
    } catch (err) { res.status(500).send(err.message); }
});

// Update Config
app.post('/api/admin/update-config', async (req, res) => {
    const { key, value } = req.body;
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['CONFIG'];
        const rows = await sheet.getRows();
        const target = rows.find(r => r.get('KEY') === key);
        if (target) { target.set('VALUE', value); await target.save(); res.json({ success: true }); }
    } catch (err) { res.status(500).send(err.message); }
});

// --- FUNGSI HELPER ---
async function saveOrderToSheets(orderData) {
    try {
        const doc = await getDoc();
        
        // 1. Pesanan Utama
        const sheetOrders = doc.sheetsByIndex[0]; 
        const orderRows = orderData.items.map(item => ({
            'ID': orderData.orderId, 
            'TANGGAL': new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
            'NAMA': orderData.customer.name, 
            'NO WA': orderData.customer.phone,
            'MENU': item.name, 'JUMLAH': item.qty, 'TOTAL': item.price * item.qty, 'STATUS': 'PROSES'
        }));
        await sheetOrders.addRows(orderRows);

        // 2. Tab SALES (Untuk Statistik)
        const sheetSales = doc.sheetsByTitle['SALES'];
        if (sheetSales) {
            const salesRows = orderData.items.map(item => ({
                'TANGGAL': new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
                'PRODUK': item.name,
                'KATEGORI': item.category || 'Aeterni',
                'JUMLAH': item.qty, 'TOTAL_HARGA': item.price * item.qty
            }));
            await sheetSales.addRows(salesRows);
        }
    } catch (err) { console.error("Gagal simpan transaksi:", err.message); }
}

// --- UPDATE CONFIG BULK (OPTIMASI SPEED) ---
// Tambahkan ini di atas app.listen()
app.post('/api/admin/update-config-bulk', async (req, res) => {
    const updates = req.body; // Menerima Array data sekaligus
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['CONFIG'];
        const rows = await sheet.getRows();
        
        const savePromises = [];
        
        // Loop data di memori (Cepat)
        updates.forEach(update => {
            const row = rows.find(r => r.get('KEY') === update.key);
            if (row) {
                // Hanya simpan jika nilai berubah (Hemat kuota API)
                if (row.get('VALUE') !== update.value) {
                    row.set('VALUE', update.value);
                    savePromises.push(row.save()); // Masukkan antrean simpan
                }
            }
        });

        // Eksekusi semua penyimpanan secara PARALEL (Bersamaan)
        await Promise.all(savePromises);
        
        res.json({ success: true, updated: savePromises.length });
    } catch (err) { 
        console.error(err);
        res.status(500).send(err.message); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app; // PENTING: Export app untuk Vercel