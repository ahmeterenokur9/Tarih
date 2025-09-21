import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, doc, updateDoc, getDocs, where, writeBatch, deleteDoc, getDoc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// --- DOM Elements ---
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


// --- State Variables ---
let selectedUnitId = null;
let selectedUnitName = null;
let selectedKeyword = ''; // To store the highlighted keyword
let unsubscribeNotes = null; // To stop listening to previous unit's notes
let currentEdit = { type: null, id: null, originalData: null }; // To manage what we are editing
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

const displayStreak = async () => {
    try {
        const statsRef = doc(db, 'userStats', 'main');
        const docSnap = await getDoc(statsRef);
        
        let streak = 0;
        let questionsToday = 0;
        let lastActivityDate = null;

        if (docSnap.exists()) {
            const data = docSnap.data();
            streak = data.streak || 0;
            if (data.lastActivityDate) {
                lastActivityDate = data.lastActivityDate.toDate();
                if (isSameDay(lastActivityDate, new Date())) {
                    questionsToday = data.questionsToday || 0;
                }
            }
        }
        
        streakCountDisplay.textContent = `${streak} Gün`;
        streakProgressText.textContent = `Bugünkü Hedef: ${questionsToday} / ${DAILY_GOAL}`;

        // Update card style based on streak
        if (streak > 0) {
            streakContainer.classList.remove('inactive');
        } else {
            streakContainer.classList.add('inactive');
        }

    } catch (error) {
        console.error("Error displaying streak: ", error);
        streakCountDisplay.textContent = 'Hata';
    }
};

const updateStreak = async (questionsAnswered) => {
    const statsRef = doc(db, 'userStats', 'main');
    const today = new Date();
    
    try {
        const docSnap = await getDoc(statsRef);
        let currentStreak = 0;
        let questionsToday = 0;
        let lastActivityDate = null;

        if (docSnap.exists()) {
            const data = docSnap.data();
            currentStreak = data.streak || 0;
            if (data.lastActivityDate) {
                lastActivityDate = data.lastActivityDate.toDate();
            }
            // Reset daily count if the last activity was before today
            if (lastActivityDate && !isSameDay(lastActivityDate, today)) {
                questionsToday = 0;
            } else {
                questionsToday = data.questionsToday || 0;
            }
        }

        questionsToday += questionsAnswered;

        // Check if goal was met for the first time today
        if (questionsToday >= DAILY_GOAL && (!lastActivityDate || !isSameDay(lastActivityDate, today))) {
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);

            if (lastActivityDate && isSameDay(lastActivityDate, yesterday)) {
                currentStreak++; // Increment streak
            } else {
                currentStreak = 1; // Start a new streak
            }
            
            // Only update lastActivityDate when the streak is earned
            await setDoc(statsRef, {
                streak: currentStreak,
                questionsToday: questionsToday,
                lastActivityDate: Timestamp.fromDate(today)
            }, { merge: true });

        } else {
            // Goal not met yet, or already met today, just update daily count
            await setDoc(statsRef, { questionsToday: questionsToday }, { merge: true });
        }

    } catch (error) {
        console.error("Error updating streak: ", error);
    }
};


// --- SVG Icons ---
const editIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
const deleteIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

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

