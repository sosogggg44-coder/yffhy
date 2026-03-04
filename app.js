const SUPABASE_URL = "https://amuopyagznrsyojqxaqp.supabase.co";
const SUPABASE_KEY = "sb_publishable_VEEiRh3zLWxhzIwgJBcvLw_f0hABb0u";

let supabaseClient;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof supabase === 'undefined') {
            console.error('Supabase library not loaded!');
            alert('خطأ: لم يتم تحميل مكتبة Supabase. تأكد من اتصال الإنترنت.');
            return;
        }

        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('Supabase Client initialized');
        loadGallery();
    } catch (e) {
        console.error('Initialization error:', e);
    }
});

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const uploadBtn = document.querySelector('.upload-btn');
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');
const progressFill = document.getElementById('progress-fill');
const statusMessage = document.getElementById('status-message');
const gallery = document.getElementById('image-gallery');
const refreshBtn = document.getElementById('refresh-btn');

// --- Upload Logic ---
dropZone.addEventListener('click', (e) => {
    if (e.target !== fileInput) fileInput.click();
});

if (uploadBtn) {
    uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent double trigger from dropZone
        fileInput.click();
    });
}

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleUpload(e.target.files[0]);
    }
});

async function handleUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('الرجاء اختيار ملف صورة فقط');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('حجم الملف كبير جداً (الحد الأقصى 5MB)');
        return;
    }

    uploadStatus.classList.remove('hidden');
    progressFill.style.width = '0%';
    statusMessage.textContent = 'جاري المعالجة...';

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
        statusMessage.textContent = 'جاري الرفع إلى المخزن...';

        // 1. Upload to Storage
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('images')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        progressFill.style.width = '50%';
        statusMessage.textContent = 'تم الرفع! جاري حفظ البيانات...';

        // 2. Get Public URL
        const { data: urlData } = supabaseClient.storage
            .from('images')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        // 3. Store in Database
        const { error: dbError } = await supabaseClient
            .from('images_gallery')
            .insert([
                { name: file.name, url: publicUrl }
            ]);

        if (dbError) {
            console.warn('Metadata insertion failed, but file was uploaded:', dbError);
            // We'll continue anyway as the file is in storage
        }

        progressFill.style.width = '100%';
        statusMessage.textContent = 'تم الحفظ بنجاح!';

        setTimeout(() => {
            uploadStatus.classList.add('hidden');
            loadGallery();
        }, 1500);

    } catch (error) {
        console.error('Upload error:', error);
        statusMessage.textContent = 'حدث خطأ أثناء الرفع';
        progressFill.style.backgroundColor = 'var(--secondary)';
        alert(`خطأ: ${error.message}`);
    }
}

// --- Gallery Logic ---
async function loadGallery() {
    gallery.innerHTML = '<div class="loader">جاري تحميل الصور...</div>';

    try {
        // Fetch from Database table instead of Storage list
        const { data, error } = await supabaseClient
            .from('images_gallery')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('Database fetch failed, falling back to Storage list:', error);
            return loadGalleryFromStorage();
        }

        if (data.length === 0) {
            gallery.innerHTML = '<div class="loader">المعرض فارغ حالياً. كن أول من يرفع صورة!</div>';
            return;
        }

        gallery.innerHTML = '';

        data.forEach(item => {
            const card = document.createElement('div');
            card.className = 'image-card';

            const img = document.createElement('img');
            img.src = item.url;
            img.loading = 'lazy';
            img.alt = item.name;

            card.appendChild(img);
            card.onclick = () => openModal(item.url, item.name);

            gallery.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading gallery:', error);
        gallery.innerHTML = '<div class="loader">فشل تحميل المعرض.</div>';
    }
}

// Fallback method
async function loadGalleryFromStorage() {
    try {
        const { data, error } = await supabaseClient.storage
            .from('images')
            .list('', { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });

        if (error) throw error;

        gallery.innerHTML = '';
        data.forEach(item => {
            if (item.name === '.emptyFolderPlaceholder') return;
            const { data: urlData } = supabaseClient.storage.from('images').getPublicUrl(item.name);
            const card = document.createElement('div');
            card.className = 'image-card';
            const img = document.createElement('img');
            img.src = urlData.publicUrl;
            card.appendChild(img);
            card.onclick = () => openModal(urlData.publicUrl, item.name);
            gallery.appendChild(card);
        });
    } catch (e) {
        gallery.innerHTML = '<div class="loader">خطأ في الاتصال بسوبابيس.</div>';
    }
}

refreshBtn.addEventListener('click', loadGallery);

// --- Modal Logic ---
const modal = document.getElementById('image-modal');
const modalImg = document.getElementById('img01');
const captionText = document.getElementById('caption');
const closeBtn = document.getElementsByClassName('close-modal')[0];

function openModal(src, name) {
    modal.style.display = 'block';
    modalImg.src = src;
    captionText.innerHTML = name;
}

closeBtn.onclick = () => modal.style.display = 'none';
window.onclick = (e) => {
    if (e.target == modal) modal.style.display = 'none';
};
