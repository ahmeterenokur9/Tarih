import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, doc, updateDoc, getDocs, where, writeBatch, deleteDoc, getDoc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
// HATA DÜZELTMESİ: Google'ın resmi Web SDK'sı import edildi.
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// --- Gemini AI Config ---
const GEMINI_API_KEY = "AIzaSyAALgE91TdjnIcWkty9_fhfZh3mXpSrsac";
// HATA DÜZELTMESİ: Eski API URL'si kaldırıldı, yerine SDK istemcisi oluşturuldu.
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const headerStreakDisplay = document.getElementById('header-streak-display');
// --- DOM Elements ---
// Course elements
const courseBreakdownDiv = document.getElementById('course-breakdown');

const coursesContainer = document.getElementById('courses-container');
const courseNameInput = document.getElementById('course-name-input');
const addCourseBtn = document.getElementById('add-course-btn');
const coursesListDiv = document.getElementById('courses-list');
const selectedCourseTitle = document.getElementById('selected-course-title');
const backToCoursesBtn = document.getElementById('back-to-courses-btn');

// Unit elements
const unitNameInput = document.getElementById('unit-name-input');
const addUnitBtn = document.getElementById('add-unit-btn');
const unitsListDiv = document.getElementById('units-list');
const unitsContainer = document.getElementById('units-container');

// Note elements
const notesContainer = document.getElementById('notes-container');
const unmemorizedNotesListDiv = document.getElementById('unmemorized-notes-list');
const memorizedNotesListDiv = document.getElementById('memorized-notes-list');
const selectedUnitTitle = document.getElementById('selected-unit-title');
const notesStatsDisplay = document.getElementById('notes-stats-display');
const addNoteContainer = document.getElementById('add-note-container');
const showAddNoteFormBtn = document.getElementById('show-add-note-form-btn');
const cancelAddNoteBtn = document.getElementById('cancel-add-note-btn');
const noteTextInput = document.getElementById('note-text-input');
const selectedKeywordDisplay = document.getElementById('selected-keyword-display');
const noteCategoryInput = document.getElementById('note-category-input');
const categoriesDatalist = document.getElementById('categories-datalist');
const addNoteBtn = document.getElementById('add-note-btn');
const backToUnitsBtn = document.getElementById('back-to-units-btn');
// Search inputs
const searchUnmemorizedInput = document.getElementById('search-unmemorized');
const searchMemorizedInput = document.getElementById('search-memorized');

// Quiz elements
const quizContainer = document.getElementById('quiz-container');
const quizQuestion = document.getElementById('quiz-question');
const quizOptions = document.getElementById('quiz-options');
const quizFeedback = document.getElementById('quiz-feedback');
// Theme switcher
const themeToggle = document.getElementById('theme-toggle');
// Modal elements
const editModal = document.getElementById('edit-modal');
const modalTitle = document.getElementById('modal-title');
const modalTextarea = document.getElementById('modal-textarea');
const modalSaveBtn = document.getElementById('modal-save-btn');
const closeBtn = document.querySelector('.close-btn');
// Batch review controls are now within notesContainer
const notesView = document.getElementById('notes-view'); 
// Global review button
const randomReviewBtn = document.getElementById('random-review-btn');
// Streak display
const streakContainer = document.getElementById('streak-container');
const streakCountDisplay = document.querySelector('#streak-container .streak-count');
const streakProgressText = document.querySelector('#streak-container .progress-text');

// AI Chat Modal elements
const aiChatModal = document.getElementById('ai-chat-modal');
const aiChatHistory = document.getElementById('ai-chat-history');
const aiChatInput = document.getElementById('ai-chat-input');
const aiSendBtn = document.getElementById('ai-send-btn');
const aiChatCloseBtn = aiChatModal.querySelector('.close-btn');


// --- State Variables ---
let selectedCourseId = null;
let selectedCourseName = null;
let selectedUnitId = null;
let selectedUnitName = null;
let selectedKeyword = ''; // To store the highlighted keyword
let unsubscribeNotes = null; // To stop listening to previous unit's notes
let currentEdit = { type: null, id: null, originalData: null }; // To manage what we are editing
let currentAiChatNote = null; // To store context for AI chat
let quizQueue = [];

// --- LOCAL CACHE (Yerel Önbellek) ---
let localCache = {
    courses: {},      // courseId: { name, data }
    units: {},        // courseId: { unitId: { name, data } }
    notes: {},        // courseId: { unitId: { noteId: note } }
    userStats: null,  // Seri bilgisi
    lastSync: null    // Son güncelleme zamanı
};
let cacheLoaded = false; // Cache yüklendi mi?

let currentQuizIndex = 0;

// --- Helper Functions ---
const isSameDay = (date1, date2) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
};

const resetAddNoteForm = () => {
    noteTextInput.value = '';
    noteCategoryInput.value = '';
    selectedKeyword = '';
    selectedKeywordDisplay.textContent = 'Henüz seçilmedi. (Metinden seçin)';
    selectedKeywordDisplay.style.fontStyle = 'italic';
};

// --- Streak Management ---
const DAILY_GOAL = 100;

const COURSE_DAILY_MINIMUMS = { 
    "28osYiGGSkK2uONL2k1a": 20,
    "Ny9BvgeK5iraMYAvV9RR": 50,
    "ME0GYyrFQr1Oysycx4vS": 80,
    "gndRxkX7oOf12fcQ2biq": 50


    
};

// courseId -> course name map (uygulama içinde kullanılacak)
let courseNameMap = {};

// Firestore'dan courses koleksiyonunu okuyup id->isim map'i oluşturur.
// Çağrıldığında courseNameMap'i doldurur.
const loadCourseNameMap = () => {
    // CACHE'DEN OKU - Firebase'e gitme
    for (const id in localCache.courses) {
        courseNameMap[id] = localCache.courses[id].name || id;
    }
};

// TEK SEFERLIK BÜTÜN VERİYİ ÇEK
const loadAllDataOnce = async () => {
    if (cacheLoaded) {
        console.log("✅ Cache zaten yüklü, Firebase'e gitmiyoruz!");
        return; // Zaten yüklendi, tekrar çekme!
    }
    
    console.log("📥 İlk yükleme başlıyor... Tüm veriler çekiliyor...");
    
    try {
        // 1. COURSES (Dersler)
        const coursesSnap = await getDocs(collection(db, 'courses'));
        coursesSnap.forEach(doc => {
            localCache.courses[doc.id] = { id: doc.id, ...doc.data() };
            localCache.units[doc.id] = {};
            localCache.notes[doc.id] = {};
        });
        
        // 2. UNITS (Üniteler) - Her ders için
        for (const courseId in localCache.courses) {
            const unitsSnap = await getDocs(collection(db, `courses/${courseId}/units`));
            unitsSnap.forEach(doc => {
                localCache.units[courseId][doc.id] = { id: doc.id, ...doc.data() };
                localCache.notes[courseId][doc.id] = {};
            });
        }
        
        // 3. NOTES (Notlar) - Her ünite için
        for (const courseId in localCache.units) {
            for (const unitId in localCache.units[courseId]) {
                const notesSnap = await getDocs(collection(db, `courses/${courseId}/units/${unitId}/notes`));
                notesSnap.forEach(doc => {
                    localCache.notes[courseId][unitId][doc.id] = { id: doc.id, ...doc.data() };
                });
            }
        }
        
        // 4. USER STATS (Seri)
        const statsSnap = await getDoc(doc(db, 'userStats', 'main'));
        if (statsSnap.exists()) {
            localCache.userStats = statsSnap.data();
        }
        
        localCache.lastSync = new Date();
        cacheLoaded = true;
        console.log("✅ TÜM VERİLER YÜKLENDİ! Artık Firebase'e gitmeyeceğiz!");
        console.log("📊 Yüklenen:", {
            dersler: Object.keys(localCache.courses).length,
            toplam_üniteler: Object.values(localCache.units).reduce((sum, units) => sum + Object.keys(units).length, 0),
            toplam_notlar: Object.values(localCache.notes).reduce((sum, course) => 
                sum + Object.values(course).reduce((s2, unit) => s2 + Object.keys(unit).length, 0), 0)
        });
        
    } catch (error) {
        console.error("❌ Veri yükleme hatası:", error);
        alert("Veriler yüklenirken hata oluştu. Sayfayı yenileyin.");
    }
};


const displayStreak = async () => {
    try {
        // CACHE'DEN OKU
        const data = localCache.userStats;

        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        // Varsayılanlar
        let streak = 0;
        let questionsToday = 0;
        let lastStreakDate = null;
        let questionsTodayDate = null;
        let dailyCourseStats = {};

        if (data) {
            streak = data.streak || 0;
            lastStreakDate = data.lastStreakDate?.toDate ? data.lastStreakDate.toDate() : (data.lastStreakDate || null);
            questionsTodayDate = data.questionsTodayDate?.toDate ? data.questionsTodayDate.toDate() : (data.questionsTodayDate || null);

            // YENİ GÜN KONTROLÜ - BURADA SIFIRLAMA YAPILIYOR!
            if (questionsTodayDate && !isSameDay(questionsTodayDate, todayDateOnly)) {
                // Yeni gün başladı! Sayaçları sıfırla
                questionsToday = 0;
                dailyCourseStats = {};
                
                // Firebase'e yaz
                const statsRef = doc(db, 'userStats', 'main');
                const newStats = {
                    questionsToday: 0,
                    questionsTodayDate: Timestamp.fromDate(todayDateOnly),
                    streak,
                    lastStreakDate: lastStreakDate ? Timestamp.fromDate(lastStreakDate) : null,
                    dailyCourseStats: {}
                };
                await setDoc(statsRef, newStats, { merge: true });
                
                // Cache'i güncelle
                localCache.userStats = {
                    ...localCache.userStats,
                    questionsToday: 0,
                    questionsTodayDate: todayDateOnly,
                    dailyCourseStats: {}
                };
            } else if (questionsTodayDate && isSameDay(questionsTodayDate, todayDateOnly)) {
                // Bugünün verileri
                questionsToday = data.questionsToday || 0;
                dailyCourseStats = data.dailyCourseStats || {};
            } else {
                // İlk kez açılıyor, veri yok
                questionsToday = 0;
                dailyCourseStats = {};
            }
        }

        // Update UI numeric parts
        streakCountDisplay.textContent = `${streak} Gün`;
        streakProgressText.textContent = `Bugünkü Hedef: ${questionsToday} / ${DAILY_GOAL}`;

        // Header fire
        if (streak > 0) {
            headerStreakDisplay.textContent = `🔥 ${streak}`;
            headerStreakDisplay.style.display = 'block';
        } else {
            headerStreakDisplay.style.display = 'none';
        }

        // Update card style based on today's goal completion, not the streak itself
        // Ders minimumlarını kontrol et
let courseConditionsMet = true;

for (const requiredCourseId in COURSE_DAILY_MINIMUMS) {
    const required = COURSE_DAILY_MINIMUMS[requiredCourseId];
    const solved = dailyCourseStats[requiredCourseId] || 0;
    if (solved < required) {
        courseConditionsMet = false;
        break;
    }
}

// Kart stilini gerçek streak durumuna göre ayarla
if (questionsToday >= DAILY_GOAL && courseConditionsMet) {
    streakContainer.classList.remove('inactive');
} else {
    streakContainer.classList.add('inactive');
}


        // --- Yeni: Ders Bazlı Gösterim ---
        if (courseBreakdownDiv) {
            let breakdownHTML = '<h4>Ders Bazlı</h4>';
            // COURSE_DAILY_MINIMUMS anahtarları courseId şeklinde tanımlı (senin kodunda öyle)
            for (const courseId in COURSE_DAILY_MINIMUMS) {
                const required = COURSE_DAILY_MINIMUMS[courseId];
                const solved = dailyCourseStats[courseId] || 0;
                const done = solved >= required;
                const courseName = courseNameMap[courseId] || courseId; // eğer map boşsa ID gösterilir

                breakdownHTML += `
                    <div class="course-item">
                        <div class="name">${courseName}</div>
                        <div class="status">${solved} / ${required} ${done ? '✅' : ''}</div>
                    </div>
                `;
            }
            courseBreakdownDiv.innerHTML = breakdownHTML;
        }

    } catch (error) {
        console.error("Error displaying streak: ", error);
        streakCountDisplay.textContent = 'Hata';
    }
};