// Global Random Review Event Listener
randomReviewBtn.addEventListener('click', async () => {
    // Show a loading state or disable the button
    randomReviewBtn.textContent = 'Notlar Yükleniyor...';
    randomReviewBtn.disabled = true;

    try {
        const allNotes = [];
        // 1. Get all units
        const unitsSnapshot = await getDocs(collection(db, 'units'));
        
        // 2. Create an array of promises to fetch notes from each unit
        const notesPromises = [];
        unitsSnapshot.forEach(unitDoc => {
            const unitId = unitDoc.id;
            notesPromises.push(getDocs(collection(db, `units/${unitId}/notes`)));
        });

        // 3. Wait for all note fetches to complete
        const allNotesSnapshots = await Promise.all(notesPromises);

        // 4. Combine all notes into a single array
        allNotesSnapshots.forEach((notesSnapshot, index) => {
            const unitId = unitsSnapshot.docs[index].id;
            notesSnapshot.forEach(doc => {
                allNotes.push({ id: doc.id, unitId: unitId, ...doc.data() });
            });
        });

        // 5. Take a random sample of 20 notes
        const randomNotes = allNotes.sort(() => 0.5 - Math.random()).slice(0, 20);

        // Reset button state and start the quiz
        randomReviewBtn.textContent = '20 Notluk Rastgele Test Başlat';
        randomReviewBtn.disabled = false;
        
        // We need to clear selectedUnitId so the quiz summary returns to the main page
        selectedUnitId = null;
        selectedUnitName = null;
        
        startQuizSession(randomNotes);

    } catch (error) {
        console.error("Error fetching notes for global review: ", error);
        randomReviewBtn.textContent = 'Hata Oluştu!';
    }
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
notesContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('batch-btn')) {
        const button = e.target;
        const type = button.dataset.type;
        const status = button.dataset.status;

        const notesRef = collection(db, `units/${selectedUnitId}/notes`);
        let notesQuery;

        if (type === 'critical') {
            notesQuery = query(notesRef, where('status', '==', 'Ezberlenmiş'), where('confidenceLevel', '<', 50));
        } else {
            notesQuery = query(notesRef, where('status', '==', status));
        }

        try {
            const snapshot = await getDocs(notesQuery);
            let notes = [];
            snapshot.forEach(doc => {
                notes.push({ id: doc.id, unitId: selectedUnitId, ...doc.data() });
            });

            if (type !== 'critical' && type !== 'all') {
                const limit = parseInt(type, 10);
                if (status === 'Ezberlenmiş') {
                    // Sort by lowest confidence for memorized notes
                    notes.sort((a, b) => a.confidenceLevel - b.confidenceLevel);
                } else {
                    // Random sort for unmemorized
                    notes.sort(() => 0.5 - Math.random());
                }
                notes = notes.slice(0, limit);
            }
            
            startQuizSession(notes);

        } catch (error) {
            console.error("Error fetching notes for batch review: ", error);
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
            await updateDoc(doc(db, `units/${selectedUnitId}/notes`, id), { noteText: newText });
        }
        closeEditModal();
    } catch (error) {
        console.error(`Error updating ${type}:`, error);
        alert('Güncelleme sırasında bir hata oluştu.');
    }
});


// --- Confidence Level Decay Logic ---

