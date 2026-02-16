let menuData = [];
let cart = JSON.parse(localStorage.getItem('selasarCart')) || [];
let isShopOpen = true; 

// --- 1. INISIALISASI & AUTO-SYNC ---
document.addEventListener('DOMContentLoaded', async () => {
    await fetchProducts();
    await checkShopStatus(); 
    updateCartUI();
    if (typeof feather !== 'undefined') feather.replace();

    // SINKRONISASI OTOMATIS (Cek stok/harga/config setiap 5 detik)
    setInterval(async () => {
        try {
            const resProd = await fetch('/api/products');
            const newData = await resProd.json();
            
            // Render ulang hanya jika ada perubahan data menu
            if (newData.length > 0 && JSON.stringify(newData) !== JSON.stringify(menuData)) {
                menuData = newData;
                const activeTab = document.querySelector('.tab-btn.active');
                const category = activeTab ? activeTab.getAttribute('data-category') : 'all';
                renderMenu(category); 
            }
            await checkShopStatus(); // Cek update foto/kontak/status toko
        } catch (e) { console.log("Auto-sync background..."); }
    }, 5000); 
});

// --- 2. FUNGSI TOAST (NOTIFIKASI) ---
function showCustomerToast(message) {
    const toast = document.getElementById('toast-cust');
    if (!toast) return;
    toast.innerText = message;
    toast.className = 'toast-show';
    
    setTimeout(() => {
        toast.className = 'toast-hidden'; 
    }, 3000);
}

// --- 3. LOGIKA KERANJANG (BUKA/TUTUP) ---
const cartSidebar = document.getElementById('shopping-cart');
const overlay = document.getElementById('overlay');

function toggleCart(show) {
    if (!cartSidebar || !overlay) return;
    if (show) {
        cartSidebar.classList.add('active');
        overlay.classList.add('active');
    } else {
        cartSidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
}

if(document.getElementById('cart-btn')) {
    document.getElementById('cart-btn').onclick = (e) => { 
        e.preventDefault(); 
        toggleCart(true); 
    };
}
if(document.getElementById('close-cart')) {
    document.getElementById('close-cart').onclick = () => toggleCart(false);
}
if(overlay) {
    overlay.onclick = () => toggleCart(false);
}

// --- 4. MANAJEMEN PRODUK & STATUS TOKO (UPDATE BARU) ---
async function checkShopStatus() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        
        // --- A. UPDATE STATUS TOKO (BUKA/TUTUP) ---
        isShopOpen = (config.shop_status === 'open');
        const checkoutBtn = document.querySelector('.checkout-form button');
        
        if (checkoutBtn) {
            if (!isShopOpen) {
                checkoutBtn.innerText = "MAAF, TOKO SEDANG TUTUP";
                checkoutBtn.style.background = "#999";
                checkoutBtn.disabled = true;
                checkoutBtn.style.cursor = "not-allowed";
            } else {
                checkoutBtn.innerText = "PROSES PESANAN";
                checkoutBtn.style.background = "var(--coffee-light)"; 
                checkoutBtn.disabled = false;
                checkoutBtn.style.cursor = "pointer";
            }
        }

        // --- B. UPDATE KONTAK & SOSMED (DINAMIS) ---
        
        // 1. WhatsApp
        if(config.wa_number) {
            const waLink = document.getElementById('link-wa');
            if(waLink) {
                waLink.href = `https://wa.me/${config.wa_number}`;
                waLink.innerText = `Chat Admin (+${config.wa_number})`;
            }
            // Update tombol WA lain (jika ada)
            document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
                link.href = `https://wa.me/${config.wa_number}`;
            });
        }

        // 2. Email
        if(config.email) {
            const emailLink = document.getElementById('link-email');
            if(emailLink) {
                emailLink.href = `mailto:${config.email}`;
                emailLink.innerText = config.email;
            }
        }

        // 3. Instagram
        if(config.instagram) {
            const igLink = document.getElementById('link-ig');
            if(igLink) {
                const cleanIg = config.instagram.replace('@', '').replace('https://instagram.com/', '').replace(/\/$/, "");
                igLink.href = `https://www.instagram.com/${cleanIg}`;
                igLink.innerText = `@${cleanIg}`;
            }
        }

        // 4. TikTok
        if(config.tiktok) {
            const ttLink = document.getElementById('link-tiktok');
            if(ttLink) {
                const cleanTt = config.tiktok.replace('@', '').replace('https://tiktok.com/@', '').replace(/\/$/, "");
                ttLink.href = `https://www.tiktok.com/@${cleanTt}`;
                ttLink.innerText = `@${cleanTt}`;
            }
        }

        // --- C. UPDATE FOTO WEBSITE ---
        
        // 1. Foto Utama (Hero)
        if(config.hero_image) {
            const heroSection = document.getElementById('hero-section');
            if(heroSection) heroSection.style.backgroundImage = `url('${config.hero_image}')`;
        }

        // 2. Foto About
        if(config.about_image) {
            const aboutImg = document.getElementById('img-about-dynamic');
            if(aboutImg) aboutImg.src = config.about_image;
        }

    } catch (e) { console.error("Gagal sinkron config toko"); }
}

async function fetchProducts() {
    try {
        const res = await fetch('/api/products');
        menuData = await res.json();
        renderMenu('all');
    } catch (e) { console.error("Gagal muat menu."); }
}