const updateStreak = async (quizQueue) => {
    try {
        const statsRef = doc(db, 'userStats', 'main');

        const today = new Date();
        const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        let streak = 0;
        let questionsToday = 0;
        let lastStreakDate = null;
        let questionsTodayDate = null;
        let dailyCourseStats = {};

        // CACHE'DEN OKU
        const data = localCache.userStats;
        if (data) {
            streak = data.streak || 0;
            lastStreakDate = data.lastStreakDate?.toDate ? data.lastStreakDate.toDate() : (data.lastStreakDate || null);
            questionsToday = data.questionsToday || 0;
            questionsTodayDate = data.questionsTodayDate?.toDate ? data.questionsTodayDate.toDate() : (data.questionsTodayDate || null);
            dailyCourseStats = data.dailyCourseStats || {};
        }

        // Yeni gün başladıysa bugünkü sayaçları sıfırla
        if (!questionsTodayDate || !isSameDay(questionsTodayDate, todayDateOnly)) {
            questionsToday = 0;
            dailyCourseStats = {};
        }

        // 1) Bu testten gelen soruları ekle
        const addedQuestions = Array.isArray(quizQueue) ? quizQueue.length : 0;
        questionsToday += addedQuestions;

        // 2) Her not için courseId bazlı sayacı artır
        if (Array.isArray(quizQueue)) {
            quizQueue.forEach(note => {
                const cid = note.courseId || null;
                if (!cid) return;
                if (!dailyCourseStats[cid]) dailyCourseStats[cid] = 0;
                dailyCourseStats[cid] += 1;
            });
        }

        // 3) Ders bazlı zorunlu minimumları kontrol et
        let courseConditionsMet = true;
        for (const requiredCourseId in COURSE_DAILY_MINIMUMS) {
            const required = COURSE_DAILY_MINIMUMS[requiredCourseId];
            const solved = dailyCourseStats[requiredCourseId] || 0;
            if (solved < required) {
                courseConditionsMet = false;
                break;
            }
        }

        // 4) Streak karar: SADECE tüm hedefler dolduğunda artır, dolmamışsa DOKUNMA
        if (questionsToday >= DAILY_GOAL && courseConditionsMet) {
            // Bugün daha önce streak artırıldıysa tekrar artırma
            if (!lastStreakDate || !isSameDay(lastStreakDate, todayDateOnly)) {
                const yesterday = new Date(todayDateOnly);
                yesterday.setDate(todayDateOnly.getDate() - 1);

                if (lastStreakDate && isSameDay(lastStreakDate, yesterday)) {
                    // Dün de tamamlanmış -> artır
                    streak = (streak || 0) + 1;
                } else {
                    // Dün tamamlanmamış ya da ilk kez -> 1'den başla
                    streak = 1;
                }
                lastStreakDate = todayDateOnly;
            }
            // else: bugün zaten artırıldı, hiçbey şey yapma
        }
        // else: hedefler henüz dolmadı -> streak'e DOKUNMA (sıfırlama yok!)

        // 5) Firebase'e kaydet
        const newStats = {
            questionsToday,
            questionsTodayDate: Timestamp.fromDate(todayDateOnly),
            streak,
            lastStreakDate: lastStreakDate ? Timestamp.fromDate(lastStreakDate) : null,
            dailyCourseStats
        };
        await setDoc(statsRef, newStats, { merge: true });

        // 6) CACHE'İ GÜNCELLE
        localCache.userStats = {
            ...localCache.userStats,
            questionsToday,
            questionsTodayDate: todayDateOnly,
            streak,
            lastStreakDate: lastStreakDate,
            dailyCourseStats
        };

    } catch (error) {
        console.error("Error in updateStreak:", error);
    }
};



// --- SVG Icons ---
const editIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
const deleteIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
const aiIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-1.2 0-2.4.6-3 1.7A3.5 3.5 0 0 0 3.5 8c0 2.2 1.8 4 4 4h9c2.2 0 4-1.8 4-4s-1.8-4-4-4c-.5 0-1 .1-1.5.3A3.5 3.5 0 0 0 12 3z"></path><path d="M12 12v9"></path><path d="m9 21 6-6"></path></svg>`;


// --- Theme Management ---
const setTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    themeToggle.checked = theme === 'dark';
};

themeToggle.addEventListener('change', () => {
    setTheme(themeToggle.checked ? 'dark' : 'light');
});

const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);

// --- Settings Modal ---
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close-btn');

settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
    populateImportCourseSelect();
});

settingsCloseBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
});

settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.style.display = 'none';
});

// --- JSON Import ---
const importCourseSelect = document.getElementById('import-course-select');
const importUnitSelect = document.getElementById('import-unit-select');
const importJsonInput = document.getElementById('import-json-input');
const importBtn = document.getElementById('import-btn');
const importStatus = document.getElementById('import-status');

const populateImportCourseSelect = () => {
    importCourseSelect.innerHTML = '<option value="">-- Ders seçin --</option>';
    const coursesObj = localCache.courses || {};
    Object.entries(coursesObj).forEach(([id, course]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = course.name;
        importCourseSelect.appendChild(opt);
    });
    importUnitSelect.innerHTML = '<option value="">-- Önce ders seçin --</option>';
    importUnitSelect.disabled = true;
    importBtn.disabled = true;
};

importCourseSelect.addEventListener('change', () => {
    const courseId = importCourseSelect.value;
    importUnitSelect.innerHTML = '<option value="">-- Ünite seçin --</option>';
    importUnitSelect.disabled = !courseId;
    importBtn.disabled = true;
    if (!courseId) return;
    const unitsObj = localCache.units[courseId] || {};
    Object.entries(unitsObj).forEach(([id, unit]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = unit.name;
        importUnitSelect.appendChild(opt);
    });
});

importUnitSelect.addEventListener('change', () => {
    importBtn.disabled = !importUnitSelect.value;
});

const showImportStatus = (msg, type) => {
    importStatus.style.display = 'block';
    importStatus.textContent = msg;
    importStatus.className = `import-status import-status-${type}`;
};

importBtn.addEventListener('click', async () => {
    const courseId = importCourseSelect.value;
    const unitId = importUnitSelect.value;
    const jsonText = importJsonInput.value.trim();

    if (!courseId || !unitId || !jsonText) return;

    let notes;
    try {
        notes = JSON.parse(jsonText);
        if (!Array.isArray(notes)) throw new Error('JSON bir dizi olmalı.');
    } catch (e) {
        showImportStatus('❌ Geçersiz JSON: ' + e.message, 'error');
        return;
    }

    // Validasyon
    const invalid = notes.filter(n => !n.keyword || !n.noteText || !n.category);
    if (invalid.length > 0) {
        showImportStatus(`❌ ${invalid.length} notta keyword, noteText veya category eksik.`, 'error');
        return;
    }

    importBtn.disabled = true;
    importBtn.textContent = 'Ekleniyor...';
    showImportStatus(`⏳ ${notes.length} not Firebase'e yazılıyor...`, 'info');

    const now = new Date();
    let successCount = 0;
    let errorCount = 0;

    if (!localCache.notes[courseId]) localCache.notes[courseId] = {};
    if (!localCache.notes[courseId][unitId]) localCache.notes[courseId][unitId] = {};

    for (const note of notes) {
        try {
            const newNote = {
                noteText: note.noteText,
                keyword: note.keyword,
                category: note.category,
                status: note.status || 'Ezberlenmemiş',
                confidenceLevel: note.confidenceLevel || 0,
                frequency: note.frequency || 5,
                createdAt: now,
                lastReviewedAt: now,
                decayLastAppliedAt: now,
                testCorrectCount: note.testCorrectCount || 0,
                testIncorrectCount: note.testIncorrectCount || 0,
            };
            const docRef = await addDoc(collection(db, `courses/${courseId}/units/${unitId}/notes`), newNote);
            newNote.id = docRef.id;
            localCache.notes[courseId][unitId][docRef.id] = newNote;
            successCount++;
            showImportStatus(`⏳ ${successCount}/${notes.length} not eklendi...`, 'info');
        } catch (e) {
            console.error('Not eklenemedi:', e);
            errorCount++;
        }
    }

    importBtn.disabled = false;
    importBtn.textContent = 'İçe Aktar';
    importJsonInput.value = '';

    if (errorCount === 0) {
        showImportStatus(`✅ ${successCount} not başarıyla eklendi!`, 'success');
    } else {
        showImportStatus(`⚠️ ${successCount} not eklendi, ${errorCount} hata oluştu.`, 'warning');
    }

    // Eğer şu an aynı ünite açıksa yenile
    if (selectedCourseId === courseId && selectedUnitId === unitId) {
        displayNotes(unitId);
    }
});


