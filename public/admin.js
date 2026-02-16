// --- 1. OTENTIKASI ---
async function checkAuth() {
    const res = await fetch('/api/admin/orders');
    if (res.status === 401) window.location.href = 'login.html';
}
checkAuth();

async function logout() {
    if(confirm("Yakin ingin keluar?")) {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = 'login.html';
    }
}

let lastOrderCount = 0;

// --- 2. NAVIGASI DASHBOARD ---
function showView(viewName, el) {
    document.querySelectorAll('.admin-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    if (typeof feather !== 'undefined') feather.replace();
    
    if(viewName === 'dashboard') loadDashboardStats();
    if(viewName === 'orders') loadOrders();
    if(viewName === 'menu') loadMenu();
    if(viewName === 'settings') { loadConfig(); loadLogs(); }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message;
    toast.className = 'toast-show';
    setTimeout(() => { toast.className = 'toast-hidden'; }, 3000);
}

// --- 3. FITUR BALANCE & STATS (DASHBOARD) ---
async function loadDashboardStats() {
    try {
        const filter = document.getElementById('stats-filter')?.value || 'all';
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        
        let totalBalance = 0;
        let totalSold = 0;
        const logList = document.getElementById('sales-log-list');
        if(logList) logList.innerHTML = "";

        const now = new Date();
        const filteredData = data.filter(item => {
            if (!item.tanggal) return false;
            const parts = item.tanggal.split(',')[0].split('/');
            const itemDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            
            const getStartOfWeek = (d) => {
                const date = new Date(d);
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
                return new Date(date.setDate(diff));
            };

            if (filter === 'today') return itemDate.toDateString() === now.toDateString();
            if (filter === 'week') {
                const startOfWeek = getStartOfWeek(now);
                startOfWeek.setHours(0,0,0,0);
                return itemDate >= startOfWeek;
            }
            if (filter === 'month') return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
            if (filter === 'year') return itemDate.getFullYear() === now.getFullYear();
            return true;
        });

        filteredData.reverse().forEach(item => {
            totalBalance += item.total;
            totalSold += item.jumlah;
            if(logList) {
                logList.innerHTML += `
                    <tr>
                        <td>${item.tanggal}</td>
                        <td><b>${item.produk}</b></td>
                        <td>${item.kategori}</td>
                        <td>${item.jumlah}</td>
                        <td>Rp ${item.total.toLocaleString()}</td>
                    </tr>`;
            }
        });

        if(document.getElementById('stat-balance')) document.getElementById('stat-balance').innerText = `Rp ${totalBalance.toLocaleString()}`;
        if(document.getElementById('stat-sold')) document.getElementById('stat-sold').innerText = totalSold;
    } catch (e) { console.log("Stats loading..."); }
}

// --- 4. MANAJEMEN MENU (KATALOG LIVE - FAST UI) ---
async function loadMenu() {
    try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if(document.getElementById('stat-menu')) document.getElementById('stat-menu').innerText = data.length;
        
        const list = document.getElementById('menu-list');
        if(!list) return;
        list.innerHTML = "";
        
        data.forEach(p => {
            const isReady = p.stok === 'ready';
            // UPDATE: Menambahkan Label Kategori
            const displayCat = p.category ? p.category.replace('-', ' ').toUpperCase() : 'MENU';

            list.innerHTML += `
                <div class="admin-product-card">
                    <div class="card-top">
                        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:5px;">
                            <span style="font-size:0.65rem; background:#f0f0f0; padding:2px 6px; border-radius:4px; color:#666; font-weight:600; letter-spacing:0.5px;">
                                ${displayCat}
                            </span>
                            <span id="badge-${p.id}" class="status-badge ${isReady ? 'status-ready' : 'status-habis'}">
                                ${isReady ? 'READY' : 'HABIS'}
                            </span>
                        </div>
                        <h3>${p.name}</h3>
                        <p>Rp ${parseInt(p.price).toLocaleString('id-ID')}</p>
                    </div>
                    <div class="admin-card-btns">
                        <button id="btn-${p.id}" class="btn-toggle" 
                            style="background:${isReady ? '#FDF1F1' : '#E8F5E9'}; color:${isReady ? '#C62828' : '#2E7D32'}; border:1px solid ${isReady ? '#ef9a9a' : '#a5d6a7'};"
                            onclick="toggleStock('${p.id}', '${isReady ? 'habis' : 'ready'}')">
                            ${isReady ? 'Set Habis' : 'Set Ready'}
                        </button>
                        <button class="btn-del" onclick="deleteProduct('${p.id}')">
                            <i data-feather="trash-2" style="width:16px;"></i>
                        </button>
                    </div>
                </div>`;
        });
        if (typeof feather !== 'undefined') feather.replace();
    } catch(e) { console.log("Gagal muat katalog"); }
}