function renderMenu(filter) {
    const container = document.getElementById('menu-container');
    if (!container) return;
    container.innerHTML = '';
    
    const filtered = filter === 'all' ? menuData : menuData.filter(i => i.category === filter);

    filtered.forEach(item => {
        const isSoldOut = item.stok === 'habis'; 
        // Format Label Kategori
        const catLabel = item.category ? item.category.replace('-', ' ').toUpperCase() : '';

        container.innerHTML += `
            <div class="menu-card ${isSoldOut ? 'sold-out' : ''}" style="${isSoldOut ? 'opacity:0.6; filter:grayscale(1);' : ''}">
                <img src="${item.image}" class="menu-img" loading="lazy" alt="${item.name}">
                <div class="menu-content">
                    <span class="category-tag">${catLabel}</span>

                    <h3 class="menu-title">${item.name} ${isSoldOut ? '<span style="color:red; font-size:0.7rem;">(HABIS)</span>' : ''}</h3>
                    <p>${item.description}</p>
                    <div class="menu-footer">
                        <span class="menu-price">${formatRupiah(item.price)}</span>
                        ${isSoldOut ? 
                            '<button class="btn-add" style="background:#ccc; cursor:not-allowed" disabled>X</button>' : 
                            `<button class="btn-add" onclick="addToCart('${item.id}')">+</button>`
                        }
                    </div>
                </div>
            </div>`;
    });
}

function filterMenu(category) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.tab-btn[data-category="${category}"]`);
    if(activeBtn) activeBtn.classList.add('active');
    renderMenu(category);
}

// --- 5. TRANSAKSI & LOGIKA KERANJANG ---
function addToCart(id) {
    if(!isShopOpen) return showCustomerToast("☕ Maaf, Selasar Bumi sedang tutup."); 
    
    const item = menuData.find(p => p.id == id);
    if (!item) return;

    const existing = cart.find(c => c.id == id);
    if(existing) {
        existing.qty++; 
    } else {
        cart.push({...item, qty: 1});
    }
    
    saveCart(); 
    showCustomerToast(`✅ ${item.name} masuk keranjang!`);
    toggleCart(true); 
}

function updateCartUI() {
    const container = document.getElementById('cart-items-container');
    const totalEl = document.getElementById('cart-total');
    const countEl = document.getElementById('cart-count'); 
    
    if (!container) return;
    container.innerHTML = cart.length ? "" : '<p style="text-align:center;color:#999;padding:20px;">Keranjang masih kosong.</p>';
    
    let total = 0; 
    let count = 0;

    cart.forEach(item => {
        total += item.price * item.qty; 
        count += item.qty;
        
        container.innerHTML += `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}">
                <div style="flex:1;">
                    <div style="display:flex;justify-content:space-between; align-items:center;">
                        <h4 style="font-size:0.9rem; margin:0;">${item.name}</h4>
                        <button onclick="removeItem('${item.id}')" style="background:none;border:none;color:red;cursor:pointer;"><i data-feather="trash-2" style="width:16px;"></i></button>
                    </div>
                    <small style="color:#666;">${formatRupiah(item.price)}</small>
                    <div style="display:flex;align-items:center;gap:10px; margin-top:5px;">
                        <button class="qty-btn" onclick="changeQty('${item.id}', -1)">-</button>
                        <span style="font-weight:600; font-size:0.9rem;">${item.qty}</span>
                        <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
                    </div>
                </div>
            </div>`;
    });

    if(totalEl) totalEl.innerText = formatRupiah(total);
    if(countEl) countEl.innerText = count;
    
    if (typeof feather !== 'undefined') feather.replace();
}

function removeItem(id) { 
    cart = cart.filter(c => c.id != id); 
    saveCart(); 
}

function changeQty(id, change) {
    const item = cart.find(c => c.id == id);
    if(item) { 
        item.qty += change; 
        if(item.qty <= 0) removeItem(id); 
        else saveCart(); 
    }
}

function saveCart() { 
    localStorage.setItem('selasarCart', JSON.stringify(cart)); 
    updateCartUI(); 
}

function formatRupiah(num) { 
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); 
}

// --- 6. PROSES CHECKOUT (MIDTRANS) ---
async function processCheckout() {
    if (!isShopOpen) return showCustomerToast("❌ Toko sedang tutup!"); 
    
    const name = document.getElementById('cust-name').value;
    const phone = document.getElementById('cust-phone').value;
    
    if(!name || !phone || !cart.length) {
        return showCustomerToast("⚠️ Harap lengkapi Nama dan No. WhatsApp!");
    }
    
    const checkoutBtn = document.querySelector('.checkout-form button');
    const originalText = checkoutBtn.innerText;
    checkoutBtn.innerText = "Memproses...";
    checkoutBtn.disabled = true;

    try {
        const response = await fetch('/create-transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                items: cart, 
                customer: { name, phone }, 
                total: cart.reduce((s, i) => s + (i.price * i.qty), 0) 
            })
        });
        
        const data = await response.json();
        
        if(data.token) {
            window.snap.pay(data.token, { 
                onSuccess: () => { 
                    showCustomerToast("🎉 Pembayaran Berhasil! Pesanan diproses."); 
                    cart=[]; 
                    saveCart(); 
                    toggleCart(false);
                    setTimeout(() => location.reload(), 2000);
                },
                onPending: () => { showCustomerToast("⏳ Menunggu pembayaran..."); },
                onError: () => { showCustomerToast("❌ Pembayaran gagal."); }
            });
        } else {
            showCustomerToast("Gagal mendapatkan token pembayaran.");
        }
    } catch (e) { 
        showCustomerToast("🔌 Gangguan koneksi saat checkout."); 
        console.error(e);
    } finally {
        checkoutBtn.innerText = originalText;
        checkoutBtn.disabled = false;
    }
}