// --- Modal Management ---
const openEditModal = (type, id, data) => {
    currentEdit = { type, id, originalData: data };
    if (type === 'unit') {
        modalTitle.textContent = 'Ünite Adını Düzenle';
        modalTextarea.value = data.name;
    } else {
        modalTitle.textContent = 'Notu Düzenle';
        modalTextarea.value = data.noteText;
    }
    editModal.style.display = 'block';
};

const closeEditModal = () => {
    editModal.style.display = 'none';
    currentEdit = { type: null, id: null, originalData: null };
};

closeBtn.addEventListener('click', closeEditModal);
window.addEventListener('click', (event) => {
    if (event.target == editModal) {
        closeEditModal();
    }
});

// --- AI Chat Modal Management ---
const openAiChatModal = (noteText) => {
    currentAiChatNote = noteText;
    aiChatHistory.innerHTML = `<div class="system-message">Bu not hakkında sohbet et: "<strong>${noteText}</strong>"</div>`;
    aiChatInput.value = '';
    aiChatModal.style.display = 'block';
    aiChatInput.focus();
};

const closeAiChatModal = () => {
    aiChatModal.style.display = 'none';
    currentAiChatNote = null;
};

const appendToChatHistory = (html) => {
    aiChatHistory.innerHTML += html;
    aiChatHistory.scrollTop = aiChatHistory.scrollHeight; // Auto-scroll to bottom
};

const handleAiChatSend = async () => {
    const userInput = aiChatInput.value.trim();
    if (!userInput || !currentAiChatNote) return;

    aiChatInput.value = ''; // Clear input
    appendToChatHistory(`<div class="chat-message user-message">${userInput}</div>`);
    
    const loadingId = `loading-${Date.now()}`;
    appendToChatHistory(`<div class="chat-message ai-message ai-loading" id="${loadingId}">Y. Zeka düşünüyor...</div>`);
    
    try {
        // HATA DÜZELTMESİ: SDK kullanılarak model ve prompt oluşturuldu.
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        const prompt = `Şu bilgi notu verildi: "${currentAiChatNote}". kullanıcı kendisi bu notu ekledi ve şimdi sana bir mesajı var mesajını cevapla amacın kullanacının öğrenme yolculuğunda ona yardımcı olmak ve bilgileri ve tarihi akışı öğrenmesini kolaylaştırmak ama uzun ve detaylı olarak değil kısa ve öz olarak cevap vereceksin: "${userInput}"`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponse = response.text();
        
        const loadingElement = document.getElementById(loadingId);
        loadingElement.classList.remove('ai-loading');
        loadingElement.textContent = aiResponse;

    } catch (error) {
        console.error("Gemini API Error:", error);
        const loadingElement = document.getElementById(loadingId);
        loadingElement.classList.remove('ai-loading');
        loadingElement.textContent = "Üzgünüm, bir hata oluştu. API anahtarını veya model adını kontrol edin.";
    }
};


aiChatCloseBtn.addEventListener('click', closeAiChatModal);
aiSendBtn.addEventListener('click', handleAiChatSend);
aiChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAiChatSend();
    }
});
window.addEventListener('click', (event) => {
    if (event.target == aiChatModal) {
        closeAiChatModal();
    }
});



// Global Random Review Event Listener
// YENİ DİNAMİK KODU YAPIŞTIR:
document.querySelectorAll('.global-rand-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!selectedCourseId) return;
        
        const countToSelect = parseInt(btn.dataset.count); // Butondaki 20, 30 vs. değerini alır
        const unitsRef = collection(db, `courses/${selectedCourseId}/units`);
        
        try {
            const unitsSnapshot = await getDocs(unitsRef);
            let allNotes = [];

            // Tüm üniteleri gez ve içindeki notları topla
            for (const unitDoc of unitsSnapshot.docs) {
                const notesSnapshot = await getDocs(collection(db, `courses/${selectedCourseId}/units/${unitDoc.id}/notes`));
                notesSnapshot.forEach(noteDoc => {
                    allNotes.push({ 
                        id: noteDoc.id, 
                        unitId: unitDoc.id, 
                        courseId: selectedCourseId, 
                        ...noteDoc.data() 
                    });
                });
            }

            if (allNotes.length === 0) {
                alert('Bu derste henüz hiç not bulunamadı!');
                return;
            }

            // Notları karıştır ve butondaki sayı kadarını seç
            allNotes.sort(() => 0.5 - Math.random());
            const selectedNotes = allNotes.slice(0, countToSelect);
            
            startQuizSession(selectedNotes);
        } catch (error) {
            console.error("Genel test hatası: ", error);
            alert("Test başlatılırken bir hata oluştu.");
        }
    });
});



// --- UI Interactions ---
showAddNoteFormBtn.addEventListener('click', () => {
    const isVisible = addNoteContainer.style.display === 'block';
    addNoteContainer.style.display = isVisible ? 'none' : 'block';
    showAddNoteFormBtn.textContent = isVisible ? '+ Yeni Not Ekle' : 'Formu Kapat';
});

cancelAddNoteBtn.addEventListener('click', () => {
    addNoteContainer.style.display = 'none';
    showAddNoteFormBtn.textContent = '+ Yeni Not Ekle';
    resetAddNoteForm();
});


// --- Search Functionality ---
const filterNotes = (searchTerm, noteListElement) => {
    const notes = noteListElement.querySelectorAll('.note-item');
    const term = searchTerm.toLowerCase();

    notes.forEach(note => {
        const noteText = note.querySelector('.note-content p')?.textContent.toLowerCase() || '';
        const noteCategory = note.querySelector('.note-content .category')?.textContent.toLowerCase() || '';
        const isVisible = noteText.includes(term) || noteCategory.includes(term);
        note.style.display = isVisible ? '' : 'none';
    });
};

searchUnmemorizedInput.addEventListener('input', (e) => {
    filterNotes(e.target.value, unmemorizedNotesListDiv);
});

searchMemorizedInput.addEventListener('input', (e) => {
    filterNotes(e.target.value, memorizedNotesListDiv);
});


// Batch Review Event Listener
// Event Delegation for Batch Reviews inside Notes Container
// --- YENİ RASTGELE TEST MANTIĞI ---
notesContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('batch-btn')) {
        const button = e.target;
        const type = button.dataset.type; // HTML'deki data-type: "10" veya "all"

        // Statü fark etmeksizin ünitedeki tüm notları referans alıyoruz
        const notesRef = collection(db, `courses/${selectedCourseId}/units/${selectedUnitId}/notes`);
        
        try {
            const snapshot = await getDocs(notesRef);
            let allUnitNotes = [];
            
            snapshot.forEach(doc => {
                allUnitNotes.push({ 
                    id: doc.id, 
                    unitId: selectedUnitId, 
                    courseId: selectedCourseId, 
                    ...doc.data() 
                });
            });

            if (allUnitNotes.length === 0) {
                alert('Bu ünitede henüz test edilecek not bulunamadı!');
                return;
            }

            // 1. Tüm notları tamamen rastgele karıştır
            allUnitNotes.sort(() => 0.5 - Math.random());

            // 2. Seçime göre notları ayır
            let selectedNotes;
            if (type === 'all') {
                selectedNotes = allUnitNotes;
            } else {
                const limit = parseInt(type, 10); // data-type="10" ise 10 tane al
                selectedNotes = allUnitNotes.slice(0, limit);
            }
            
            startQuizSession(selectedNotes);

        } catch (error) {
            console.error("Notlar çekilirken hata oluştu: ", error);
            alert('Test başlatılamadı, bir hata oluştu.');
        }
    }
});

modalSaveBtn.addEventListener('click', async () => {
    const newText = modalTextarea.value.trim();
    if (!newText) {
        alert('İçerik boş olamaz.');
        return;
    }

    const { type, id, originalData } = currentEdit;
    if (!type || !id) return;

    try {
        if (type === 'unit') {
            await updateDoc(doc(db, 'units', id), { name: newText });
        } else if (type === 'note') {
            // Check if the original keyword is still in the new text
            if (!newText.includes(originalData.keyword)) {
                if (!confirm('Anahtar kelime artık not içinde bulunmuyor. Bu, test işlevini bozabilir. Yine de devam etmek istiyor musunuz?')) {
                    return;
                }
            }
            await updateDoc(doc(db, `courses/${selectedCourseId}/units/${selectedUnitId}/notes`, id), { noteText: newText });
        }
        closeEditModal();
    } catch (error) {
        console.error(`Error updating ${type}:`, error);
        alert('Güncelleme sırasında bir hata oluştu.');
    }
});


// --- Confidence Level Decay Logic ---