// --- 5. ANTREAN PESANAN ---
async function loadOrders() {
    try {
        const res = await fetch('/api/admin/orders');
        const data = await res.json();
        if (data.length > lastOrderCount) new Audio('https://files.catbox.moe/7m6v6n.mp3').play().catch(()=>{});
        lastOrderCount = data.length;
        if(document.getElementById('stat-orders')) document.getElementById('stat-orders').innerText = data.length;
        
        const list = document.getElementById('order-list');
        if(!list) return;
        list.innerHTML = data.length ? "" : '<p style="text-align:center;padding:50px;color:#999;">☕ Belum ada antrean.</p>';
        list.className = "orders-grid";
        
        data.forEach(o => {
            list.innerHTML += `
                <div class="order-ticket">
                    <div class="ticket-header"><span class="ticket-no">ORDER #${o.id.slice(-4)}</span></div>
                    <div class="ticket-body"><span class="cust-name">${o.nama}</span><div class="order-item"><div class="qty-circle">${o.jumlah}x</div><b>${o.menu}</b></div></div>
                    <div class="ticket-footer"><button onclick="completeOrder('${o.id}')" class="btn-done">SIAP!</button></div>
                </div>`;
        });
    } catch(e) {}
}

// --- 6. AKSI & FORM (FAST UI UPDATE) ---
async function toggleStock(id, newStatus) {
    const btn = document.getElementById(`btn-${id}`);
    const badge = document.getElementById(`badge-${id}`);
    
    if (newStatus === 'ready') {
        badge.className = 'status-badge status-ready';
        badge.innerText = 'READY';
        btn.innerText = "Set Habis";
        btn.style.background = "#FDF1F1";
        btn.style.color = "#C62828";
        btn.style.borderColor = "#ef9a9a";
        btn.setAttribute('onclick', `toggleStock('${id}', 'habis')`);
    } else {
        badge.className = 'status-badge status-habis';
        badge.innerText = 'HABIS';
        btn.innerText = "Set Ready";
        btn.style.background = "#E8F5E9";
        btn.style.color = "#2E7D32";
        btn.style.borderColor = "#a5d6a7";
        btn.setAttribute('onclick', `toggleStock('${id}', 'ready')`);
    }

    try {
        const res = await fetch('/api/admin/update-stock', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ productId: id, status: newStatus }) 
        });
        if(res.ok) {
            showToast(`✅ Stok diubah jadi ${newStatus.toUpperCase()}`);
        } else {
            throw new Error("Gagal");
        }
    } catch (e) {
        alert("Gagal koneksi server, stok dikembalikan.");
        loadMenu(); 
    }
}

async function deleteProduct(id) {
    if(!confirm("Hapus menu ini?")) return;
    await fetch('/api/admin/delete-product', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id }) });
    loadMenu(); showToast("🗑️ Menu dihapus!");
}

async function completeOrder(id) {
    await fetch('/api/admin/complete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ orderId: id }) });
    loadOrders(); showToast("✅ Pesanan selesai!");
}

// --- 7. PENGATURAN & KONFIGURASI ---
async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        
        if(data.shop_status) document.getElementById('set-status').value = data.shop_status;
        if(data.wa_number) document.getElementById('set-wa').value = data.wa_number;
        if(data.email) document.getElementById('set-email').value = data.email;
        if(data.instagram) document.getElementById('set-ig').value = data.instagram;
        if(data.tiktok) document.getElementById('set-tiktok').value = data.tiktok;
        if(data.hero_image) document.getElementById('set-hero-img').value = data.hero_image;
        if(data.about_image) document.getElementById('set-about-img').value = data.about_image;

    } catch(e) { console.log("Config load error"); }
}