const checkAndUpdateConfidenceLevels = async (unitId) => {
    const notesRef = collection(db, `units/${unitId}/notes`);
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
            const docRef = doc(db, `units/${unitId}/notes`, noteId);

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
const getUnitStats = async (unitId) => {
    const notesRef = collection(db, `units/${unitId}/notes`);
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

// Delete Unit
const deleteUnit = async (unitId) => {
    if (!confirm('Bu üniteyi ve içindeki tüm notları silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) return;
    try {
        // First, delete all notes in the subcollection
        const notesSnapshot = await getDocs(collection(db, `units/${unitId}/notes`));
        const deleteBatch = writeBatch(db);
        notesSnapshot.forEach(doc => {
            deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
        
        // Then, delete the unit itself
        await deleteDoc(doc(db, 'units', unitId));
    } catch (error) {
        console.error("Error deleting unit: ", error);
        alert('Ünite silinirken bir hata oluştu.');
    }
};

// Delete Note
const deleteNote = async (noteId) => {
    if (!confirm('Bu notu silmek istediğinizden emin misiniz?')) return;
    try {
        await deleteDoc(doc(db, `units/${selectedUnitId}/notes`, noteId));
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

const updateNoteStatus = async (unitId, noteId, newStatus, newConfidence, newStats = null) => {
    if (!unitId || !noteId) return;

    const noteRef = doc(db, `units/${unitId}/notes`, noteId);
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

    const notesQuery = query(collection(db, `units/${unitId}/notes`));
    
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

            const markMemorizedBtn = noteElement.querySelector('.mark-memorized-btn');
            if (markMemorizedBtn) {
                markMemorizedBtn.addEventListener('click', () => {
                    // Reset stats when moving to memorized
                    updateNoteStatus(selectedUnitId, noteId, 'Ezberlenmiş', 100, { correct: 0, incorrect: 0 });
                });
            }

            const testBtn = noteElement.querySelector('.test-unmemorized-btn, .start-quiz-btn');
            if (testBtn) {
                testBtn.addEventListener('click', () => {
                    startQuizSession([{ id: noteId, unitId: selectedUnitId, ...note }]);
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

    if (noteText && category && selectedKeyword && selectedUnitId) {
        // Check if the selected keyword is actually in the note text
        if (!noteText.includes(selectedKeyword)) {
            alert('Lütfen not metninin içinden bir anahtar kelime seçin.');
            return;
        }

        try {
            await addDoc(collection(db, `units/${selectedUnitId}/notes`), {
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
    await checkAndUpdateConfidenceLevels(unitId);

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

const showUnitsView = () => {
    selectedUnitId = null;
    selectedUnitName = null;
    unitsContainer.style.display = 'block';
    notesContainer.style.display = 'none';
    quizContainer.style.display = 'none';
    if (unsubscribeNotes) {
        unsubscribeNotes();
        unsubscribeNotes = null;
    }
};

// --- Quiz Management ---

const displayCurrentQuizQuestion = async () => {
    if (currentQuizIndex >= quizQueue.length) {
        // Quiz is over
        await updateStreak(quizQueue.length); // Update streak with the number of questions answered
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
            if (selectedUnitId) {
                showNotesView(selectedUnitId, selectedUnitName);
            } else {
                showUnitsView();
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
    const categoryQuery = query(collection(db, `units/${noteToTest.unitId}/notes`), where('category', '==', noteToTest.category));
    const categorySnapshot = await getDocs(categoryQuery);
    categorySnapshot.forEach(doc => {
        const keyword = doc.data().keyword;
        if (distractors.size < 3 && keyword.toLowerCase() !== correctKeywordLower) {
            distractors.add(keyword);
        }
    });

    // 2. If not enough, get more from the entire unit
    if (distractors.size < 3) {
        const unitQuery = query(collection(db, `units/${noteToTest.unitId}/notes`));
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
            updateNoteStatus(correctNote.unitId, correctNote.id, 'Ezberlenmiş', 100);
        } else {
            const newCorrectCount = (correctNote.testCorrectCount || 0) + 1;
            const newIncorrectCount = correctNote.testIncorrectCount || 0;
            updateNoteStatus(correctNote.unitId, correctNote.id, 'Ezberlenmemiş', 0, { correct: newCorrectCount, incorrect: newIncorrectCount });
        }
    } else {
        quizFeedback.textContent = `Yanlış. Doğru cevap: ${correctNote.keyword}.`;
        quizFeedback.className = 'incorrect';
        quizQueue[currentQuizIndex].correct = false;

        if (correctNote.status === 'Ezberlenmiş') {
            const newConfidence = Math.max(0, correctNote.confidenceLevel - 25);
            updateNoteStatus(correctNote.unitId, correctNote.id, 'Ezberlenmiş', newConfidence);
        } else {
            const newCorrectCount = correctNote.testCorrectCount || 0;
            const newIncorrectCount = (correctNote.testIncorrectCount || 0) + 1;
            updateNoteStatus(correctNote.unitId, correctNote.id, 'Ezberlenmemiş', 0, { correct: newCorrectCount, incorrect: newIncorrectCount });
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


backToUnitsBtn.addEventListener('click', showUnitsView);

// --- UI Rendering ---

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
        deleteUnit(unitId);
    });

    unitElement.querySelector('.edit-unit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal('unit', unitId, unit);
    });

    unitsListDiv.appendChild(unitElement);

    // Asynchronously fetch stats and update the card
    getUnitStats(unitId).then(stats => {
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

const displayUnits = () => {
    const unitsCollection = collection(db, 'units');
    onSnapshot(unitsCollection, (snapshot) => {
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

addUnitBtn.addEventListener('click', async () => {
    const unitName = unitNameInput.value.trim();
    if (unitName) {
        try {
            await addDoc(collection(db, 'units'), {
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
const initializeApp = () => {
    displayUnits();
    showUnitsView();
    displayStreak();
};

// --- Initial Load ---
initializeApp();