const checkAndUpdateConfidenceLevels = async (courseId, unitId) => {
    const notesRef = collection(db, `courses/${courseId}/units/${unitId}/notes`);
    const q = query(notesRef, where('status', '==', 'Ezberlenmiş'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    const batch = writeBatch(db);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    snapshot.forEach(document => {
        const note = document.data();
        const noteId = document.id;
        
        // --- Core Fix: Check if decay was already applied today ---
        if (note.decayLastAppliedAt && isSameDay(note.decayLastAppliedAt.toDate(), today)) {
            return; // Skip this note, decay already applied for today.
        }

        if (!note.lastReviewedAt || typeof note.lastReviewedAt.toDate !== 'function') return;
        
        const lastReviewed = note.lastReviewedAt.toDate();
        const lastReviewedStart = new Date(lastReviewed.getFullYear(), lastReviewed.getMonth(), lastReviewed.getDate());

        const msPerDay = 1000 * 60 * 60 * 24;
        const daysPassed = Math.round((todayStart - lastReviewedStart) / msPerDay);

        if (daysPassed > 0) {
            const decayAmount = daysPassed * 3;
            let newConfidence = Math.max(0, note.confidenceLevel - decayAmount);
            const docRef = doc(db, `courses/${courseId}/units/${unitId}/notes`, noteId);

            if (newConfidence < 15) {
                batch.update(docRef, {
                    status: 'Ezberlenmemiş',
                    confidenceLevel: 0,
                    decayLastAppliedAt: today // Stamp it
                });
            } else {
                batch.update(docRef, {
                    confidenceLevel: newConfidence,
                    decayLastAppliedAt: today // Stamp it
                });
            }
        }
    });

    if (!batch.empty) {
        await batch.commit();
    }
};


// --- CRUD Operations ---

// Get Stats for a Unit
const getUnitStats = async (courseId, unitId) => {
    const notesRef = collection(db, `courses/${courseId}/units/${unitId}/notes`);
    const snapshot = await getDocs(notesRef);
    const totalCount = snapshot.size;
    
    const memorizedQuery = query(notesRef, where('status', '==', 'Ezberlenmiş'));
    const memorizedSnapshot = await getDocs(memorizedQuery);
    const memorizedCount = memorizedSnapshot.size;
    
    return {
        total: totalCount,
        memorized: memorizedCount,
        unmemorized: totalCount - memorizedCount
    };
};

// Get Stats for a Course
const getCourseStats = async (courseId) => {
    const unitsRef = collection(db, `courses/${courseId}/units`);
    const unitsSnapshot = await getDocs(unitsRef);
    const unitCount = unitsSnapshot.size;
    let totalNoteCount = 0;

    for (const unitDoc of unitsSnapshot.docs) {
        const notesRef = collection(db, `courses/${courseId}/units/${unitDoc.id}/notes`);
        const notesSnapshot = await getDocs(notesRef);
        totalNoteCount += notesSnapshot.size;
    }

    return {
        units: unitCount,
        notes: totalNoteCount,
    };
};


// Delete Course
const deleteCourse = async (courseId) => {
    if (!confirm('Bu dersi ve içindeki tüm üniteleri/notları silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) return;
    try {
        // This is complex. We need to delete all notes in all units, then all units, then the course.
        const unitsSnapshot = await getDocs(collection(db, `courses/${courseId}/units`));
        for (const unitDoc of unitsSnapshot.docs) {
            await deleteUnit(courseId, unitDoc.id, false); // Call deleteUnit without confirmation
        }
        await deleteDoc(doc(db, 'courses', courseId));
    } catch (error) {
        console.error("Error deleting course: ", error);
        alert('Ders silinirken bir hata oluştu.');
    }
};


// Delete Unit
const deleteUnit = async (courseId, unitId, showConfirmation = true) => {
    if (showConfirmation && !confirm('Bu üniteyi ve içindeki tüm notları silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) return;
    try {
        // First, delete all notes in the subcollection
        const notesSnapshot = await getDocs(collection(db, `courses/${courseId}/units/${unitId}/notes`));
        const deleteBatch = writeBatch(db);
        notesSnapshot.forEach(doc => {
            deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
        
        // Then, delete the unit itself
        await deleteDoc(doc(db, `courses/${courseId}/units`, unitId));
    } catch (error) {
        console.error("Error deleting unit: ", error);
        alert('Ünite silinirken bir hata oluştu.');
    }
};

// Delete Note
const deleteNote = async (noteId) => {
    if (!confirm('Bu notu silmek istediğinizden emin misiniz?')) return;
    try {
        // Firebase'den sil
        await deleteDoc(doc(db, `courses/${selectedCourseId}/units/${selectedUnitId}/notes`, noteId));
        
        // CACHE'DEN SİL
        if (localCache.notes[selectedCourseId]?.[selectedUnitId]?.[noteId]) {
            delete localCache.notes[selectedCourseId][selectedUnitId][noteId];
        }

    } catch (error) {
        console.error("Error deleting note: ", error);
        alert('Not silinirken bir hata oluştu.');
    }
};

// --- Note Management ---

// Listen for text selection in the textarea
noteTextInput.addEventListener('mouseup', () => {
    const highlightedText = window.getSelection().toString().trim();
    if (highlightedText) {
        selectedKeyword = highlightedText;
        selectedKeywordDisplay.textContent = selectedKeyword;
        selectedKeywordDisplay.style.fontStyle = 'normal';
    }
});

const updateNoteStatus = async (courseId, unitId, noteId, newStatus, newConfidence, testStats = null) => {
    try {
        const updateData = {
            status: newStatus,
            confidenceLevel: newConfidence,
            lastReviewedAt: new Date()
        };

        if (testStats) {
            updateData.testCorrectCount = testStats.correct;
            updateData.testIncorrectCount = testStats.incorrect;
        }

        // Firebase'e yaz
        await updateDoc(doc(db, `courses/${courseId}/units/${unitId}/notes`, noteId), updateData);
        
        // CACHE'İ GÜNCELLE
        if (localCache.notes[courseId]?.[unitId]?.[noteId]) {
            Object.assign(localCache.notes[courseId][unitId][noteId], updateData);
        }

    } catch (error) {
        console.error("Error updating note status: ", error);
    }
};

const displayNotes = async (unitId) => {
    if (unsubscribeNotes) {
        unsubscribeNotes();
        unsubscribeNotes = null;
    }
    
    unmemorizedNotesListDiv.innerHTML = '';
    memorizedNotesListDiv.innerHTML = '';
    
    // CACHE'DEN OKU (Firebase'e gitme!)
    const notesObj = localCache.notes[selectedCourseId]?.[unitId] || {};
    const notesArray = Object.values(notesObj).map(n => ({ ...n, unitId: unitId, courseId: selectedCourseId }));
    
    const categories = new Set();
    let unmemorizedCount = 0;
    let memorizedCount = 0;
    const totalCount = notesArray.length;

    if (totalCount === 0) {
        unmemorizedNotesListDiv.innerHTML = '<p>Bu ünitede henüz not yok.</p>';
        memorizedNotesListDiv.innerHTML = '';
        notesStatsDisplay.innerHTML = '';
        categoriesDatalist.innerHTML = '';
        return;
    }

    notesArray.forEach(note => {
        categories.add(note.category);

        const noteId = note.id;
        const noteElement = document.createElement('div');
        noteElement.classList.add('note-item');
        noteElement.dataset.id = noteId;

        let actionsHtml = '';
        let statsHtml = '';
        const displayText = note.noteText.replace(note.keyword, `<b>${note.keyword}</b>`);

        if (note.status === 'Ezberlenmemiş') {
            actionsHtml = `
                <button class="test-unmemorized-btn secondary-btn">Test Et</button>
            `;
            const correct = note.testCorrectCount || 0;
            const incorrect = note.testIncorrectCount || 0;
            statsHtml = `
                <div class="note-learning-stats">
                    <span><b>Doğru:</b> ${correct}</span>
                    <span><b>Yanlış:</b> ${incorrect}</span>
                </div>
            `;
        } else {
            actionsHtml = `<button class="start-quiz-btn secondary-btn">Güven Tazelemek İçin Test Et</button><p><b>Güven Seviyesi:</b> ${note.confidenceLevel}%</p>`;
        }

        const freq = note.frequency || 5;

        noteElement.innerHTML = `
            <div class="note-content">
                <p>${displayText}</p>
                <span class="category">${note.category}</span>
                ${statsHtml}
            </div>
            <div class="note-info">
                 <div class="actions">
                    ${actionsHtml}
                </div>
                <div class="freq-picker-wrap">
                    <button class="freq-toggle-btn" data-note-id="${noteId}">🔁 Sıklık: <b class="freq-val">${freq}</b></button>
                    <div class="freq-picker" data-note-id="${noteId}" data-current="${freq}" style="display:none;">
                        ${Array.from({length: 50}, (_, i) => i + 1).map(n =>
                            `<span class="freq-box${n === freq ? ' active' : ''}" data-val="${n}">${n}</span>`
                        ).join('')}
                    </div>
                </div>
            </div>
            <div class="card-actions">
                <button class="action-btn ai-chat-btn" title="Y. Zeka ile Sohbet Et">${aiIconSVG}</button>
                <button class="action-btn edit-note-btn" title="Notu Düzenle">${editIconSVG}</button>
                <button class="action-btn delete-note-btn" title="Notu Sil">${deleteIconSVG}</button>
            </div>
        `;
        
        if (note.status === 'Ezberlenmemiş') {
            unmemorizedNotesListDiv.appendChild(noteElement);
            unmemorizedCount++;
        } else {
            memorizedNotesListDiv.appendChild(noteElement);
            memorizedCount++;
        }

        noteElement.querySelector('.delete-note-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteNote(noteId);
            displayNotes(unitId); // Sayfa yenile (Cache'den)
        });

        noteElement.querySelector('.edit-note-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal('note', noteId, note);
        });
        
        noteElement.querySelector('.ai-chat-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openAiChatModal(note.noteText);
        });

        // Frequency toggle
        noteElement.querySelector('.freq-toggle-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const picker = noteElement.querySelector('.freq-picker');
            picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
        });

        // Frequency picker
        noteElement.querySelector('.freq-picker').addEventListener('click', async (e) => {
            const box = e.target.closest('.freq-box');
            if (!box) return;
            const newFreq = parseInt(box.dataset.val);
            const picker = noteElement.querySelector('.freq-picker');
            // UI güncelle
            picker.querySelectorAll('.freq-box').forEach(b => b.classList.remove('active'));
            box.classList.add('active');
            noteElement.querySelector('.freq-val').textContent = newFreq;
            // Cache güncelle
            if (localCache.notes[selectedCourseId]?.[selectedUnitId]?.[noteId]) {
                localCache.notes[selectedCourseId][selectedUnitId][noteId].frequency = newFreq;
            }
            // Firebase'e yaz
            try {
                await updateDoc(doc(db, `courses/${selectedCourseId}/units/${selectedUnitId}/notes`, noteId), { frequency: newFreq });
            } catch (err) {
                console.error('Frequency güncellenemedi:', err);
            }
        });

        const markMemorizedBtn = noteElement.querySelector('.mark-memorized-btn');
        if (markMemorizedBtn) {
            markMemorizedBtn.addEventListener('click', async () => {
                await updateNoteStatus(selectedCourseId, selectedUnitId, noteId, 'Ezberlenmiş', 100, { correct: 0, incorrect: 0 });
                displayNotes(unitId); // Sayfa yenile (Cache'den)
            });
        }

        const testBtn = noteElement.querySelector('.test-unmemorized-btn, .start-quiz-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                startQuizSession([{ id: noteId, unitId: selectedUnitId, courseId: selectedCourseId, ...note }]);
            });
        }
    });
    
    categoriesDatalist.innerHTML = '';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        categoriesDatalist.appendChild(option);
    });

    notesStatsDisplay.innerHTML = `
        <span class="stat-item">Toplam: ${totalCount}</span>
        <span class="stat-item">Ezberlenmiş: ${memorizedCount}</span>
        <span class="stat-item">Ezberlenmemiş: ${unmemorizedCount}</span>
    `;
    
    if (memorizedCount === 0) {
        memorizedNotesListDiv.innerHTML = '<p>Henüz ezberlenmiş not yok.</p>';
    }
    if (unmemorizedCount === 0 && totalCount > 0) {
        unmemorizedNotesListDiv.innerHTML = '<p>Tüm notlar ezberlenmiş!</p>';
    }

    renderCategoryQuizSection(notesArray);
    renderWeakNotesSection(notesArray);
};