async function loadLogs() {
    const list = document.getElementById('log-list');
    if (!list) return; 
    try {
        const res = await fetch('/api/admin/logs');
        const data = await res.json();
        list.innerHTML = ""; 
        data.forEach(log => {
            const cleanNik = log.nik.replace("'", "");
            list.innerHTML += `<tr><td>${log.waktu}</td><td>${log.nama}</td><td>${cleanNik}</td></tr>`;
        });
    } catch (e) {}
}

document.getElementById('btn-save-settings').onclick = async () => {
    const btn = document.getElementById('btn-save-settings');
    btn.innerText = "Menyimpan Cepat...";
    btn.disabled = true;

    const settingsData = [
        { key: 'shop_status', value: document.getElementById('set-status').value },
        { key: 'wa_number', value: document.getElementById('set-wa').value },
        { key: 'email', value: document.getElementById('set-email').value },
        { key: 'instagram', value: document.getElementById('set-ig').value },
        { key: 'tiktok', value: document.getElementById('set-tiktok').value },
        { key: 'hero_image', value: document.getElementById('set-hero-img').value },
        { key: 'about_image', value: document.getElementById('set-about-img').value }
    ];

    try {
        const res = await fetch('/api/admin/update-config-bulk', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(settingsData)
        });

        if(res.ok) {
            showToast("⚡ Pengaturan Tersimpan Kilat!");
        } else {
            showToast("❌ Gagal menyimpan.");
        }
    } catch(e) {
        showToast("❌ Error koneksi.");
        console.error(e);
    } finally {
        btn.innerText = "Simpan Perubahan";
        btn.disabled = false;
    }
};

// --- 8. LOGIKA RESET LAPORAN ---
function openResetModal() {
    const modal = document.getElementById('modal-reset');
    if(modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
}

function closeResetModal() {
    const modal = document.getElementById('modal-reset');
    if(modal) modal.style.display = 'none';
    document.getElementById('reset-nik').value = '';
    document.getElementById('reset-pin').value = '';
}

async function confirmReset() {
    const nik = document.getElementById('reset-nik').value;
    const pin = document.getElementById('reset-pin').value;
    const btn = document.getElementById('btn-confirm-reset');

    if(!nik || !pin) return alert("Harap isi NIK dan PIN!");

    btn.innerText = "Memproses...";
    btn.disabled = true;

    try {
        const res = await fetch('/api/admin/reset-stats', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nik, pin })
        });

        const result = await res.json();

        if(res.ok) {
            showToast("🗑️ Data Penjualan BERHASIL Direset!");
            closeResetModal();
            loadDashboardStats(); // Refresh data jadi 0
        } else {
            alert("GAGAL: " + (result.error || "NIK/PIN Salah"));
        }
    } catch (e) {
        alert("Terjadi kesalahan server.");
    } finally {
        btn.innerText = "HAPUS SEMUA";
        btn.disabled = false;
    }
}

// --- INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardStats();
    loadOrders(); // Load awal
    loadMenu();   // Load menu awal

    // Polling / Cek ulang setiap 5 detik
    setInterval(() => {
        loadOrders(); // Cek pesanan baru
        
        // HANYA update menu jika kita sedang melihat tab Menu
        const viewMenu = document.getElementById('view-menu');
        if (viewMenu && !viewMenu.classList.contains('hidden')) {
            loadMenu(); 
        }

        // HANYA update status toko jika kita sedang melihat tab Pengaturan
        const viewSettings = document.getElementById('view-settings');
        if (viewSettings && !viewSettings.classList.contains('hidden')) {
            loadConfig();
        }

    }, 5000); 
});