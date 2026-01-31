import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, doc, updateDoc, getDocs, where, writeBatch, deleteDoc, getDoc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
// HATA DÜZELTMESİ: Google'ın resmi Web SDK'sı import edildi.
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// --- Gemini AI Config ---
const GEMINI_API_KEY = "AIzaSyDsPESlU0vnH3I_HQf8bVk3u-dHgXFvhRw";
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
    "ME0GYyrFQr1Oysycx4vS": 80
    
};

// courseId -> course name map (uygulama içinde kullanılacak)
let courseNameMap = {};

// Firestore'dan courses koleksiyonunu okuyup id->isim map'i oluşturur.
// Çağrıldığında courseNameMap'i doldurur.
const loadCourseNameMap = async () => {
    try {
        const snap = await getDocs(collection(db, 'courses'));
        snap.forEach(d => {
            const data = d.data();
            courseNameMap[d.id] = data.name || d.id;
        });
    } catch (err) {
        console.error("loadCourseNameMap error:", err);
    }
};


const displayStreak = async () => {
    try {
        const statsRef = doc(db, 'userStats', 'main');
        const docSnap = await getDoc(statsRef);

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

        if (docSnap.exists()) {
            const data = docSnap.data();
            streak = data.streak || 0;
            // lastStreakDate ve questionsTodayDate mümkünse Date'e dönüştür
            lastStreakDate = data.lastStreakDate?.toDate ? data.lastStreakDate.toDate() : (data.lastStreakDate || null);
            questionsTodayDate = data.questionsTodayDate?.toDate ? data.questionsTodayDate.toDate() : (data.questionsTodayDate || null);

            // Eğer questionsTodayDate bugünse questionsToday ve dailyCourseStats al
            if (questionsTodayDate && isSameDay(questionsTodayDate, todayDateOnly)) {
                questionsToday = data.questionsToday || 0;
                dailyCourseStats = data.dailyCourseStats || {};
            } else {
                // Yeni gün, sıfır olarak göster
                questionsToday = 0;
                dailyCourseStats = {};
            }

            // Auto-reset streak if a day was missed
            if (lastStreakDate && !isSameDay(lastStreakDate, todayDateOnly) && !isSameDay(lastStreakDate, yesterday)) {
                streak = 0;
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

// Yeni updateStreak: quizQueue (array of note objects) bekler
const updateStreak = async (quizQueue) => {
    try {
        const statsRef = doc(db, 'userStats', 'main');
        const docSnap = await getDoc(statsRef);

        const today = new Date();
        const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        let streak = 0;
        let questionsToday = 0;
        let lastStreakDate = null;
        let questionsTodayDate = null;
        let dailyCourseStats = {}; // courseId -> count

        if (docSnap.exists()) {
            const data = docSnap.data();
            streak = data.streak || 0;
            lastStreakDate = data.lastStreakDate?.toDate ? data.lastStreakDate.toDate() : (data.lastStreakDate || null);
            questionsToday = data.questionsToday || 0;
            questionsTodayDate = data.questionsTodayDate?.toDate ? data.questionsTodayDate.toDate() : (data.questionsTodayDate || null);
            dailyCourseStats = data.dailyCourseStats || {};
        }

        // Eğer kayıtlı sorularTodayDate bugünden farklı bir güne aitse -> sıfırla
        if (!questionsTodayDate || !isSameDay(questionsTodayDate, todayDateOnly)) {
            questionsToday = 0;
            dailyCourseStats = {};
        }

        // 1) Toplam soruları ekle
        const addedQuestions = Array.isArray(quizQueue) ? quizQueue.length : 0;
        questionsToday += addedQuestions;

        // 2) Her not için courseId bazlı sayacı artır
        // Beklenen: quizQueue elemanı içinde courseId alanı var (ör: note.courseId)
        if (Array.isArray(quizQueue)) {
            quizQueue.forEach(note => {
                const cid = note.courseId || note.course || note.courseName || null;
                if (!cid) return; // eğer yoksa atla

                if (!dailyCourseStats[cid]) dailyCourseStats[cid] = 0;
                dailyCourseStats[cid] += 1;
            });
        }

        // 3) Ders bazlı zorunlu minimumları kontrol et
        let courseConditionsMet = true;
        // COURSE_DAILY_MINIMUMS: courseId -> requiredCount
        for (const requiredCourseId in COURSE_DAILY_MINIMUMS) {
            const required = COURSE_DAILY_MINIMUMS[requiredCourseId];
            const solved = dailyCourseStats[requiredCourseId] || 0;
            if (solved < required) {
                courseConditionsMet = false;
                break;
            }
        }

        // 4) Final karar: tüm şartlar sağlanmalı
        if (questionsToday >= DAILY_GOAL && courseConditionsMet) {
            // Eğer bugün daha önce streak artışı yapılmadıysa (aynı gün tekrar artmasın)
            if (!lastStreakDate || !isSameDay(lastStreakDate, todayDateOnly)) {
                // Eğer dün de streak varsa artış, yoksa 1'den başla
                const yesterday = new Date(todayDateOnly);
                yesterday.setDate(todayDateOnly.getDate() - 1);

                if (lastStreakDate && isSameDay(lastStreakDate, yesterday)) {
                    streak = (streak || 0) + 1;
                } else {
                    streak = 1;
                }
                lastStreakDate = todayDateOnly;
            }
        } else {
            // Herhangi bir kısıt sağlanmıyorsa streak sıfırlanacak
            streak = 0;
            // lastStreakDate burada silinmez, ancak isterseniz de sıfırlanabilir
            // lastStreakDate = null;
        }

        // 5) Firestore'a kaydet
        await setDoc(statsRef, {
            questionsToday,
            questionsTodayDate: Timestamp.fromDate(todayDateOnly),
            streak,
            lastStreakDate: lastStreakDate ? Timestamp.fromDate(lastStreakDate) : null,
            dailyCourseStats
        }, { merge: true });

    } catch (error) {
        console.error("Error in new updateStreak:", error);
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
    const newTheme = themeToggle.checked ? 'dark' : 'light';
    setTheme(newTheme);
});

// Check for saved theme preference
const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);


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
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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
        await deleteDoc(doc(db, `courses/${selectedCourseId}/units/${selectedUnitId}/notes`, noteId));
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

const updateNoteStatus = async (courseId, unitId, noteId, newStatus, newConfidence, newStats = null) => {
    if (!courseId || !unitId || !noteId) return;

    const noteRef = doc(db, `courses/${courseId}/units/${unitId}/notes`, noteId);
    try {
        const updateData = {
            status: newStatus,
            confidenceLevel: newConfidence,
            lastReviewedAt: new Date(),
            decayLastAppliedAt: new Date()
        };

        if (newStats) {
            updateData.testCorrectCount = newStats.correct;
            updateData.testIncorrectCount = newStats.incorrect;
        }

        await updateDoc(noteRef, updateData);
    } catch (error) {
        console.error("Error updating note status: ", error);
    }
};

const displayNotes = (unitId) => {
    // If we are already listening to a unit's notes, stop it
    if (unsubscribeNotes) {
        unsubscribeNotes();
    }

    const notesQuery = query(collection(db, `courses/${selectedCourseId}/units/${unitId}/notes`));
    
    unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
        unmemorizedNotesListDiv.innerHTML = '';
        memorizedNotesListDiv.innerHTML = '';
        
        const categories = new Set();
        let unmemorizedCount = 0;
        let memorizedCount = 0;
        const totalCount = snapshot.size;

        if (snapshot.empty) {
            unmemorizedNotesListDiv.innerHTML = '<p>Bu ünitede henüz not yok.</p>';
            memorizedNotesListDiv.innerHTML = ''; // Clear the other column too
            notesStatsDisplay.innerHTML = ''; // Clear stats
            categoriesDatalist.innerHTML = ''; // Clear datalist
            return;
        }

        snapshot.forEach(doc => {
            const note = doc.data();
            categories.add(note.category);

            const noteId = doc.id;
            const noteElement = document.createElement('div');
            noteElement.classList.add('note-item');
            noteElement.dataset.id = noteId;

            let actionsHtml = '';
            let statsHtml = '';
            // Make the keyword bold in the note text for display
            const displayText = note.noteText.replace(note.keyword, `<b>${note.keyword}</b>`);

            if (note.status === 'Ezberlenmemiş') {
                actionsHtml = `
                    <button class="test-unmemorized-btn secondary-btn">Test Et</button>
                    <button class="mark-memorized-btn primary-btn">Ezberledim</button>
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

            noteElement.innerHTML = `
                <div class="note-content">
                    <p>${displayText}</p>
                    <span class="category">${note.category}</span>
                    ${statsHtml}
                </div>
                <div class="note-info">
                     <p><b>Durum:</b> ${note.status}</p>
                     <div class="actions">
                        ${actionsHtml}
                    </div>
                </div>
                <div class="card-actions">
                    <button class="action-btn ai-chat-btn" title="Y. Zeka ile Sohbet Et">${aiIconSVG}</button>
                    <button class="action-btn edit-note-btn" title="Notu Düzenle">${editIconSVG}</button>
                    <button class="action-btn delete-note-btn" title="Notu Sil">${deleteIconSVG}</button>
                </div>
            `;
            
            // Append to the correct list
            if (note.status === 'Ezberlenmemiş') {
                unmemorizedNotesListDiv.appendChild(noteElement);
                unmemorizedCount++;
            } else {
                memorizedNotesListDiv.appendChild(noteElement);
                memorizedCount++;
            }

            // Add event listeners
            noteElement.querySelector('.delete-note-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteNote(noteId);
            });

            noteElement.querySelector('.edit-note-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal('note', noteId, note);
            });
            
            noteElement.querySelector('.ai-chat-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openAiChatModal(note.noteText);
            });

            const markMemorizedBtn = noteElement.querySelector('.mark-memorized-btn');
            if (markMemorizedBtn) {
                markMemorizedBtn.addEventListener('click', () => {
                    // Reset stats when moving to memorized
                    updateNoteStatus(selectedCourseId, selectedUnitId, noteId, 'Ezberlenmiş', 100, { correct: 0, incorrect: 0 });
                });
            }

            const testBtn = noteElement.querySelector('.test-unmemorized-btn, .start-quiz-btn');
            if (testBtn) {
                testBtn.addEventListener('click', () => {
                    startQuizSession([{ id: noteId, unitId: selectedUnitId, courseId: selectedCourseId, ...note }]);
                });
            }
        });
        
        // Update categories datalist
        categoriesDatalist.innerHTML = '';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            categoriesDatalist.appendChild(option);
        });

        // Update stats in the notes header
        notesStatsDisplay.innerHTML = `
            <span class="stat-item">Toplam: ${totalCount}</span>
            <span class="stat-item">Ezberlenmiş: ${memorizedCount}</span>
            <span class="stat-item">Ezberlenmemiş: ${unmemorizedCount}</span>
        `;
        
        if (memorizedCount === 0) {
            memorizedNotesListDiv.innerHTML = '<p>Henüz ezberlenmiş not yok.</p>';
        }
        if (unmemorizedCount === 0 && !snapshot.empty) {
            unmemorizedNotesListDiv.innerHTML = '<p>Tüm notlar ezberlenmiş!</p>';
        }
    });
};

addNoteBtn.addEventListener('click', async () => {
    const noteText = noteTextInput.value.trim();
    const category = noteCategoryInput.value.trim();

    if (noteText && category && selectedKeyword && selectedCourseId && selectedUnitId) {
        // Check if the selected keyword is actually in the note text
        if (!noteText.includes(selectedKeyword)) {
            alert('Lütfen not metninin içinden bir anahtar kelime seçin.');
            return;
        }

        try {
            await addDoc(collection(db, `courses/${selectedCourseId}/units/${selectedUnitId}/notes`), {
                noteText: noteText,
                keyword: selectedKeyword,
                category: category,
                status: 'Ezberlenmemiş', // Initial status
                confidenceLevel: 0, // Initial confidence
                createdAt: new Date(),
                lastReviewedAt: new Date(),
                decayLastAppliedAt: new Date(), // Initialize the decay stamp
                testCorrectCount: 0, // Initialize stats
                testIncorrectCount: 0 // Initialize stats
            });
            resetAddNoteForm();
            addNoteContainer.style.display = 'none'; // Hide form on successful add
            showAddNoteFormBtn.textContent = '+ Yeni Not Ekle';

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
        
        quizQuestion.innerHTML = `Test Tamamlandı!`;
        quizOptions.innerHTML = `<p>${quizQueue.length} sorudan ${quizQueue.filter(n => n.correct).length} tanesini doğru cevapladınız.</p>`;
        quizFeedback.innerHTML = '';
        quizFeedback.className = ''; // Bug Fix: Clear color from the last question's feedback

        // Add a button to go back
        const backButton = document.createElement('button');
        backButton.textContent = 'Geri Dön';
        backButton.className = 'primary-btn';
        backButton.onclick = () => {
            if (selectedUnitId) { // This means quiz was for a specific unit
                showNotesView(selectedUnitId, selectedUnitName);
            } else if (selectedCourseId) { // This means it was a random course quiz
                showUnitsView(selectedCourseId, selectedCourseName);
            } else {
                showCoursesView();
            }
        };
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
    quizQuestion.innerHTML = `Soru ${currentQuizIndex + 1} / ${quizQueue.length}<br><br>"${questionText}"`;

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

const startQuizSession = (notes) => {
    if (notes.length === 0) {
        alert('Bu kriterlere uygun tekrar edilecek not bulunamadı.');
        return;
    }
    quizQueue = notes.sort(() => 0.5 - Math.random()); // Shuffle notes
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
    const coursesCollection = collection(db, 'courses');
    onSnapshot(coursesCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                renderCourseCard(change.doc.id, change.doc.data());
            }
            if (change.type === "modified") {
                // updateCourseCard(change.doc.id, change.doc.data());
            }
            if (change.type === "removed") {
                removeCourseCard(change.doc.id);
            }
        });
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
    unitsListDiv.innerHTML = ''; // Clear previous units

    const unitsCollection = collection(db, `courses/${courseId}/units`);
    unsubscribeUnits = onSnapshot(unitsCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                renderUnitCard(change.doc.id, change.doc.data());
            }
            if (change.type === "modified") {
                updateUnitCard(change.doc.id, change.doc.data());
            }
            if (change.type === "removed") {
                removeUnitCard(change.doc.id);
            }
        });
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
    // courses isim map'ini yükle ki UI insan okunur isim göstersin
    await loadCourseNameMap();
    displayCourses();
    showCoursesView();
    await displayStreak();
};



// --- Initial Load ---
initializeApp();