// --- KATEGORİ QUIZ ---
const renderCategoryQuizSection = (notesArray) => {
    const section = document.getElementById('category-quiz-section');
    const list = document.getElementById('category-quiz-list');
    const countLabel = document.getElementById('category-quiz-count');
    if (!section || !list) return;

    const categoryMap = {};
    notesArray.forEach(note => {
        const cat = note.category || 'Kategorisiz';
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push(note);
    });

    const categories = Object.keys(categoryMap);
    if (categories.length === 0) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    if (countLabel) countLabel.textContent = `${categories.length} kategori`;
    list.innerHTML = '';

    const body = document.getElementById('category-quiz-body');
    const arrow = document.getElementById('category-quiz-arrow');
    if (body) body.classList.remove('open');
    if (arrow) arrow.classList.remove('open');

    const toggle = document.getElementById('category-quiz-toggle');
    if (toggle && body && arrow) {
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        newToggle.addEventListener('click', () => {
            const isOpen = body.classList.toggle('open');
            document.getElementById('category-quiz-arrow').classList.toggle('open', isOpen);
        });
    }

    categories.sort().forEach(cat => {
        const notes = categoryMap[cat];
        const total = notes.length;
        const memorized = notes.filter(n => n.status === 'Ezberlenmiş').length;
        const unmemorized = total - memorized;

        const buttonsHtml = [
            { label: 'Tümünü Test Et', value: 'all' },
            { label: '10 Soru', value: '10' },
            { label: '20 Soru', value: '20' },
        ].map(o => `<button class="batch-btn cat-quiz-btn" data-count="${o.value}">${o.label}</button>`).join('');

        const row = document.createElement('div');
        row.className = 'category-quiz-row';
        row.innerHTML = `
            <div class="category-quiz-info">
                <span class="category-quiz-name">${cat}</span>
                <span class="category-quiz-meta">${total} not · ${memorized} ezberlenmiş · ${unmemorized} ezberlenmemiş</span>
            </div>
            <div class="category-quiz-actions batch-options">${buttonsHtml}</div>
        `;

        row.querySelectorAll('.cat-quiz-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const count = btn.dataset.count;
                let selected = [...notes].sort(() => 0.5 - Math.random());
                if (count !== 'all') selected = selected.slice(0, parseInt(count));
                startQuizSession(selected);
            });
        });

        list.appendChild(row);
    });
};

