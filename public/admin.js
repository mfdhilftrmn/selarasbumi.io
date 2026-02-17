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
    
    // Load data HANYA saat tab dibuka
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

// --- 3. DASHBOARD STATS ---
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
            
            if (filter === 'today') return itemDate.toDateString() === now.toDateString();
            if (filter === 'month') return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
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
    } catch (e) {}
}

// --- 4. MANAJEMEN MENU ---
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
            const cat = p.category ? p.category.toUpperCase() : 'MENU';
            list.innerHTML += `
                <div class="admin-product-card">
                    <div class="card-top">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span style="font-size:0.7rem; background:#eee; padding:2px 6px; border-radius:4px;">${cat}</span>
                            <span id="badge-${p.id}" class="status-badge ${isReady ? 'status-ready' : 'status-habis'}">${isReady ? 'READY' : 'HABIS'}</span>
                        </div>
                        <h3>${p.name}</h3>
                        <p>Rp ${parseInt(p.price).toLocaleString('id-ID')}</p>
                    </div>
                    <div class="admin-card-btns">
                        <button id="btn-${p.id}" class="btn-toggle" 
                            style="background:${isReady ? '#e8f5e9' : '#ffebee'}; color:${isReady ? '#2e7d32' : '#c62828'};"
                            onclick="toggleStock('${p.id}', '${isReady ? 'habis' : 'ready'}')">
                            ${isReady ? 'Set Habis' : 'Set Ready'}
                        </button>
                        <button class="btn-del" onclick="deleteProduct('${p.id}')"><i data-feather="trash-2"></i></button>
                    </div>
                </div>`;
        });
        if (typeof feather !== 'undefined') feather.replace();
    } catch(e) {}
}

// --- 5. ORDERS ---
async function loadOrders() {
    try {
        const res = await fetch('/api/admin/orders');
        const data = await res.json();
        if (data.length > lastOrderCount) new Audio('https://files.catbox.moe/7m6v6n.mp3').play().catch(()=>{});
        lastOrderCount = data.length;
        
        const list = document.getElementById('order-list');
        if(!list) return;
        list.innerHTML = data.length ? "" : '<p style="text-align:center; padding:30px; color:#999;">Belum ada pesanan masuk.</p>';
        list.className = "orders-grid";
        
        data.forEach(o => {
            list.innerHTML += `
                <div class="order-ticket">
                    <div class="ticket-header"><span class="ticket-no">ORDER #${o.id.slice(-4)}</span></div>
                    <div class="ticket-body">
                        <span class="cust-name">${o.nama}</span>
                        <div class="order-item"><div class="qty-circle">${o.jumlah}x</div><b>${o.menu}</b></div>
                    </div>
                    <div class="ticket-footer"><button onclick="completeOrder('${o.id}')" class="btn-done">SIAP!</button></div>
                </div>`;
        });
    } catch(e) {}
}

// --- 6. AKSI TOMBOL ---
async function toggleStock(id, newStatus) {
    // Optimistic UI Update (Ubah tampilan dulu biar cepet)
    const btn = document.getElementById(`btn-${id}`);
    const badge = document.getElementById(`badge-${id}`);
    if(newStatus === 'ready') {
        badge.className = 'status-badge status-ready'; badge.innerText = 'READY';
        btn.innerText = 'Set Habis'; btn.style.background = '#e8f5e9'; btn.style.color = '#2e7d32';
        btn.setAttribute('onclick', `toggleStock('${id}', 'habis')`);
    } else {
        badge.className = 'status-badge status-habis'; badge.innerText = 'HABIS';
        btn.innerText = 'Set Ready'; btn.style.background = '#ffebee'; btn.style.color = '#c62828';
        btn.setAttribute('onclick', `toggleStock('${id}', 'ready')`);
    }
    await fetch('/api/admin/update-stock', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ productId: id, status: newStatus }) });
    showToast(`Stok diubah: ${newStatus}`);
}

async function deleteProduct(id) {
    if(!confirm("Hapus menu ini?")) return;
    await fetch('/api/admin/delete-product', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id }) });
    loadMenu(); showToast("Menu dihapus");
}

async function completeOrder(id) {
    await fetch('/api/admin/complete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ orderId: id }) });
    loadOrders(); showToast("Pesanan selesai!");
}

// --- 7. PENGATURAN (PERBAIKAN UTAMA: Tidak akan refresh sendiri lagi) ---
async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        // Isi form hanya jika form kosong atau saat load pertama
        if(document.getElementById('set-status')) document.getElementById('set-status').value = data.shop_status || 'open';
        if(document.getElementById('set-wa')) document.getElementById('set-wa').value = data.wa_number || '';
        if(document.getElementById('set-email')) document.getElementById('set-email').value = data.email || '';
        if(document.getElementById('set-hero-img')) document.getElementById('set-hero-img').value = data.hero_image || '';
        if(document.getElementById('set-about-img')) document.getElementById('set-about-img').value = data.about_image || '';
        if(document.getElementById('set-ig')) document.getElementById('set-ig').value = data.instagram || '';
        if(document.getElementById('set-tiktok')) document.getElementById('set-tiktok').value = data.tiktok || '';
    } catch(e) {}
}

async function loadLogs() {
    const list = document.getElementById('log-list');
    if (!list) return; 
    try {
        const res = await fetch('/api/admin/logs');
        const data = await res.json();
        list.innerHTML = ""; 
        data.forEach(log => {
            list.innerHTML += `<tr><td>${log.waktu}</td><td>${log.nama}</td><td>${log.nik.replace("'", "")}</td></tr>`;
        });
    } catch (e) {}
}

// TOMBOL SIMPAN (PERBAIKAN: Kirim data satu per satu agar server tidak error)
document.getElementById('btn-save-settings').onclick = async () => {
    const btn = document.getElementById('btn-save-settings');
    btn.innerText = "Menyimpan...";
    btn.disabled = true;

    const updates = [
        { key: 'shop_status', value: document.getElementById('set-status').value },
        { key: 'wa_number', value: document.getElementById('set-wa').value },
        { key: 'email', value: document.getElementById('set-email').value },
        { key: 'hero_image', value: document.getElementById('set-hero-img').value },
        { key: 'about_image', value: document.getElementById('set-about-img').value },
        { key: 'instagram', value: document.getElementById('set-ig').value },
        { key: 'tiktok', value: document.getElementById('set-tiktok').value }
    ];

    try {
        // Kirim semua update secara paralel
        await Promise.all(updates.map(item => 
            fetch('/api/admin/update-config', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(item)
            })
        ));
        showToast("✅ Pengaturan Berhasil Disimpan!");
    } catch(e) {
        showToast("❌ Gagal menyimpan.");
    } finally {
        btn.innerText = "Simpan Perubahan";
        btn.disabled = false;
    }
};

// --- INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
    // Load data awal
    loadDashboardStats();
    loadOrders();
    loadMenu();
    // Jangan loadConfig disini agar tidak menimpa saat reload, loadConfig dipanggil via showView

    // Auto Refresh HANYA untuk Pesanan & Menu (Pengaturan DIMATIKAN dari auto refresh)
    setInterval(() => {
        loadOrders(); 
        
        const viewMenu = document.getElementById('view-menu');
        if (viewMenu && !viewMenu.classList.contains('hidden')) {
            loadMenu(); 
        }
        
        // SAYA HAPUS bagian loadConfig() disini supaya saat ngetik tidak kereset!
    }, 5000); 
});