// --- EN ZAYIF NOTLAR ---
const renderWeakNotesSection = (notesArray) => {
    const section = document.getElementById('weak-notes-section');
    const list = document.getElementById('weak-notes-list');
    const countLabel = document.getElementById('weak-notes-count');
    if (!section || !list) return;

    // Hata oranı hesapla: en az 1 yanlış olanları al, hata_oranı = yanlış / (doğru + yanlış)
    const withStats = notesArray
        .map(note => {
            const correct = note.testCorrectCount || 0;
            const incorrect = note.testIncorrectCount || 0;
            const total = correct + incorrect;
            if (total === 0 || incorrect === 0) return null;
            const errorRate = incorrect / total;
            return { ...note, _correct: correct, _incorrect: incorrect, _total: total, _errorRate: errorRate };
        })
        .filter(Boolean)
        .sort((a, b) => b._errorRate - a._errorRate || b._incorrect - a._incorrect);

    if (withStats.length === 0) {
        section.style.display = 'none';
        return;
    }

    const toShow = withStats.slice(0, 50);

    section.style.display = 'block';
    if (countLabel) countLabel.textContent = `${toShow.length} not`;
    list.innerHTML = '';

    const body = document.getElementById('weak-notes-body');
    const arrow = document.getElementById('weak-notes-arrow');
    if (body) body.classList.remove('open');
    if (arrow) arrow.classList.remove('open');

    const toggle = document.getElementById('weak-notes-toggle');
    if (toggle && body && arrow) {
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        newToggle.addEventListener('click', () => {
            const isOpen = body.classList.toggle('open');
            document.getElementById('weak-notes-arrow').classList.toggle('open', isOpen);
        });
    }

    // Quiz butonları
    const quizBar = document.createElement('div');
    quizBar.className = 'batch-options';
    quizBar.style.marginBottom = '12px';
    quizBar.innerHTML = `
        <button class="batch-btn weak-quiz-btn" data-count="10">10 Soru</button>
        <button class="batch-btn weak-quiz-btn" data-count="20">20 Soru</button>
        <button class="batch-btn weak-quiz-btn" data-count="all">Tümünü Test Et</button>
    `;
    quizBar.querySelectorAll('.weak-quiz-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const count = btn.dataset.count;
            let selected = [...toShow].sort(() => 0.5 - Math.random());
            if (count !== 'all') selected = selected.slice(0, parseInt(count));
            startQuizSession(selected);
        });
    });
    list.appendChild(quizBar);

    toShow.forEach((note, idx) => {
        const pct = Math.round(note._errorRate * 100);
        const bar = Math.round(pct / 10); // 0-10
        const barColor = pct >= 70 ? '#ef4444' : pct >= 40 ? '#f97316' : '#eab308';

        const card = document.createElement('div');
        card.className = 'weak-note-card';
        card.innerHTML = `
            <div class="weak-note-rank">#${idx + 1}</div>
            <div class="weak-note-info">
                <div class="weak-note-keyword">${note.keyword || '—'}</div>
                <div class="weak-note-text">${(note.noteText || '').substring(0, 100)}${(note.noteText || '').length > 100 ? '...' : ''}</div>
                <div class="weak-note-meta">${note.category || ''}</div>
            </div>
            <div class="weak-note-stats">
                <div class="weak-stat-bar-wrap">
                    <div class="weak-stat-bar" style="width:${pct}%;background:${barColor};"></div>
                </div>
                <div class="weak-stat-numbers">
                    <span class="weak-correct">✓ ${note._correct}</span>
                    <span class="weak-incorrect">✗ ${note._incorrect}</span>
                    <span class="weak-rate" style="color:${barColor}">%${pct} hata</span>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
};

addNoteBtn.addEventListener('click', async () => {
    const noteText = noteTextInput.value.trim();
    const category = noteCategoryInput.value.trim();

    if (noteText && category && selectedKeyword && selectedCourseId && selectedUnitId) {
        if (!noteText.includes(selectedKeyword)) {
            alert('Lütfen not metninin içinden bir anahtar kelime seçin.');
            return;
        }

        try {
            const newNote = {
                noteText: noteText,
                keyword: selectedKeyword,
                category: category,
                status: 'Ezberlenmemiş',
                confidenceLevel: 0,
                createdAt: new Date(),
                lastReviewedAt: new Date(),
                decayLastAppliedAt: new Date(),
                testCorrectCount: 0,
                testIncorrectCount: 0
            };
            
            // Firebase'e ekle
            const docRef = await addDoc(collection(db, `courses/${selectedCourseId}/units/${selectedUnitId}/notes`), newNote);
            
            // CACHE'E EKLE
            newNote.id = docRef.id;
            localCache.notes[selectedCourseId][selectedUnitId][docRef.id] = newNote;
            
            resetAddNoteForm();
            addNoteContainer.style.display = 'none';
            showAddNoteFormBtn.textContent = '+ Yeni Not Ekle';
            
            // Sayfayı yenile (Cache'den!)
            displayNotes(selectedUnitId);

        } catch (error) {
            console.error("Error adding note: ", error);
        }
    } else {
        alert('Lütfen tüm alanları doldurun ve bir anahtar kelime seçin.');
    }
});


// --- Unit Management ---

const showNotesView = async (unitId, unitName) => {
    // First, check and update confidence levels before displaying notes
    await checkAndUpdateConfidenceLevels(selectedCourseId, unitId);

    selectedUnitId = unitId;
    selectedUnitName = unitName;
    selectedUnitTitle.textContent = `${unitName}`; // Simpler title
    unitsContainer.style.display = 'none';
    quizContainer.style.display = 'none';
    notesContainer.style.display = 'block';

    // Reset UI states
    addNoteContainer.style.display = 'none';
    showAddNoteFormBtn.textContent = '+ Yeni Not Ekle';
    resetAddNoteForm();
    searchUnmemorizedInput.value = ''; // Reset search
    searchMemorizedInput.value = ''; // Reset search

    displayNotes(unitId);
};

const showUnitsView = (courseId, courseName) => {
    selectedCourseId = courseId;
    selectedCourseName = courseName;
    selectedCourseTitle.textContent = `Ders: ${courseName}`;

    coursesContainer.style.display = 'none';
    notesContainer.style.display = 'none';
    quizContainer.style.display = 'none';
    unitsContainer.style.display = 'block';

    if (unsubscribeNotes) {
        unsubscribeNotes();
        unsubscribeNotes = null;
    }
    displayUnits(courseId);
    renderCourseWeakNotes(courseId);
    renderCourseSearch(courseId);
    renderCourseKeywordQuiz(courseId);
};

// --- DERS GENELİ ZAYIF NOTLAR ---
const renderCourseWeakNotes = (courseId) => {
    const section = document.getElementById('course-weak-notes-section');
    const list = document.getElementById('course-weak-list');
    const countLabel = document.getElementById('course-weak-count');
    if (!section || !list) return;

    // Tüm ünitelerin notlarını topla
    const allNotes = [];
    const unitsObj = localCache.notes[courseId] || {};
    for (const unitId in unitsObj) {
        const unitName = localCache.units[courseId]?.[unitId]?.name || '';
        for (const noteId in unitsObj[unitId]) {
            allNotes.push({ ...unitsObj[unitId][noteId], unitId, courseId, _unitName: unitName });
        }
    }

    const withStats = allNotes
        .filter(n => (n.testIncorrectCount || 0) > 0)
        .map(n => {
            const correct = n.testCorrectCount || 0;
            const incorrect = n.testIncorrectCount || 0;
            const errorRate = incorrect / (correct + incorrect);
            return { ...n, _errorRate: errorRate, _correct: correct, _incorrect: incorrect };
        })
        .sort((a, b) => b._errorRate - a._errorRate);

    if (withStats.length === 0) { section.style.display = 'none'; return; }

    const toShow = withStats.slice(0, 50);
    section.style.display = 'block';
    if (countLabel) countLabel.textContent = `${toShow.length} not`;

    const body = document.getElementById('course-weak-body');
    const arrow = document.getElementById('course-weak-arrow');
    if (body) body.classList.remove('open');
    if (arrow) arrow.classList.remove('open');

    const toggle = document.getElementById('course-weak-toggle');
    if (toggle && body && arrow) {
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        newToggle.addEventListener('click', () => {
            const isOpen = body.classList.toggle('open');
            document.getElementById('course-weak-arrow').classList.toggle('open', isOpen);
        });
    }

    // Quiz butonları
    const quizBtnsHtml = `
        <div class="batch-options" style="margin:12px 0 10px 0;display:flex;gap:8px;flex-wrap:wrap;">
            <button class="batch-btn course-weak-quiz-btn" data-count="10">10 Soru</button>
            <button class="batch-btn course-weak-quiz-btn" data-count="20">20 Soru</button>
            <button class="batch-btn course-weak-quiz-btn" data-count="all">Tümünü Test Et</button>
        </div>
    `;

    list.innerHTML = quizBtnsHtml;

    list.querySelectorAll('.course-weak-quiz-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const count = btn.dataset.count;
            let selected = [...toShow].sort(() => 0.5 - Math.random());
            if (count !== 'all') selected = selected.slice(0, parseInt(count));
            startQuizSession(selected);
        });
    });

    toShow.forEach((note, idx) => {
        const errorPct = Math.round(note._errorRate * 100);
        const barColor = errorPct >= 70 ? '#ef4444' : errorPct >= 40 ? '#f97316' : '#eab308';
        const card = document.createElement('div');
        card.className = 'weak-note-card';
        card.innerHTML = `
            <div class="weak-note-rank">#${idx + 1}</div>
            <div class="weak-note-info">
                <div class="weak-note-keyword">${note.keyword || '-'}</div>
                <div class="weak-note-text">${(note.noteText || '').substring(0, 90)}${(note.noteText || '').length > 90 ? '...' : ''}</div>
                <div class="weak-note-meta">${note._unitName}${note.category ? ' · ' + note.category : ''}</div>
            </div>
            <div class="weak-note-stats">
                <div class="weak-stat-numbers">
                    <span class="weak-correct">✓ ${note._correct}</span>
                    <span class="weak-incorrect">✗ ${note._incorrect}</span>
                    <span class="weak-rate" style="color:${barColor}">%${errorPct} hata</span>
                </div>
                <div class="weak-stat-bar-wrap">
                    <div class="weak-stat-bar" style="width:${errorPct}%;background:${barColor};"></div>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
};

// --- DERS GENELİ ARAMA ---
const renderCourseSearch = (courseId) => {
    const section = document.getElementById('course-search-section');
    const input = document.getElementById('course-search-input');
    const results = document.getElementById('course-search-results');
    const countLabel = document.getElementById('course-search-result-count');
    if (!section || !input || !results) return;

    section.style.display = 'block';
    results.innerHTML = '';
    if (countLabel) countLabel.textContent = '';
    input.value = '';

    const body = document.getElementById('course-search-body');
    const arrow = document.getElementById('course-search-arrow');
    if (body) body.classList.remove('open');
    if (arrow) arrow.classList.remove('open');

    const toggle = document.getElementById('course-search-toggle');
    if (toggle && body && arrow) {
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        newToggle.addEventListener('click', () => {
            const isOpen = body.classList.toggle('open');
            document.getElementById('course-search-arrow').classList.toggle('open', isOpen);
            if (isOpen) {
                setTimeout(() => document.getElementById('course-search-input')?.focus(), 150);
            }
        });
    }

    // Arama fonksiyonu
    const doSearch = (query) => {
        const q = query.trim().toLowerCase();
        results.innerHTML = '';
        if (!q) { if (countLabel) countLabel.textContent = ''; return; }

        const matches = [];
        const unitsObj = localCache.notes[courseId] || {};
        for (const unitId in unitsObj) {
            const unitName = localCache.units[courseId]?.[unitId]?.name || '';
            for (const noteId in unitsObj[unitId]) {
                const note = unitsObj[unitId][noteId];
                const haystack = `${note.keyword || ''} ${note.noteText || ''} ${note.category || ''}`.toLowerCase();
                if (haystack.includes(q)) {
                    matches.push({ ...note, _unitName: unitName, _unitId: unitId });
                }
            }
        }

        if (countLabel) countLabel.textContent = matches.length > 0 ? `${matches.length} sonuç` : 'Sonuç yok';

        if (matches.length === 0) {
            results.innerHTML = `<p style="color:var(--secondary-text-color,#888);font-size:0.85rem;padding:8px 0;">Sonuç bulunamadı.</p>`;
            return;
        }

        const hl = (text, q) => (text || '').replace(
            new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
            '<mark style="background:#facc15;color:#1a1a1a;border-radius:2px;padding:0 2px;">$1</mark>'
        );

        matches.slice(0, 60).forEach(note => {
            const correct = note.testCorrectCount || 0;
            const incorrect = note.testIncorrectCount || 0;
            const isMemorized = note.status === 'Ezberlenmiş';

            const displayText = (note.noteText || '').replace(
                new RegExp(`(${(note.keyword || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                `<b>$1</b>`
            );

            const card = document.createElement('div');
            card.className = 'note-item';
            card.style.marginBottom = '10px';

            const statsHtml = !isMemorized ? `
                <div class="note-learning-stats">
                    <span><b>Doğru:</b> ${correct}</span>
                    <span><b>Yanlış:</b> ${incorrect}</span>
                </div>` : '';

            const actionBtn = isMemorized
                ? `<button class="cs-quiz-btn secondary-btn">Güven Tazelemek İçin Test Et</button><p><b>Güven Seviyesi:</b> ${note.confidenceLevel || 0}%</p>`
                : `<button class="cs-quiz-btn secondary-btn">Test Et</button>`;

            card.innerHTML = `
                <div class="note-content">
                    <p>${hl(displayText, q)}</p>
                    <span class="category">${hl(note.category || '', q)}</span>
                    <span style="font-size:0.72rem;color:var(--secondary-text-color,#888);margin-left:6px;">📁 ${note._unitName}</span>
                    ${statsHtml}
                </div>
                <div class="note-info">
                    <div class="actions">${actionBtn}</div>
                </div>
            `;

            card.querySelector('.cs-quiz-btn').addEventListener('click', () => {
                startQuizSession([{ ...note, unitId: note._unitId, courseId }]);
            });

            results.appendChild(card);
        });

        if (matches.length > 60) {
            results.innerHTML += `<p style="font-size:0.75rem;color:var(--secondary-text-color,#888);text-align:center;margin-top:8px;">... ve ${matches.length - 60} sonuç daha. Aramayı daraltın.</p>`;
        }
    };

    // Input event'i body açıkken bağla (toggle açıldığında yeniden bağlar)
    const bindInput = () => {
        const inp = document.getElementById('course-search-input');
        if (inp) {
            inp.oninput = (e) => doSearch(e.target.value);
        }
    };

    // Toggle açıldığında input'u bağla
    const newToggle = document.getElementById('course-search-toggle');
    if (newToggle) {
        newToggle.addEventListener('click', bindInput);
    }
};

// --- KELIME/ÖBEK BAZLI TEST ---
const renderCourseKeywordQuiz = (courseId) => {
    const section = document.getElementById('course-keyword-quiz-section');
    const input = document.getElementById('course-keyword-input');
    const results = document.getElementById('course-keyword-results');
    const countLabel = document.getElementById('course-keyword-count');
    if (!section || !input || !results) return;

    section.style.display = 'block';
    results.innerHTML = '';
    if (countLabel) countLabel.textContent = '';
    input.value = '';

    const body = document.getElementById('course-keyword-body');
    const arrow = document.getElementById('course-keyword-arrow');
    if (body) body.classList.remove('open');
    if (arrow) arrow.classList.remove('open');

    const toggle = document.getElementById('course-keyword-toggle');
    if (toggle && body && arrow) {
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        newToggle.addEventListener('click', () => {
            const isOpen = body.classList.toggle('open');
            document.getElementById('course-keyword-arrow').classList.toggle('open', isOpen);
            if (isOpen) setTimeout(() => document.getElementById('course-keyword-input')?.focus(), 150);
        });
    }

    const doSearch = (query) => {
        const q = query.trim().toLowerCase();
        results.innerHTML = '';
        if (countLabel) countLabel.textContent = '';

        if (!q) return;

        const matches = [];
        const unitsObj = localCache.notes[courseId] || {};
        for (const unitId in unitsObj) {
            const unitName = localCache.units[courseId]?.[unitId]?.name || '';
            for (const noteId in unitsObj[unitId]) {
                const note = unitsObj[unitId][noteId];
                const haystack = `${note.keyword || ''} ${note.noteText || ''} ${note.category || ''}`.toLowerCase();
                if (haystack.includes(q)) {
                    matches.push({ ...note, _unitName: unitName, _unitId: unitId });
                }
            }
        }

        if (countLabel) countLabel.textContent = matches.length > 0 ? `${matches.length} not bulundu` : 'Sonuç yok';

        if (matches.length === 0) {
            results.innerHTML = `<p style="color:var(--secondary-text-color,#888);font-size:0.85rem;padding:8px 0;">Bu kelimeyi içeren not bulunamadı.</p>`;
            return;
        }

        // Quiz butonları
        const quizBtnsDiv = document.createElement('div');
        quizBtnsDiv.className = 'batch-options';
        quizBtnsDiv.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;';

        const counts = [
            { label: '10 Soru', val: 10 },
            { label: '20 Soru', val: 20 },
            { label: 'Tümünü Test Et', val: 'all' },
        ];

        counts.forEach(({ label, val }) => {
            const btn = document.createElement('button');
            btn.className = 'batch-btn';
            btn.textContent = label;
            btn.addEventListener('click', () => {
                let selected = [...matches].sort(() => 0.5 - Math.random());
                if (val !== 'all') selected = selected.slice(0, val);
                startQuizSession(selected.map(n => ({ ...n, unitId: n._unitId, courseId })));
            });
            quizBtnsDiv.appendChild(btn);
        });

        results.appendChild(quizBtnsDiv);
    };

    const bindInput = () => {
        const inp = document.getElementById('course-keyword-input');
        if (inp) inp.oninput = (e) => doSearch(e.target.value);
    };

    const newToggle = document.getElementById('course-keyword-toggle');
    if (newToggle) newToggle.addEventListener('click', bindInput);
};

const showCoursesView = () => {
    selectedCourseId = null;
    selectedCourseName = null;
    selectedUnitId = null;
    selectedUnitName = null;

    coursesContainer.style.display = 'block';
    unitsContainer.style.display = 'none';
    notesContainer.style.display = 'none';
    quizContainer.style.display = 'none';

    if (unsubscribeNotes) { // Also applies to unit listeners, which we will handle later
        unsubscribeNotes();
        unsubscribeNotes = null;
    }
};


// --- Quiz Management ---

const displayCurrentQuizQuestion = async () => {
    if (currentQuizIndex >= quizQueue.length) {
        // Quiz is over
        await updateStreak(quizQueue); // Update streak with the number of questions answered
        await displayStreak(); // Refresh the display
        
        quizFeedback.innerHTML = '';
        quizFeedback.className = '';

        const totalQ = quizQueue.length;
        const correctQ = quizQueue.filter(n => n.correct).length;
        const wrongNotes = quizQueue.filter(n => !n.correct);
        const wrongCount = wrongNotes.length;
        const flaggedNotes = quizQueue.filter(n => n.flagged);
        const flaggedCount = flaggedNotes.length;

        quizQuestion.innerHTML = `Test Tamamlandı!`;

        const goBack = () => {
            if (selectedUnitId) {
                showNotesView(selectedUnitId, selectedUnitName);
            } else if (selectedCourseId) {
                showUnitsView(selectedCourseId, selectedCourseName);
            } else {
                showCoursesView();
            }
        };

        let resultHTML = `
            <div style="margin-bottom:16px;">
                <p style="font-size:1.1rem;margin-bottom:8px;">
                    <b>${totalQ}</b> sorudan <b style="color:#22c55e">${correctQ}</b> doğru,
                    <b style="color:#ef4444">${wrongCount}</b> yanlış.
                    ${flaggedCount > 0 ? `<b style="color:#f97316"> · 🚩 ${flaggedCount} işaretli</b>` : ''}
                </p>
            </div>
        `;

        if (wrongCount > 0) {
            resultHTML += `
                <div id="wrong-review-section" style="margin-bottom:16px;">
                    <button id="toggle-wrong-btn" class="secondary-btn" style="margin-bottom:10px;">
                        ❌ ${wrongCount} Yanlışı Gözden Geçir
                    </button>
                    <div id="wrong-notes-list" style="display:none;"></div>
                </div>
            `;
        }

        if (flaggedCount > 0) {
            resultHTML += `
                <div id="flagged-review-section" style="margin-bottom:16px;">
                    <button id="toggle-flagged-btn" class="secondary-btn" style="margin-bottom:10px;">
                        🚩 ${flaggedCount} İşaretli Soruyu Gözden Geçir
                    </button>
                    <div id="flagged-notes-list" style="display:none;"></div>
                </div>
            `;
        }

        quizOptions.innerHTML = resultHTML;

        // Yanlışları render et
        if (wrongCount > 0) {
            const toggleBtn = document.getElementById('toggle-wrong-btn');
            const wrongList = document.getElementById('wrong-notes-list');

            wrongNotes.forEach((note, idx) => {
                const card = document.createElement('div');
                card.style.cssText = `background:var(--card-bg-color);border:1px solid var(--border-color);border-left:3px solid #ef4444;border-radius:8px;padding:12px 14px;margin-bottom:8px;`;
                card.innerHTML = `
                    <p style="font-size:0.78rem;color:var(--secondary-text-color,#888);margin-bottom:4px;">Soru ${idx + 1}</p>
                    <p style="font-weight:600;margin-bottom:6px;">${note.noteText?.substring(0, 120)}${note.noteText?.length > 120 ? '...' : ''}</p>
                    <p style="font-size:0.82rem;"><b>Doğru Cevap:</b> <span style="color:#22c55e;font-weight:600;">${note.keyword}</span></p>
                    ${note.category ? `<p style="font-size:0.75rem;color:var(--secondary-text-color,#888);margin-top:4px;">Kategori: ${note.category}</p>` : ''}
                `;
                wrongList.appendChild(card);
            });

            toggleBtn.addEventListener('click', () => {
                const isOpen = wrongList.style.display === 'block';
                wrongList.style.display = isOpen ? 'none' : 'block';
                toggleBtn.textContent = isOpen ? `❌ ${wrongCount} Yanlışı Gözden Geçir` : `▲ Kapat`;
            });
        }

        // İşaretlileri render et
        if (flaggedCount > 0) {
            const toggleFlaggedBtn = document.getElementById('toggle-flagged-btn');
            const flaggedList = document.getElementById('flagged-notes-list');

            flaggedNotes.forEach((note, idx) => {
                const isWrong = !note.correct;
                const card = document.createElement('div');
                card.style.cssText = `background:var(--card-bg-color);border:1px solid var(--border-color);border-left:3px solid #f97316;border-radius:8px;padding:12px 14px;margin-bottom:8px;`;
                card.innerHTML = `
                    <p style="font-size:0.78rem;color:var(--secondary-text-color,#888);margin-bottom:4px;">
                        İşaretli ${idx + 1}
                        ${isWrong ? '<span style="color:#ef4444;margin-left:6px;">· Yanlış</span>' : '<span style="color:#22c55e;margin-left:6px;">· Doğru</span>'}
                    </p>
                    <p style="font-weight:600;margin-bottom:6px;">${note.noteText?.substring(0, 120)}${note.noteText?.length > 120 ? '...' : ''}</p>
                    <p style="font-size:0.82rem;"><b>Cevap:</b> <span style="color:#f97316;font-weight:600;">${note.keyword}</span></p>
                    ${note.category ? `<p style="font-size:0.75rem;color:var(--secondary-text-color,#888);margin-top:4px;">Kategori: ${note.category}</p>` : ''}
                `;
                flaggedList.appendChild(card);
            });

            toggleFlaggedBtn.addEventListener('click', () => {
                const isOpen = flaggedList.style.display === 'block';
                flaggedList.style.display = isOpen ? 'none' : 'block';
                toggleFlaggedBtn.textContent = isOpen ? `🚩 ${flaggedCount} İşaretli Soruyu Gözden Geçir` : `▲ Kapat`;
            });
        }

        const backButton = document.createElement('button');
        backButton.textContent = 'Geri Dön';
        backButton.className = 'primary-btn';
        backButton.style.marginTop = '8px';
        backButton.onclick = goBack;
        quizOptions.appendChild(backButton);
        return;
    }

    const noteToTest = quizQueue[currentQuizIndex];
    unitsContainer.style.display = 'none';
    notesContainer.style.display = 'none';
    quizContainer.style.display = 'block';
    quizFeedback.textContent = '';
    quizFeedback.className = ''; // Bug Fix: Clear previous feedback style
    quizOptions.innerHTML = '';

    const questionText = noteToTest.noteText.replace(noteToTest.keyword, '_______');

    const isFlagged = quizQueue[currentQuizIndex].flagged || false;
    const currentFreq = quizQueue[currentQuizIndex].frequency || 5;

    quizQuestion.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
            <span>Soru ${currentQuizIndex + 1} / ${quizQueue.length}<br><br>"${questionText}"</span>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                <button id="flag-btn" title="İşaretle" style="
                    background:${isFlagged ? '#f97316' : 'var(--card-bg-color)'};
                    border:1.5px solid ${isFlagged ? '#f97316' : 'var(--border-color)'};
                    color:${isFlagged ? '#fff' : 'var(--text-color)'};
                    border-radius:8px;padding:6px 10px;font-size:1rem;
                    cursor:pointer;transition:all 0.15s;line-height:1;
                ">🚩</button>
                <button id="quiz-freq-btn" title="Sıklığı ayarla" style="
                    background:var(--card-bg-color);
                    border:1.5px solid var(--border-color);
                    color:var(--text-color);
                    border-radius:8px;padding:5px 8px;font-size:0.72rem;
                    cursor:pointer;transition:all 0.15s;line-height:1.4;white-space:nowrap;
                ">🔁 ${currentFreq}</button>
            </div>
        </div>
        <div id="quiz-freq-picker" style="display:none;margin-top:10px;
            background:var(--card-bg-color);border:1px solid var(--border-color);
            border-radius:8px;padding:10px;
        ">
            <div style="font-size:0.75rem;color:var(--secondary-text-color,#888);margin-bottom:6px;">Sıklık seç (1-50):</div>
            <div style="display:flex;flex-wrap:wrap;gap:3px;">
                ${Array.from({length: 50}, (_, i) => i + 1).map(n =>
                    `<span class="freq-box${n === currentFreq ? ' active' : ''}" data-val="${n}" style="cursor:pointer;">${n}</span>`
                ).join('')}
            </div>
        </div>
    `;

    document.getElementById('flag-btn').addEventListener('click', () => {
        quizQueue[currentQuizIndex].flagged = !quizQueue[currentQuizIndex].flagged;
        const btn = document.getElementById('flag-btn');
        const flagged = quizQueue[currentQuizIndex].flagged;
        btn.style.background = flagged ? '#f97316' : 'var(--card-bg-color)';
        btn.style.borderColor = flagged ? '#f97316' : 'var(--border-color)';
        btn.style.color = flagged ? '#fff' : 'var(--text-color)';
    });

    document.getElementById('quiz-freq-btn').addEventListener('click', () => {
        const picker = document.getElementById('quiz-freq-picker');
        picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('quiz-freq-picker').addEventListener('click', async (e) => {
        const box = e.target.closest('.freq-box');
        if (!box) return;
        const newFreq = parseInt(box.dataset.val);
        const note = quizQueue[currentQuizIndex];
        // UI güncelle
        document.querySelectorAll('#quiz-freq-picker .freq-box').forEach(b => b.classList.remove('active'));
        box.classList.add('active');
        document.getElementById('quiz-freq-btn').textContent = `🔁 ${newFreq}`;
        // State güncelle
        quizQueue[currentQuizIndex].frequency = newFreq;
        // Cache güncelle
        if (note.courseId && note.unitId && note.id && localCache.notes[note.courseId]?.[note.unitId]?.[note.id]) {
            localCache.notes[note.courseId][note.unitId][note.id].frequency = newFreq;
        }
        // Firebase'e yaz
        try {
            await updateDoc(doc(db, `courses/${note.courseId}/units/${note.unitId}/notes`, note.id), { frequency: newFreq });
        } catch (err) {
            console.error('Frequency güncellenemedi:', err);
        }
    });

    // --- Advanced Distractor Fetching Logic ---
    const distractors = new Set();
    const correctKeywordLower = noteToTest.keyword.toLowerCase();

    // 1. Try to get from the same category first
    const categoryQuery = query(collection(db, `courses/${noteToTest.courseId}/units/${noteToTest.unitId}/notes`), where('category', '==', noteToTest.category));
    const categorySnapshot = await getDocs(categoryQuery);
    categorySnapshot.forEach(doc => {
        const keyword = doc.data().keyword;
        if (distractors.size < 3 && keyword.toLowerCase() !== correctKeywordLower) {
            distractors.add(keyword);
        }
    });

    // 2. If not enough, get more from the entire unit
    if (distractors.size < 3) {
        const unitQuery = query(collection(db, `courses/${noteToTest.courseId}/units/${noteToTest.unitId}/notes`));
        const unitSnapshot = await getDocs(unitQuery);
        
        const existingOptionsLower = new Set([...distractors].map(d => d.toLowerCase()));
        existingOptionsLower.add(correctKeywordLower);

        unitSnapshot.forEach(doc => {
            const keyword = doc.data().keyword;
            if (distractors.size < 3 && !existingOptionsLower.has(keyword.toLowerCase())) {
                distractors.add(keyword);
            }
        });
    }

    const options = [noteToTest.keyword, ...distractors].sort(() => 0.5 - Math.random());

    options.forEach(option => {
        const button = document.createElement('button');
        button.textContent = option;
        button.addEventListener('click', () => handleQuizAnswer(option, noteToTest));
        quizOptions.appendChild(button);
    });
};

const handleQuizAnswer = (selectedOption, correctNote) => {
    const buttons = quizOptions.querySelectorAll('button');
    buttons.forEach(button => button.disabled = true);

    if (selectedOption.toLowerCase() === correctNote.keyword.toLowerCase()) {
        quizFeedback.textContent = "Doğru!";
        quizFeedback.className = 'correct';
        quizQueue[currentQuizIndex].correct = true;
        
        if (correctNote.status === 'Ezberlenmiş') {
            updateNoteStatus(correctNote.courseId, correctNote.unitId, correctNote.id, 'Ezberlenmiş', 100);
        } else {
            const newCorrectCount = (correctNote.testCorrectCount || 0) + 1;
            const newIncorrectCount = correctNote.testIncorrectCount || 0;
            updateNoteStatus(correctNote.courseId, correctNote.unitId, correctNote.id, 'Ezberlenmemiş', 0, { correct: newCorrectCount, incorrect: newIncorrectCount });
        }
    } else {
        quizFeedback.textContent = `Yanlış. Doğru cevap: ${correctNote.keyword}.`;
        quizFeedback.className = 'incorrect';
        quizQueue[currentQuizIndex].correct = false;

        if (correctNote.status === 'Ezberlenmiş') {
            const newConfidence = Math.max(0, correctNote.confidenceLevel - 25);
            updateNoteStatus(correctNote.courseId, correctNote.unitId, correctNote.id, 'Ezberlenmiş', newConfidence);
        } else {
            const newCorrectCount = correctNote.testCorrectCount || 0;
            const newIncorrectCount = (correctNote.testIncorrectCount || 0) + 1;
            updateNoteStatus(correctNote.courseId, correctNote.unitId, correctNote.id, 'Ezberlenmemiş', 0, { correct: newCorrectCount, incorrect: newIncorrectCount });
        }
    }

    currentQuizIndex++;
    setTimeout(displayCurrentQuizQuestion, 1500);
};

const weightedShuffle = (notes) => {
    // Her notun frequency değeri kadar "bilet" var, yüksek frequency daha sık çıkar
    const pool = [];
    notes.forEach(note => {
        const weight = note.frequency || 5;
        for (let i = 0; i < weight; i++) pool.push(note);
    });
    // Pool'u karıştır, tekrarsız seçim yap
    pool.sort(() => 0.5 - Math.random());
    const seen = new Set();
    const result = [];
    for (const note of pool) {
        const id = note.id || note.noteText;
        if (!seen.has(id)) {
            seen.add(id);
            result.push(note);
        }
    }
    return result;
};

const startQuizSession = (notes) => {
    if (notes.length === 0) return;
    quizQueue = weightedShuffle(notes);
    currentQuizIndex = 0;
    displayCurrentQuizQuestion();
};


backToUnitsBtn.addEventListener('click', () => showUnitsView(selectedCourseId, selectedCourseName));
backToCoursesBtn.addEventListener('click', showCoursesView);

// --- UI Rendering ---

const renderCourseCard = (courseId, course) => {
    const courseElement = document.createElement('div');
    courseElement.classList.add('course-card');
    courseElement.dataset.courseId = courseId;

    courseElement.innerHTML = `
        <div class="course-card-header">
            <span class="course-name">${course.name}</span>
            <div class="card-actions">
                <button class="action-btn edit-course-btn" title="Dersi Düzenle">${editIconSVG}</button>
                <button class="action-btn delete-course-btn" title="Dersi Sil">${deleteIconSVG}</button>
            </div>
        </div>
        <div class="course-stats">
             <div class="stat-item loading">
                <span>Üniteler</span>
                <span class="stat-value">...</span>
            </div>
            <div class="stat-item loading">
                <span>Notlar</span>
                <span class="stat-value">...</span>
            </div>
        </div>
    `;

    courseElement.addEventListener('click', (e) => {
        if (e.target.closest('.action-btn')) return;
        showUnitsView(courseId, course.name);
    });

    courseElement.querySelector('.delete-course-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCourse(courseId);
    });

    // TODO: Add edit course functionality
    // courseElement.querySelector('.edit-course-btn').addEventListener('click', (e) => {
    //     e.stopPropagation();
    //     openEditModal('course', courseId, course);
    // });

    coursesListDiv.appendChild(courseElement);

    // Asynchronously fetch stats
    getCourseStats(courseId).then(stats => {
        const existingCard = coursesListDiv.querySelector(`[data-course-id="${courseId}"]`);
        if (existingCard) {
            const statsDiv = existingCard.querySelector('.course-stats');
            statsDiv.innerHTML = `
                <div class="stat-item">
                    <span>Üniteler</span>
                    <span class="stat-value">${stats.units}</span>
                </div>
                <div class="stat-item">
                    <span>Notlar</span>
                    <span class="stat-value">${stats.notes}</span>
                </div>
            `;
        }
    });
};

const updateCourseCard = (courseId, course) => {
    const courseElement = coursesListDiv.querySelector(`[data-course-id="${courseId}"]`);
    if (courseElement) {
        const courseNameEl = courseElement.querySelector('.course-name');
        if (courseNameEl) {
            courseNameEl.textContent = course.name;
        }
    }
};

const removeCourseCard = (courseId) => {
    const courseElement = coursesListDiv.querySelector(`[data-course-id="${courseId}"]`);
    if (courseElement) {
        courseElement.remove();
    }
};

const displayCourses = () => {
    coursesListDiv.innerHTML = '';
    
    // CACHE'DEN OKU
    Object.values(localCache.courses).forEach(course => {
        renderCourseCard(course.id, course);
    });
};


const renderUnitCard = (unitId, unit) => {
    const unitElement = document.createElement('div');
    unitElement.classList.add('unit-item');
    unitElement.dataset.unitId = unitId; // Add a data attribute for easy selection

    // Initially render the card with a loading state for stats
    unitElement.innerHTML = `
        <div class="unit-item-header">
            <span class="unit-name">${unit.name}</span>
            <div class="card-actions">
                <button class="action-btn edit-unit-btn" title="Üniteyi Düzenle">${editIconSVG}</button>
                <button class="action-btn delete-unit-btn" title="Üniteyi Sil">${deleteIconSVG}</button>
            </div>
        </div>
        <div class="unit-stats">
             <div class="stat-item loading">
                <span>Toplam</span>
                <span class="stat-value"></span>
            </div>
            <div class="stat-item loading">
                <span>Ezberlenmiş</span>
                <span class="stat-value"></span>
            </div>
            <div class="stat-item loading">
                <span>Ezberlenmemiş</span>
                <span class="stat-value"></span>
            </div>
        </div>
    `;

    // Add event listeners
    unitElement.addEventListener('click', (e) => {
        if (e.target.closest('.action-btn')) return;
        showNotesView(unitId, unit.name);
    });

    unitElement.querySelector('.delete-unit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteUnit(selectedCourseId, unitId);
    });

    unitElement.querySelector('.edit-unit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal('unit', unitId, unit);
    });

    unitsListDiv.appendChild(unitElement);

    // Asynchronously fetch stats and update the card
    getUnitStats(selectedCourseId, unitId).then(stats => {
        // Make sure the card is still in the DOM
        const existingCard = unitsListDiv.querySelector(`[data-unit-id="${unitId}"]`);
        if (existingCard) {
            const statsDiv = existingCard.querySelector('.unit-stats');
            statsDiv.innerHTML = `
                <div class="stat-item">
                    <span>Toplam</span>
                    <span class="stat-value">${stats.total}</span>
                </div>
                <div class="stat-item">
                    <span>Ezberlenmiş</span>
                    <span class="stat-value">${stats.memorized}</span>
                </div>
                <div class="stat-item">
                    <span>Ezberlenmemiş</span>
                    <span class="stat-value">${stats.unmemorized}</span>
                </div>
            `;
        }
    });
};

const updateUnitCard = (unitId, unit) => {
    const unitElement = unitsListDiv.querySelector(`[data-unit-id="${unitId}"]`);
    if (unitElement) {
        const unitNameEl = unitElement.querySelector('.unit-name');
        if (unitNameEl) {
            unitNameEl.textContent = unit.name;
        }
    }
};

const removeUnitCard = (unitId) => {
    const unitElement = unitsListDiv.querySelector(`[data-unit-id="${unitId}"]`);
    if (unitElement) {
        unitElement.remove();
    }
};

let unsubscribeUnits = null;

const displayUnits = (courseId) => {
    if (unsubscribeUnits) {
        unsubscribeUnits();
    }
    unitsListDiv.innerHTML = '';

    // CACHE'DEN OKU
    const units = localCache.units[courseId] || {};
    Object.values(units).forEach(unit => {
        renderUnitCard(unit.id, unit);
    });
};

addCourseBtn.addEventListener('click', async () => {
    const courseName = courseNameInput.value.trim();
    if (courseName) {
        try {
            await addDoc(collection(db, 'courses'), {
                name: courseName,
                createdAt: new Date()
            });
            courseNameInput.value = ''; 
        } catch (error) {
            console.error("Error adding course: ", error);
        }
    }
});

addUnitBtn.addEventListener('click', async () => {
    const unitName = unitNameInput.value.trim();
    if (unitName && selectedCourseId) {
        try {
            await addDoc(collection(db, `courses/${selectedCourseId}/units`), {
                name: unitName,
                createdAt: new Date()
            });
            unitNameInput.value = ''; 
        } catch (error) {
            console.error("Error adding unit: ", error);
        }
    }
});

// --- App Initialization ---
const initializeApp = async () => {
    console.log("🚀 Uygulama başlatılıyor...");
    
    // İLK ÖNCE TÜM VERİYİ ÇEK
    await loadAllDataOnce();
    
    // Cache yüklendikten sonra bunlar cache'den çalışır
    loadCourseNameMap();
    displayCourses();
    showCoursesView();
    await displayStreak(); // Yeni gün sıfırlama burada yapılıyor
    
    console.log("✅ Uygulama hazır!");
};


// --- Initial Load ---
initializeApp();
